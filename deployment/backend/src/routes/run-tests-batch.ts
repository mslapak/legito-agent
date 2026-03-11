import { Router, Request, Response } from 'express';
import { query } from '../db';

export const runTestsBatchRouter = Router();

const BROWSER_USE_API_URL = 'https://api.browser-use.com/api/v2';

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Evaluate test result (legacy fallback)
function evaluateTestResult(resultSummary: string, expectedResult: string | null): { status: 'passed' | 'failed'; reasoning: string } {
  if (!expectedResult || expectedResult.trim() === '') {
    return { status: 'passed', reasoning: 'Test dokončen bez definovaného očekávaného výsledku.' };
  }
  const result = resultSummary.toLowerCase().trim();
  const strongSuccess = ['test was successful', 'successfully completed', 'test passed', 'verification successful']
    .some(p => result.includes(p));
  const criticalFail = ['timeout', 'test failed', 'task failed', 'could not complete', 'error occurred']
    .some(p => result.includes(p));

  if (strongSuccess) return { status: 'passed', reasoning: 'Výsledek obsahuje indikátor úspěchu.' };
  if (criticalFail) return { status: 'failed', reasoning: `Kritické selhání. Skutečný výsledek: "${resultSummary.substring(0, 100)}"` };

  const keywords = expectedResult.toLowerCase().split(/[\s,;.!?]+/).filter(w => w.length > 3);
  const matched = keywords.filter(kw => result.includes(kw));
  const ratio = keywords.length > 0 ? matched.length / keywords.length : 0;

  if (ratio >= 0.5) return { status: 'passed', reasoning: `${Math.round(ratio * 100)}% klíčových slov nalezeno.` };
  return { status: 'failed', reasoning: `Pouze ${Math.round(ratio * 100)}% klíčových slov. Očekáváno: "${expectedResult.substring(0, 100)}"` };
}

// Evidence-based evaluation via Azure OpenAI (mirrors evaluate-test edge function)
async function evaluateWithEvidenceBundle(
  expectedResult: string | null,
  evidenceBundle: Record<string, unknown>
): Promise<{ finalStatus: string; evaluationDetails: Record<string, unknown> | null; confidenceScore: number | null; finalScore: number | null; reasoning: string }> {
  const { callAIWithTools } = await import('../utils/ai');

  if (!expectedResult || expectedResult.trim() === '') {
    return {
      finalStatus: 'passed',
      evaluationDetails: { final_status: 'passed', final_score: 1.0, confidence: 0.7, reasoning: ['Test completed without expected result'] },
      confidenceScore: 0.7,
      finalScore: 1.0,
      reasoning: 'Test completed without expected result',
    };
  }

  try {
    // Extract requirements via AI
    const reqResult = await callAIWithTools(
      'Extract testable requirements from the expected result. Use types: url_match, text_presence, element_exists, no_errors, custom.',
      `Extract requirements from: "${expectedResult}"`,
      [{
        type: 'function',
        function: {
          name: 'extract_requirements',
          parameters: {
            type: 'object',
            properties: {
              requirements: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string', enum: ['url_match', 'text_presence', 'element_exists', 'no_errors', 'custom'] },
                    description: { type: 'string' },
                    value: { type: 'string' },
                  },
                  required: ['id', 'type', 'description'],
                },
              },
            },
            required: ['requirements'],
          },
        },
      }],
      { type: 'function', function: { name: 'extract_requirements' } },
      0.3
    ) as { requirements?: Array<{ id: string; type: string; description: string; value?: string }> };

    const requirements = (reqResult as any)?.requirements || [{ id: 'R1', type: 'custom', description: expectedResult, value: expectedResult }];
    const evidence = (evidenceBundle as any)?.evidence || {};
    const outputText = (evidence.output_text || '').toLowerCase();
    const stepText = (evidence.step_summaries || []).join(' ').toLowerCase();
    const allText = `${outputText} ${stepText}`;

    // Deterministic validation
    const results = requirements.map((req: any) => {
      if (req.type === 'text_presence' && req.value) {
        return { id: req.id, status: allText.includes(req.value.toLowerCase()) ? 'passed' : 'unknown', source: 'deterministic' };
      }
      if (req.type === 'url_match' && req.value && evidence.final_url) {
        return { id: req.id, status: evidence.final_url.toLowerCase().includes(req.value.toLowerCase()) ? 'passed' : 'failed', source: 'deterministic' };
      }
      if (req.type === 'no_errors') {
        return { id: req.id, status: (evidence.console_errors || 0) === 0 ? 'passed' : 'failed', source: 'deterministic' };
      }
      return { id: req.id, status: 'unknown', source: 'deterministic' };
    });

    const passed = results.filter((r: any) => r.status === 'passed').length;
    const failed = results.filter((r: any) => r.status === 'failed').length;
    const total = results.length;
    const score = total > 0 ? passed / total : 0.5;

    let finalStatus = score >= 0.8 ? 'passed' : score >= 0.6 ? 'degraded' : 'failed';
    if (failed > 0 && passed === 0) finalStatus = 'failed';

    return {
      finalStatus,
      evaluationDetails: { requirements: results, final_score: score, confidence: score, final_status: finalStatus, reasoning: results.map((r: any) => `${r.status === 'passed' ? '✔' : '✗'} ${r.id}`) },
      confidenceScore: score,
      finalScore: score,
      reasoning: `Score: ${Math.round(score * 100)}% (${passed}/${total} requirements passed)`,
    };
  } catch (e) {
    console.error('Evidence evaluation error:', e);
    const fallback = evaluateTestResult(expectedResult, expectedResult);
    return { finalStatus: fallback.status, evaluationDetails: null, confidenceScore: null, finalScore: null, reasoning: fallback.reasoning };
  }
}

// Self-invoke for next phase
async function scheduleSelfInvoke(body: Record<string, unknown>, delayMs: number): Promise<void> {
  const selfUrl = process.env.SELF_URL || `http://localhost:${process.env.PORT || 3001}`;
  try {
    if (delayMs > 0) await delay(delayMs);
    await fetch(`${selfUrl}/api/internal/run-tests-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error('Self-invoke error:', error);
  }
}

// Stop session resilient
async function stopSessionResilient(sessionId: string, apiKey: string): Promise<void> {
  const headers = { 'X-Browser-Use-API-Key': apiKey, 'Content-Type': 'application/json' };
  for (const [method, url] of [
    ['PATCH', `${BROWSER_USE_API_URL}/sessions/${sessionId}`],
    ['PUT', `${BROWSER_USE_API_URL}/sessions/${sessionId}/stop`],
    ['POST', `${BROWSER_USE_API_URL}/sessions/${sessionId}/stop`],
  ] as const) {
    try {
      const r = await fetch(url, {
        method, headers,
        ...(method === 'PATCH' ? { body: JSON.stringify({ action: 'stop' }) } : {}),
      });
      if (r.ok) return;
    } catch { /* continue */ }
  }
}

runTestsBatchRouter.post('/', async (req: Request, res: Response) => {
  try {
    const BROWSER_USE_API_KEY = process.env.BROWSER_USE_API_KEY;
    if (!BROWSER_USE_API_KEY) return res.status(500).json({ error: 'BROWSER_USE_API_KEY not configured' });

    const {
      batchId, testIds, userId: bodyUserId, batchDelaySeconds,
      currentIndex, isRecursiveCall, phase,
      taskRecordId, browserTaskId, sessionId, recordVideo, expectedResult,
    } = req.body;

    const userId = req.userId || bodyUserId;
    if (!batchId || !testIds || !userId) {
      return res.status(400).json({ error: 'Missing required fields: batchId, testIds, userId' });
    }

    const index = currentIndex || 0;
    const effectiveDelay = batchDelaySeconds || 10;
    const headers = { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY, 'Content-Type': 'application/json' };

    // ---- INITIAL CALL ----
    if (!isRecursiveCall) {
      // Check for active batches
      const { rows: active } = await query(
        `SELECT id FROM test_batch_runs WHERE user_id = $1 AND status IN ('pending', 'running') AND id != $2`,
        [userId, batchId]
      );
      if (active.length > 0) {
        return res.status(409).json({ error: 'Již běží jiný batch run.', runningBatchId: active[0].id });
      }

      await query(
        `UPDATE test_batch_runs SET status = 'running', started_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [batchId]
      );

      // Fire and forget: start first test
      scheduleSelfInvoke({ batchId, testIds, userId, batchDelaySeconds: effectiveDelay, currentIndex: 0, phase: 'start', isRecursiveCall: true }, 100);

      return res.json({ success: true, message: 'Batch started', batchId, totalTests: testIds.length });
    }

    // ---- ALL DONE ----
    if (index >= testIds.length) {
      await query(
        `UPDATE test_batch_runs SET status = 'completed', completed_at = NOW(), current_test_id = NULL WHERE id = $1`,
        [batchId]
      );
      return res.json({ success: true, message: 'Batch completed' });
    }

    const testId = testIds[index];

    // ---- POLL PHASE ----
    if (phase === 'poll' && taskRecordId && browserTaskId) {
      // Update heartbeat
      await query(`UPDATE test_batch_runs SET updated_at = NOW() WHERE id = $1`, [batchId]);

      // Check batch status
      const { rows: [batch] } = await query(
        `SELECT paused, status, completed_tests, passed_tests, failed_tests FROM test_batch_runs WHERE id = $1`,
        [batchId]
      );
      if (batch?.status === 'cancelled') {
        if (sessionId) await stopSessionResilient(sessionId, BROWSER_USE_API_KEY);
        return res.json({ success: true, message: 'Batch cancelled' });
      }
      if (batch?.paused) {
        scheduleSelfInvoke({ batchId, testIds, userId, batchDelaySeconds: effectiveDelay, currentIndex: index, phase: 'poll', isRecursiveCall: true, taskRecordId, browserTaskId, sessionId, recordVideo, expectedResult }, 10000);
        return res.json({ success: true, message: 'Batch paused' });
      }

      // Poll provider
      try {
        const statusRes = await fetch(`${BROWSER_USE_API_URL}/tasks/${browserTaskId}`, { headers });
        if (!statusRes.ok) {
          scheduleSelfInvoke({ batchId, testIds, userId, batchDelaySeconds: effectiveDelay, currentIndex: index, phase: 'poll', isRecursiveCall: true, taskRecordId, browserTaskId, sessionId, recordVideo, expectedResult }, 10000);
          return res.json({ success: true, message: 'Poll failed, retrying' });
        }

        const statusData = await statusRes.json();
        if (['finished', 'failed', 'stopped'].includes(statusData.status)) {
          if (sessionId) await stopSessionResilient(sessionId, BROWSER_USE_API_KEY);
          await delay(5000);

          const resultSummary = statusData.output || statusData.result || '';
          const steps = statusData.steps || [];
          const evaluation = evaluateTestResult(resultSummary, expectedResult);
          const finalStatus = statusData.status === 'failed' ? 'error' : evaluation.status;

          // Get started_at for execution time
          const { rows: [taskStart] } = await query(`SELECT started_at FROM tasks WHERE id = $1`, [taskRecordId]);
          const startedAt = taskStart?.started_at ? new Date(taskStart.started_at).getTime() : Date.now();
          const executionTimeMs = Date.now() - startedAt;
          const stepCount = Array.isArray(steps) ? steps.length : 0;
          const execMinutes = executionTimeMs / 60000;
          const proxyRate = recordVideo ? 0.008 : 0.004;
          const estimatedCost = 0.01 + (stepCount * 0.01) + (execMinutes * proxyRate);

          // Update task + generated_tests
          await query(
            `UPDATE tasks SET status = $1, completed_at = NOW(), result = $2, step_count = $3 WHERE id = $4`,
            [finalStatus === 'error' ? 'failed' : 'completed', JSON.stringify({ output: resultSummary, reasoning: evaluation.reasoning }), stepCount, taskRecordId]
          );
          await query(
            `UPDATE generated_tests SET status = $1, last_run_at = NOW(), execution_time_ms = $2, result_summary = $3, result_reasoning = $4, step_count = $5, estimated_cost = $6 WHERE id = $7`,
            [finalStatus, executionTimeMs, resultSummary || null, evaluation.reasoning, stepCount, estimatedCost, testId]
          );

          // Update batch progress
          const completedTests = (batch?.completed_tests || 0) + 1;
          const passedTests = (batch?.passed_tests || 0) + (finalStatus === 'passed' ? 1 : 0);
          const failedTests = (batch?.failed_tests || 0) + (finalStatus !== 'passed' ? 1 : 0);

          await query(
            `UPDATE test_batch_runs SET completed_tests = $1, passed_tests = $2, failed_tests = $3, updated_at = NOW() WHERE id = $4`,
            [completedTests, passedTests, failedTests, batchId]
          );

          // Next test or complete
          if (index + 1 < testIds.length) {
            scheduleSelfInvoke({ batchId, testIds, userId, batchDelaySeconds: effectiveDelay, currentIndex: index + 1, phase: 'start', isRecursiveCall: true }, effectiveDelay * 1000);
          } else {
            await query(`UPDATE test_batch_runs SET status = 'completed', completed_at = NOW(), current_test_id = NULL WHERE id = $1`, [batchId]);
          }

          return res.json({ success: true, status: finalStatus, completed: completedTests });
        }

        // Still running
        scheduleSelfInvoke({ batchId, testIds, userId, batchDelaySeconds: effectiveDelay, currentIndex: index, phase: 'poll', isRecursiveCall: true, taskRecordId, browserTaskId, sessionId, recordVideo, expectedResult }, 10000);
        return res.json({ success: true, message: 'Still running' });

      } catch (error) {
        scheduleSelfInvoke({ batchId, testIds, userId, batchDelaySeconds: effectiveDelay, currentIndex: index, phase: 'poll', isRecursiveCall: true, taskRecordId, browserTaskId, sessionId, recordVideo, expectedResult }, 10000);
        return res.json({ success: false, error: 'Poll error' });
      }
    }

    // ---- START PHASE ----
    await query(`UPDATE test_batch_runs SET updated_at = NOW(), current_test_id = $1 WHERE id = $2`, [testId, batchId]);

    // Claim test
    const { rows: claimed } = await query(
      `UPDATE generated_tests SET status = 'running', last_run_at = NOW() WHERE id = $1 AND status != 'running' RETURNING id`,
      [testId]
    );
    if (claimed.length === 0) {
      return res.json({ success: true, message: 'Already claimed', skipped: true });
    }

    // Fetch test details
    const { rows: [test] } = await query(`SELECT * FROM generated_tests WHERE id = $1`, [testId]);
    if (!test) {
      await query(`UPDATE generated_tests SET status = 'error', result_summary = 'Test not found' WHERE id = $1`, [testId]);
      scheduleSelfInvoke({ batchId, testIds, userId, batchDelaySeconds: effectiveDelay, currentIndex: index + 1, phase: 'start', isRecursiveCall: true }, effectiveDelay * 1000);
      return res.json({ success: false, error: 'Test not found' });
    }

    // Build prompt
    let setupPrompt = '', baseUrl = '', browserProfileId: string | null = null;
    let maxStepsVal = 10, recordVideoVal = true;
    let credentials = '';

    if (test.project_id) {
      const { rows: [project] } = await query(
        `SELECT setup_prompt, base_url, browser_profile_id, max_steps, record_video FROM projects WHERE id = $1`, [test.project_id]);
      if (project) {
        setupPrompt = project.setup_prompt || '';
        baseUrl = project.base_url || '';
        browserProfileId = project.browser_profile_id || null;
        maxStepsVal = project.max_steps ?? 10;
        recordVideoVal = project.record_video ?? true;
      }
      const { rows: creds } = await query(
        `SELECT username, password, description FROM project_credentials WHERE project_id = $1`, [test.project_id]);
      if (creds.length > 0) {
        credentials = creds.map((c: any) => `Credentials${c.description ? ` (${c.description})` : ''}: username="${c.username}", password="${c.password}"`).join('\n');
      }
    }

    let fullPrompt = test.prompt;
    if (baseUrl) fullPrompt = `Naviguj na ${baseUrl}\n\n${fullPrompt}`;
    if (setupPrompt) fullPrompt = `${setupPrompt}\n\nNásledně proveď test:\n${fullPrompt}`;
    if (credentials) fullPrompt = `${fullPrompt}\n\n${credentials}`;
    if (test.expected_result) fullPrompt = `${fullPrompt}\n\nOčekávaný výsledek: ${test.expected_result}`;

    // Create browser-use session + task
    let buSessionId: string | null = null;
    let buTaskId: string | null = null;

    try {
      if (browserProfileId) {
        const sRes = await fetch(`${BROWSER_USE_API_URL}/sessions`, {
          method: 'POST', headers,
          body: JSON.stringify({ profileId: browserProfileId, profile_id: browserProfileId }),
        });
        if (sRes.ok) {
          const sData = await sRes.json();
          buSessionId = sData.id || sData.sessionId;
        }
      }

      const taskPayload: Record<string, unknown> = {
        task: fullPrompt, save_browser_data: true, record_video: recordVideoVal, max_steps: maxStepsVal,
      };
      if (buSessionId) { taskPayload.sessionId = buSessionId; taskPayload.session_id = buSessionId; }
      else if (browserProfileId) { taskPayload.profile_id = browserProfileId; taskPayload.profileId = browserProfileId; }

      const createRes = await fetch(`${BROWSER_USE_API_URL}/tasks`, { method: 'POST', headers, body: JSON.stringify(taskPayload) });
      if (!createRes.ok) throw new Error(`Failed to create task: ${createRes.status}`);
      const createData = await createRes.json();
      buTaskId = createData.id;
    } catch (e) {
      await query(`UPDATE generated_tests SET status = 'error', result_summary = $1 WHERE id = $2`, [`Task creation failed: ${e}`, testId]);
      scheduleSelfInvoke({ batchId, testIds, userId, batchDelaySeconds: effectiveDelay, currentIndex: index + 1, phase: 'start', isRecursiveCall: true }, effectiveDelay * 1000);
      return res.json({ success: false, error: 'Failed to create task' });
    }

    // Create DB task record
    const { rows: [taskRecord] } = await query(
      `INSERT INTO tasks (user_id, project_id, title, prompt, status, browser_use_task_id, started_at, task_type) VALUES ($1, $2, $3, $4, 'running', $5, NOW(), 'test') RETURNING *`,
      [userId, test.project_id, test.title, fullPrompt, buTaskId]
    );

    await query(`UPDATE generated_tests SET task_id = $1 WHERE id = $2`, [taskRecord.id, testId]);

    // Schedule poll
    scheduleSelfInvoke({
      batchId, testIds, userId, batchDelaySeconds: effectiveDelay, currentIndex: index,
      phase: 'poll', isRecursiveCall: true,
      taskRecordId: taskRecord.id, browserTaskId: buTaskId, sessionId: buSessionId,
      recordVideo: recordVideoVal, expectedResult: test.expected_result,
    }, 10000);

    return res.json({ success: true, message: 'Task launched', taskRecordId: taskRecord.id });

  } catch (error) {
    console.error('Error in run-tests-batch:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
