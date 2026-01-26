import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BROWSER_USE_API_KEY = Deno.env.get("BROWSER_USE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resilient session stop - tries multiple methods
async function stopSessionResilient(sessionId: string, batchId: string): Promise<void> {
  console.log(`[Batch ${batchId}] Stopping session resilient: ${sessionId}`);
  
  // Method 1: PATCH with action stop
  try {
    const res1 = await fetch(`https://api.browser-use.com/api/v2/sessions/${sessionId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Browser-Use-API-Key": BROWSER_USE_API_KEY!,
      },
      body: JSON.stringify({ action: "stop" }),
    });
    console.log(`[Batch ${batchId}] PATCH stop response: ${res1.status}`);
    if (res1.ok) return;
  } catch (e) {
    console.log(`[Batch ${batchId}] PATCH stop error:`, e);
  }
  
  // Method 2: PUT /sessions/{id}/stop
  try {
    const res2 = await fetch(`https://api.browser-use.com/api/v2/sessions/${sessionId}/stop`, {
      method: "PUT",
      headers: {
        "X-Browser-Use-API-Key": BROWSER_USE_API_KEY!,
      },
    });
    console.log(`[Batch ${batchId}] PUT stop response: ${res2.status}`);
    if (res2.ok) return;
  } catch (e) {
    console.log(`[Batch ${batchId}] PUT stop error:`, e);
  }
  
  // Method 3: POST stop
  try {
    const res3 = await fetch(`https://api.browser-use.com/api/v2/sessions/${sessionId}/stop`, {
      method: "POST",
      headers: {
        "X-Browser-Use-API-Key": BROWSER_USE_API_KEY!,
      },
    });
    console.log(`[Batch ${batchId}] POST stop response: ${res3.status}`);
  } catch (e) {
    console.log(`[Batch ${batchId}] POST stop error:`, e);
  }
}

// Evaluate test result against expected result
function evaluateTestResult(resultSummary: string, expectedResult: string | null): { status: 'passed' | 'failed', reasoning: string } {
  if (!expectedResult || expectedResult.trim() === '') {
    return { status: 'passed', reasoning: 'Test dokončen bez definovaného očekávaného výsledku.' };
  }

  const result = resultSummary.toLowerCase().trim();
  const expected = expectedResult.toLowerCase().trim();

  const strongSuccessPatterns = [
    'the test of', 'test was successful', 'test completed successfully',
    'all steps completed', 'verification successful', 'was successful',
    'successfully completed', 'successfully verified', 'test passed'
  ];
  const hasStrongSuccess = strongSuccessPatterns.some(pattern => result.includes(pattern));

  const falsePositiveContexts = [
    'was not displayed during this session',
    'was not shown during this session',
    'not displayed, so no action',
    'was not displayed so no action',
    'not shown, so no action',
    'was not shown so no action',
    'not displayed (expected)',
    'was not needed',
    'nebyl zobrazen, takže',
    'nebyla zobrazena, takže'
  ];
  const hasFalsePositiveContext = falsePositiveContexts.some(ctx => result.includes(ctx));

  const criticalFailurePatterns = [
    'timeout', 
    'test failed',
    'task failed',
    'could not complete',
    'error occurred',
    'exception thrown',
    'did not complete the task',
    'unable to complete',
    'nebyl dokončen',
    'test selhal',
    'úloha selhala'
  ];
  
  const hasCriticalFailure = !hasStrongSuccess && 
    !hasFalsePositiveContext && 
    criticalFailurePatterns.some(pattern => result.includes(pattern));

  const failureIndicators = ['error', 'failed', 'not found', 'exception', 'chyba', 'selhalo', 'nenalezeno', 'neúspěch'];
  const hasFailureIndicator = !hasStrongSuccess && 
    !hasFalsePositiveContext && 
    failureIndicators.some(ind => result.includes(ind));

  const successIndicators = ['success', 'passed', 'verified', 'confirmed', 'úspěch', 'ověřeno', 'potvrzeno', 'successful'];
  const hasSuccessIndicator = successIndicators.some(ind => result.includes(ind));

  if (hasStrongSuccess || (hasSuccessIndicator && hasFalsePositiveContext)) {
    const keywords = expected
      .split(/[\s,;.!?]+/)
      .filter(word => word.length > 3)
      .filter(word => !['should', 'must', 'will', 'that', 'this', 'with', 'from', 'have', 'been', 'mělo', 'musí', 'bude', 'tento', 'tato', 'které', 'result', 'expected', 'displayed'].includes(word));
    const matchedKeywords = keywords.filter(kw => result.includes(kw));
    const matchRatio = keywords.length > 0 ? matchedKeywords.length / keywords.length : 1;
    
    return { 
      status: 'passed', 
      reasoning: `Výsledek obsahuje silný indikátor úspěchu a ${Math.round(matchRatio * 100)}% klíčových slov.` 
    };
  }

  if (hasCriticalFailure) {
    return { 
      status: 'failed', 
      reasoning: `Výsledek obsahuje kritický indikátor selhání. Očekáváno: "${expectedResult.substring(0, 100)}". Skutečný výsledek: "${resultSummary.substring(0, 100)}".` 
    };
  }

  const keywords = expected
    .split(/[\s,;.!?]+/)
    .filter(word => word.length > 3)
    .filter(word => !['should', 'must', 'will', 'that', 'this', 'with', 'from', 'have', 'been', 'mělo', 'musí', 'bude', 'tento', 'tato', 'které', 'result', 'expected', 'displayed'].includes(word));

  const matchedKeywords = keywords.filter(kw => result.includes(kw));
  const matchRatio = keywords.length > 0 ? matchedKeywords.length / keywords.length : 0;

  if (hasFailureIndicator) {
    return { 
      status: 'failed', 
      reasoning: `Výsledek obsahuje indikátor selhání. Očekáváno: "${expectedResult.substring(0, 100)}". Skutečný výsledek: "${resultSummary.substring(0, 100)}".` 
    };
  }

  if (hasSuccessIndicator && matchRatio >= 0.3) {
    return { 
      status: 'passed', 
      reasoning: `Výsledek obsahuje indikátor úspěchu a ${Math.round(matchRatio * 100)}% klíčových slov.` 
    };
  }

  if (matchRatio >= 0.5) {
    return { 
      status: 'passed', 
      reasoning: `${Math.round(matchRatio * 100)}% klíčových slov z očekávaného výsledku nalezeno ve výsledku testu.` 
    };
  }

  return { 
    status: 'failed', 
    reasoning: `Pouze ${Math.round(matchRatio * 100)}% klíčových slov z očekávaného výsledku nalezeno. Očekáváno: "${expectedResult.substring(0, 100)}". Skutečný výsledek: "${resultSummary.substring(0, 100)}".` 
  };
}

// Self-invoke for next phase or next test
async function scheduleSelfInvoke(
  body: Record<string, unknown>,
  delayMs: number,
  logPrefix: string
): Promise<void> {
  const functionUrl = `${SUPABASE_URL}/functions/v1/run-tests-batch`;
  
  console.log(`${logPrefix} Scheduling self-invoke in ${delayMs / 1000}s with phase=${body.phase || 'start'}`);
  
  try {
    if (delayMs > 0) {
      await delay(delayMs);
    }
    
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${logPrefix} Failed to schedule self-invoke:`, errorText);
    } else {
      console.log(`${logPrefix} Self-invoke scheduled successfully`);
    }
  } catch (error) {
    console.error(`${logPrefix} Error scheduling self-invoke:`, error);
  }
}

// ================== PHASE: START ==================
// Creates browser session/task, saves task_id IMMEDIATELY, then schedules poll phase
async function phaseStart(
  batchId: string,
  testId: string,
  testIndex: number,
  testIds: string[],
  userId: string,
  batchDelaySeconds: number
): Promise<Response> {
  const logPrefix = `[Batch ${batchId}][START][${testIndex + 1}/${testIds.length}]`;
  console.log(`${logPrefix} Starting test ${testId}`);
  
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  
  // Heartbeat: update batch updated_at
  await supabase
    .from("test_batch_runs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", batchId);
  
  // ATOMIC CLAIM: Only succeed if test is not already running
  const { data: claimResult, error: claimError } = await supabase
    .from("generated_tests")
    .update({
      status: "running",
      last_run_at: new Date().toISOString(),
    })
    .eq("id", testId)
    .neq("status", "running")
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error(`${logPrefix} Claim error:`, claimError);
    return new Response(
      JSON.stringify({ success: false, error: "Claim error", phase: "start" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!claimResult) {
    console.log(`${logPrefix} Claim SKIPPED (already running or claimed)`);
    return new Response(
      JSON.stringify({ success: true, message: "Already claimed", phase: "start", skipped: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`${logPrefix} Claim SUCCESS`);
  
  // Update batch current_test_id
  await supabase
    .from("test_batch_runs")
    .update({ current_test_id: testId })
    .eq("id", batchId);
  
  // Fetch test details
  const { data: test, error: testError } = await supabase
    .from("generated_tests")
    .select("*")
    .eq("id", testId)
    .single();

  if (testError || !test) {
    console.error(`${logPrefix} Test not found`);
    await supabase
      .from("generated_tests")
      .update({ status: "error", result_summary: "Test not found" })
      .eq("id", testId);
    
    // Schedule next test
    // @ts-ignore
    EdgeRuntime.waitUntil(scheduleSelfInvoke({
      batchId, testIds, userId, batchDelaySeconds,
      currentIndex: testIndex + 1,
      phase: "start",
      isRecursiveCall: true,
    }, batchDelaySeconds * 1000, logPrefix));
    
    return new Response(
      JSON.stringify({ success: false, error: "Test not found", phase: "start" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Build prompt
  let setupPrompt = "";
  let baseUrl = "";
  let credentials = "";
  let browserProfileId: string | null = null;
  let maxSteps = 10;
  let recordVideo = true;

  if (test.project_id) {
    const { data: project } = await supabase
      .from("projects")
      .select("setup_prompt, base_url, browser_profile_id, max_steps, record_video, batch_delay_seconds")
      .eq("id", test.project_id)
      .single();

    if (project) {
      setupPrompt = project.setup_prompt || "";
      baseUrl = project.base_url || "";
      browserProfileId = project.browser_profile_id || null;
      maxSteps = project.max_steps ?? 10;
      recordVideo = project.record_video ?? true;
    }

    const { data: creds } = await supabase
      .from("project_credentials")
      .select("username, password, description")
      .eq("project_id", test.project_id);

    if (creds && creds.length > 0) {
      credentials = creds
        .map((c) =>
          `Credentials${c.description ? ` (${c.description})` : ""}: username="${c.username}", password="${c.password}"`
        )
        .join("\n");
    }
  }

  let fullPrompt = test.prompt;
  if (baseUrl) {
    fullPrompt = `Naviguj na ${baseUrl}\n\n${fullPrompt}`;
  }
  if (setupPrompt) {
    fullPrompt = `${setupPrompt}\n\nNásledně proveď test:\n${fullPrompt}`;
  }
  if (credentials) {
    fullPrompt = `${fullPrompt}\n\n${credentials}`;
  }
  if (test.expected_result) {
    fullPrompt = `${fullPrompt}\n\nOčekávaný výsledek: ${test.expected_result}`;
  }

  console.log(`${logPrefix} Creating browser-use task${browserProfileId ? ` with profile ${browserProfileId}` : ''}`);
  
  // Create session and task
  let sessionId: string | null = null;
  let browserTaskId: string | null = null;
  
  const maxCreateRetries = 4;
  const retryDelays = [20000, 40000, 60000, 90000];
  
  for (let createAttempt = 1; createAttempt <= maxCreateRetries; createAttempt++) {
    console.log(`${logPrefix} Task creation attempt ${createAttempt}/${maxCreateRetries}`);
    
    try {
      const sessionPayload: Record<string, unknown> = {};
      if (browserProfileId) {
        sessionPayload.profileId = browserProfileId;
        sessionPayload.profile_id = browserProfileId;
      }
      
      const sessionRes = await fetch("https://api.browser-use.com/api/v2/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Browser-Use-API-Key": BROWSER_USE_API_KEY!,
        },
        body: JSON.stringify(sessionPayload),
      });
      
      const sessionRaw = await sessionRes.text();
      console.log(`${logPrefix} Session create response: ${sessionRes.status}`);
      
      if (sessionRes.ok) {
        const sessionData = JSON.parse(sessionRaw);
        sessionId = sessionData.id || sessionData.sessionId || sessionData.session_id;
        console.log(`${logPrefix} Created session: ${sessionId}`);
      } else if (sessionRaw.includes("Too many concurrent")) {
        console.log(`${logPrefix} Session creation hit concurrency limit`);
        if (createAttempt < maxCreateRetries) {
          console.log(`${logPrefix} Waiting ${retryDelays[createAttempt - 1] / 1000}s before retry...`);
          await delay(retryDelays[createAttempt - 1]);
          continue;
        }
      }
    } catch (e) {
      console.error(`${logPrefix} Error creating session:`, e);
    }
    
    // Create the task
    const taskPayload: Record<string, unknown> = {
      task: fullPrompt,
      save_browser_data: true,
      record_video: recordVideo,
      max_steps: maxSteps,
    };
    
    if (sessionId) {
      taskPayload.sessionId = sessionId;
      taskPayload.session_id = sessionId;
    } else if (browserProfileId) {
      taskPayload.profile_id = browserProfileId;
      taskPayload.profileId = browserProfileId;
    }
    
    const createResponse = await fetch("https://api.browser-use.com/api/v2/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Browser-Use-API-Key": BROWSER_USE_API_KEY!,
      },
      body: JSON.stringify(taskPayload),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error(`${logPrefix} Failed to create task: ${errorText}`);
      
      if (errorText.includes("Too many concurrent") && createAttempt < maxCreateRetries) {
        if (sessionId) {
          await stopSessionResilient(sessionId, batchId);
          sessionId = null;
        }
        console.log(`${logPrefix} Waiting ${retryDelays[createAttempt - 1] / 1000}s before retry...`);
        await delay(retryDelays[createAttempt - 1]);
        continue;
      }
      
      // Final failure
      await supabase
        .from("generated_tests")
        .update({ status: "error", result_summary: `Failed to create task: ${errorText.substring(0, 200)}` })
        .eq("id", testId);
      
      // Schedule next test
      // @ts-ignore
      EdgeRuntime.waitUntil(scheduleSelfInvoke({
        batchId, testIds, userId, batchDelaySeconds,
        currentIndex: testIndex + 1,
        phase: "start",
        isRecursiveCall: true,
      }, batchDelaySeconds * 1000, logPrefix));
      
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create task", phase: "start" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const createData = await createResponse.json();
    browserTaskId = createData.id;
    
    if (!sessionId) {
      const taskSessionId = createData.sessionId || createData.session_id;
      if (taskSessionId) {
        sessionId = taskSessionId;
      }
    }

    if (browserTaskId) {
      console.log(`${logPrefix} Browser-use task created: ${browserTaskId}`);
      break;
    }
  }
  
  if (!browserTaskId) {
    console.error(`${logPrefix} Failed to create task after all retries`);
    await supabase
      .from("generated_tests")
      .update({ status: "error", result_summary: "Failed to create browser task after retries" })
      .eq("id", testId);
    
    // @ts-ignore
    EdgeRuntime.waitUntil(scheduleSelfInvoke({
      batchId, testIds, userId, batchDelaySeconds,
      currentIndex: testIndex + 1,
      phase: "start",
      isRecursiveCall: true,
    }, batchDelaySeconds * 1000, logPrefix));
    
    return new Response(
      JSON.stringify({ success: false, error: "No task ID", phase: "start" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Create task record in DB
  const { data: taskRecord, error: taskError2 } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      project_id: test.project_id,
      title: test.title,
      prompt: fullPrompt,
      status: "running",
      browser_use_task_id: browserTaskId,
      started_at: new Date().toISOString(),
      task_type: "test",
    })
    .select()
    .single();

  if (taskError2 || !taskRecord) {
    console.error(`${logPrefix} Failed to create task record:`, taskError2);
    await supabase
      .from("generated_tests")
      .update({ status: "error", result_summary: `Failed to create DB task: ${taskError2?.message}` })
      .eq("id", testId);
    
    // @ts-ignore
    EdgeRuntime.waitUntil(scheduleSelfInvoke({
      batchId, testIds, userId, batchDelaySeconds,
      currentIndex: testIndex + 1,
      phase: "start",
      isRecursiveCall: true,
    }, batchDelaySeconds * 1000, logPrefix));
    
    return new Response(
      JSON.stringify({ success: false, error: "Failed to create task record", phase: "start" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`${logPrefix} Task record created: ${taskRecord.id}`);

  // *** CRITICAL FIX: IMMEDIATELY update task_id on generated_tests ***
  // This prevents frontend from resetting status to 'pending'
  await supabase
    .from("generated_tests")
    .update({ task_id: taskRecord.id })
    .eq("id", testId);

  console.log(`${logPrefix} Updated generated_tests.task_id = ${taskRecord.id}`);

  // Schedule poll phase after 10 seconds
  // @ts-ignore
  EdgeRuntime.waitUntil(scheduleSelfInvoke({
    batchId,
    testIds,
    userId,
    batchDelaySeconds,
    currentIndex: testIndex,
    phase: "poll",
    isRecursiveCall: true,
    taskRecordId: taskRecord.id,
    browserTaskId: browserTaskId,
    sessionId: sessionId,
    recordVideo: recordVideo,
    expectedResult: test.expected_result,
  }, 10000, logPrefix));

  console.log(`${logPrefix} Poll phase scheduled in 10s`);

  return new Response(
    JSON.stringify({ 
      success: true, 
      message: "Task launched, poll scheduled",
      phase: "start",
      taskRecordId: taskRecord.id,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ================== PHASE: POLL ==================
// Checks task status, updates heartbeat, finalizes when done
async function phasePoll(
  batchId: string,
  testId: string,
  testIndex: number,
  testIds: string[],
  userId: string,
  batchDelaySeconds: number,
  taskRecordId: string,
  browserTaskId: string,
  sessionId: string | null,
  recordVideo: boolean,
  expectedResult: string | null
): Promise<Response> {
  const logPrefix = `[Batch ${batchId}][POLL][${testIndex + 1}/${testIds.length}]`;
  console.log(`${logPrefix} Polling task ${browserTaskId}`);
  
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  
  // Heartbeat: update batch updated_at
  await supabase
    .from("test_batch_runs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", batchId);
  
  // Check batch status (cancelled/paused)
  const { data: batchState } = await supabase
    .from("test_batch_runs")
    .select("paused, status, completed_tests, passed_tests, failed_tests")
    .eq("id", batchId)
    .single();

  if (batchState?.status === "cancelled") {
    console.log(`${logPrefix} Batch was cancelled`);
    // Stop session if active
    if (sessionId) {
      await stopSessionResilient(sessionId, batchId);
    }
    return new Response(
      JSON.stringify({ success: true, message: "Batch cancelled", phase: "poll" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (batchState?.paused) {
    console.log(`${logPrefix} Batch is paused, re-scheduling poll in 10s`);
    // @ts-ignore
    EdgeRuntime.waitUntil(scheduleSelfInvoke({
      batchId, testIds, userId, batchDelaySeconds,
      currentIndex: testIndex,
      phase: "poll",
      isRecursiveCall: true,
      taskRecordId, browserTaskId, sessionId, recordVideo, expectedResult,
    }, 10000, logPrefix));
    
    return new Response(
      JSON.stringify({ success: true, message: "Batch paused", phase: "poll" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Check task status from DB first
  const { data: dbTask } = await supabase
    .from("tasks")
    .select("status, started_at, completed_at, result, step_count, screenshots, recordings")
    .eq("id", taskRecordId)
    .single();

  // If DB says task is done, finalize immediately
  if (dbTask?.status && ['completed', 'failed', 'cancelled'].includes(dbTask.status)) {
    console.log(`${logPrefix} DB task already finalized: ${dbTask.status}`);
    return await finalizeTest(
      batchId, testId, testIndex, testIds, userId, batchDelaySeconds,
      taskRecordId, dbTask, sessionId, recordVideo, expectedResult, logPrefix
    );
  }

  // Poll provider
  try {
    const statusRes = await fetch(
      `https://api.browser-use.com/api/v2/tasks/${browserTaskId}`,
      {
        headers: { "X-Browser-Use-API-Key": BROWSER_USE_API_KEY! },
      }
    );

    if (!statusRes.ok) {
      console.log(`${logPrefix} Status check failed: ${statusRes.status}, re-polling in 10s`);
      // @ts-ignore
      EdgeRuntime.waitUntil(scheduleSelfInvoke({
        batchId, testIds, userId, batchDelaySeconds,
        currentIndex: testIndex,
        phase: "poll",
        isRecursiveCall: true,
        taskRecordId, browserTaskId, sessionId, recordVideo, expectedResult,
      }, 10000, logPrefix));
      
      return new Response(
        JSON.stringify({ success: true, message: "Poll failed, retrying", phase: "poll" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const statusData = await statusRes.json();
    const taskStatus = statusData.status;
    
    console.log(`${logPrefix} Provider task status: ${taskStatus}`);

    if (taskStatus === "finished" || taskStatus === "failed" || taskStatus === "stopped") {
      // Task is done - finalize
      console.log(`${logPrefix} Task finished, finalizing...`);
      
      // Stop session first
      if (sessionId) {
        await stopSessionResilient(sessionId, batchId);
      }
      
      // Wait for video processing
      await delay(5000);
      
      // Fetch full task data with media
      const mediaRes = await fetch(
        `https://api.browser-use.com/api/v2/tasks/${browserTaskId}`,
        { headers: { "X-Browser-Use-API-Key": BROWSER_USE_API_KEY! } }
      );
      
      let resultSummary = statusData.output || statusData.result || "";
      let steps: unknown[] = statusData.steps || [];
      let screenshots: string[] = [];
      let recordings: string[] = [];
      
      if (mediaRes.ok) {
        const mediaData = await mediaRes.json();
        resultSummary = mediaData.output || mediaData.result || resultSummary;
        steps = mediaData.steps || steps;
        
        // Extract screenshots from steps
        if (Array.isArray(steps)) {
          for (const step of steps) {
            if (typeof step === "object" && step !== null) {
              const stepObj = step as Record<string, unknown>;
              if (stepObj.screenshotUrl && typeof stepObj.screenshotUrl === "string") {
                screenshots.push(stepObj.screenshotUrl);
              }
              if (stepObj.screenshot_url && typeof stepObj.screenshot_url === "string") {
                screenshots.push(stepObj.screenshot_url);
              }
            }
          }
        }
        
        // Extract recordings
        const outputFiles = mediaData.outputFiles || mediaData.output_files || [];
        const videoFiles = outputFiles.filter((f: { id?: string; fileName?: string }) => {
          const fileName = f?.fileName || '';
          return fileName.endsWith('.webm') || fileName.endsWith('.mp4');
        });
        
        for (const file of videoFiles) {
          if (file.id) {
            try {
              const downloadRes = await fetch(
                `https://api.browser-use.com/api/v2/files/${file.id}/download`,
                { headers: { "X-Browser-Use-API-Key": BROWSER_USE_API_KEY! } }
              );
              if (downloadRes.ok) {
                const downloadData = await downloadRes.json();
                if (downloadData.url) {
                  recordings.push(downloadData.url);
                }
              }
            } catch (e) {
              console.log(`${logPrefix} Error fetching video download URL:`, e);
            }
          }
        }
      }
      
      // Calculate metrics
      const { data: taskStartData } = await supabase
        .from("tasks")
        .select("started_at")
        .eq("id", taskRecordId)
        .single();
      
      const startedAt = taskStartData?.started_at ? new Date(taskStartData.started_at).getTime() : Date.now();
      const executionTimeMs = Date.now() - startedAt;
      const stepCount = Array.isArray(steps) ? steps.length : 0;
      
      // Evaluate test result
      const evaluation = evaluateTestResult(resultSummary, expectedResult);
      const finalStatus = taskStatus === "failed" ? "error" : evaluation.status;
      
      console.log(`${logPrefix} Evaluation: ${finalStatus} - ${evaluation.reasoning}`);
      
      // Calculate cost
      const execMinutes = executionTimeMs / 60000;
      const proxyRate = recordVideo ? 0.008 : 0.004;
      const estimatedCost = 0.01 + (stepCount * 0.01) + (execMinutes * proxyRate);
      
      // Update task record
      await supabase
        .from("tasks")
        .update({
          status: finalStatus === "error" ? "failed" : "completed",
          completed_at: new Date().toISOString(),
          screenshots: screenshots.length > 0 ? screenshots : null,
          recordings: recordings.length > 0 ? recordings : null,
          result: { output: resultSummary, reasoning: evaluation.reasoning },
          step_count: stepCount,
        })
        .eq("id", taskRecordId);

      // Update generated_tests
      await supabase
        .from("generated_tests")
        .update({
          status: finalStatus,
          last_run_at: new Date().toISOString(),
          execution_time_ms: executionTimeMs,
          result_summary: resultSummary || null,
          result_reasoning: evaluation.reasoning || null,
          step_count: stepCount,
          estimated_cost: estimatedCost,
        })
        .eq("id", testId);

      console.log(`${logPrefix} Test finalized: ${finalStatus}`);
      
      // Update batch progress
      const completedTests = (batchState?.completed_tests || 0) + 1;
      const passedTests = (batchState?.passed_tests || 0) + (finalStatus === "passed" ? 1 : 0);
      const failedTests = (batchState?.failed_tests || 0) + (finalStatus !== "passed" ? 1 : 0);

      console.log(`${logPrefix} Updating batch progress: ${completedTests}/${testIds.length}`);

      await supabase
        .from("test_batch_runs")
        .update({
          completed_tests: completedTests,
          passed_tests: passedTests,
          failed_tests: failedTests,
          updated_at: new Date().toISOString(),
        })
        .eq("id", batchId);

      // Schedule next test
      const hasMoreTests = testIndex + 1 < testIds.length;
      
      if (hasMoreTests) {
        console.log(`${logPrefix} Scheduling next test (index ${testIndex + 1}) in ${batchDelaySeconds}s`);
        
        // @ts-ignore
        EdgeRuntime.waitUntil(scheduleSelfInvoke({
          batchId, testIds, userId, batchDelaySeconds,
          currentIndex: testIndex + 1,
          phase: "start",
          isRecursiveCall: true,
        }, batchDelaySeconds * 1000, logPrefix));
      } else {
        console.log(`${logPrefix} All tests completed (${completedTests} total)`);
        
        await supabase
          .from("test_batch_runs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            current_test_id: null,
          })
          .eq("id", batchId);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Test finalized",
          phase: "poll",
          status: finalStatus,
          completed: completedTests,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Still running - schedule another poll
    console.log(`${logPrefix} Task still running, re-polling in 10s`);
    
    // @ts-ignore
    EdgeRuntime.waitUntil(scheduleSelfInvoke({
      batchId, testIds, userId, batchDelaySeconds,
      currentIndex: testIndex,
      phase: "poll",
      isRecursiveCall: true,
      taskRecordId, browserTaskId, sessionId, recordVideo, expectedResult,
    }, 10000, logPrefix));

    return new Response(
      JSON.stringify({ success: true, message: "Still running", phase: "poll" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`${logPrefix} Poll error:`, error);
    
    // Re-schedule poll
    // @ts-ignore
    EdgeRuntime.waitUntil(scheduleSelfInvoke({
      batchId, testIds, userId, batchDelaySeconds,
      currentIndex: testIndex,
      phase: "poll",
      isRecursiveCall: true,
      taskRecordId, browserTaskId, sessionId, recordVideo, expectedResult,
    }, 10000, logPrefix));

    return new Response(
      JSON.stringify({ success: false, error: "Poll error", phase: "poll" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// Helper for finalize when DB already has result
async function finalizeTest(
  batchId: string,
  testId: string,
  testIndex: number,
  testIds: string[],
  userId: string,
  batchDelaySeconds: number,
  taskRecordId: string,
  dbTask: { status: string; result: unknown; step_count: number | null; started_at: string | null; completed_at: string | null },
  sessionId: string | null,
  recordVideo: boolean,
  expectedResult: string | null,
  logPrefix: string
): Promise<Response> {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  
  // Stop session if active
  if (sessionId) {
    await stopSessionResilient(sessionId, batchId);
  }
  
  const resultSummary = dbTask.result 
    ? (typeof dbTask.result === 'string' ? dbTask.result : JSON.stringify(dbTask.result))
    : "";
  
  const evaluation = evaluateTestResult(resultSummary, expectedResult);
  const finalStatus = dbTask.status === "failed" ? "error" : evaluation.status;
  
  // Calculate execution time
  const startedAt = dbTask.started_at ? new Date(dbTask.started_at).getTime() : Date.now();
  const endedAt = dbTask.completed_at ? new Date(dbTask.completed_at).getTime() : Date.now();
  const executionTimeMs = endedAt - startedAt;
  
  // Calculate cost
  const execMinutes = executionTimeMs / 60000;
  const proxyRate = recordVideo ? 0.008 : 0.004;
  const stepCount = dbTask.step_count || 0;
  const estimatedCost = 0.01 + (stepCount * 0.01) + (execMinutes * proxyRate);
  
  // Update generated_tests
  await supabase
    .from("generated_tests")
    .update({
      status: finalStatus,
      last_run_at: new Date().toISOString(),
      execution_time_ms: executionTimeMs,
      result_summary: resultSummary.substring(0, 500) || null,
      result_reasoning: evaluation.reasoning || null,
      step_count: stepCount,
      estimated_cost: estimatedCost,
    })
    .eq("id", testId);

  // Get current batch state for progress
  const { data: batchState } = await supabase
    .from("test_batch_runs")
    .select("completed_tests, passed_tests, failed_tests")
    .eq("id", batchId)
    .single();

  // Update batch progress
  const completedTests = (batchState?.completed_tests || 0) + 1;
  const passedTests = (batchState?.passed_tests || 0) + (finalStatus === "passed" ? 1 : 0);
  const failedTests = (batchState?.failed_tests || 0) + (finalStatus !== "passed" ? 1 : 0);

  await supabase
    .from("test_batch_runs")
    .update({
      completed_tests: completedTests,
      passed_tests: passedTests,
      failed_tests: failedTests,
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  // Schedule next test
  const hasMoreTests = testIndex + 1 < testIds.length;
  
  if (hasMoreTests) {
    // @ts-ignore
    EdgeRuntime.waitUntil(scheduleSelfInvoke({
      batchId, testIds, userId, batchDelaySeconds,
      currentIndex: testIndex + 1,
      phase: "start",
      isRecursiveCall: true,
    }, batchDelaySeconds * 1000, logPrefix));
  } else {
    await supabase
      .from("test_batch_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        current_test_id: null,
      })
      .eq("id", batchId);
  }

  return new Response(
    JSON.stringify({ 
      success: true, 
      message: "Test finalized from DB",
      phase: "poll",
      status: finalStatus,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ================== MAIN HANDLER ==================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { 
      batchId, testIds, userId, batchDelaySeconds, currentIndex, isRecursiveCall,
      phase, taskRecordId, browserTaskId, sessionId, recordVideo, expectedResult
    } = body;

    if (!batchId || !testIds || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: batchId, testIds, userId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!BROWSER_USE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "BROWSER_USE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Supabase credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const index = currentIndex || 0;
    const effectiveDelay = batchDelaySeconds || 10;

    // ================== INITIAL CALL (not recursive) ==================
    if (!isRecursiveCall) {
      // Check for active batches
      const { data: activeBatches, error: checkError } = await supabase
        .from("test_batch_runs")
        .select("id, status")
        .eq("user_id", userId)
        .in("status", ["pending", "running"])
        .neq("id", batchId);

      if (checkError) {
        console.error("[run-tests-batch] Error checking active batches:", checkError);
      }

      if (activeBatches && activeBatches.length > 0) {
        console.log(`[run-tests-batch] User ${userId} already has active batch: ${activeBatches[0].id}`);
        return new Response(
          JSON.stringify({ 
            error: "Již běží jiný batch run. Počkejte na jeho dokončení nebo ho zrušte.",
            runningBatchId: activeBatches[0].id 
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Start the batch
      await supabase
        .from("test_batch_runs")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", batchId);

      console.log(`[run-tests-batch] Starting batch ${batchId} with ${testIds.length} tests, delay: ${effectiveDelay}s`);

      // Schedule first test via EdgeRuntime.waitUntil
      // @ts-ignore
      EdgeRuntime.waitUntil(scheduleSelfInvoke({
        batchId,
        testIds,
        userId,
        batchDelaySeconds: effectiveDelay,
        currentIndex: 0,
        phase: "start",
        isRecursiveCall: true,
      }, 100, `[Batch ${batchId}]`));

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Batch started", 
          batchId,
          totalTests: testIds.length 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ================== RECURSIVE CALLS ==================
    
    // Check if all tests done
    if (index >= testIds.length) {
      console.log(`[Batch ${batchId}] All tests completed`);
      
      await supabase
        .from("test_batch_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          current_test_id: null,
        })
        .eq("id", batchId);

      return new Response(
        JSON.stringify({ success: true, message: "Batch completed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const testId = testIds[index];

    // Route to appropriate phase
    if (phase === "poll" && taskRecordId && browserTaskId) {
      return await phasePoll(
        batchId, testId, index, testIds, userId, effectiveDelay,
        taskRecordId, browserTaskId, sessionId || null, recordVideo || false, expectedResult || null
      );
    }

    // Default: start phase
    return await phaseStart(
      batchId, testId, index, testIds, userId, effectiveDelay
    );

  } catch (error) {
    console.error("[run-tests-batch] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
