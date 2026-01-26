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

// Fire-and-forget: starts async call without waiting for response
function fireAndForget(url: string, body: object) {
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(body),
  }).catch(e => console.error("[fireAndForget] Error:", e));
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
// Returns 'passed' or 'failed' (functional failure - test ran but didn't meet expectations)
function evaluateTestResult(resultSummary: string, expectedResult: string | null): { status: 'passed' | 'failed', reasoning: string } {
  if (!expectedResult || expectedResult.trim() === '') {
    return { status: 'passed', reasoning: 'Test dokončen bez definovaného očekávaného výsledku.' };
  }

  const result = resultSummary.toLowerCase().trim();
  const expected = expectedResult.toLowerCase().trim();

  // STRONG success indicators - if result starts with or contains these, prioritize success
  const strongSuccessPatterns = [
    'the test of', 'test was successful', 'test completed successfully',
    'all steps completed', 'verification successful', 'was successful',
    'successfully completed', 'successfully verified', 'test passed'
  ];
  const hasStrongSuccess = strongSuccessPatterns.some(pattern => result.includes(pattern));

  // False positive contexts - these phrases contain failure keywords but are NOT failures
  // Example: "Guided Tour was not displayed during this session, so no action was needed"
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

  // Critical failure patterns - more specific to avoid false positives
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
  
  // Only trigger critical failure if NOT in false positive context and NOT strong success
  const hasCriticalFailure = !hasStrongSuccess && 
    !hasFalsePositiveContext && 
    criticalFailurePatterns.some(pattern => result.includes(pattern));

  // Regular failure indicators (less severe)
  const failureIndicators = ['error', 'failed', 'not found', 'exception', 'chyba', 'selhalo', 'nenalezeno', 'neúspěch'];
  // Exclude "failed" if it's part of false positive or strong success context
  const hasFailureIndicator = !hasStrongSuccess && 
    !hasFalsePositiveContext && 
    failureIndicators.some(ind => result.includes(ind));

  const successIndicators = ['success', 'passed', 'verified', 'confirmed', 'úspěch', 'ověřeno', 'potvrzeno', 'successful'];
  const hasSuccessIndicator = successIndicators.some(ind => result.includes(ind));

  // Strong success with false positive context = PASS
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

  // Critical failures = FAIL
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

  // Regular failure indicator = FAIL
  if (hasFailureIndicator) {
    return { 
      status: 'failed', 
      reasoning: `Výsledek obsahuje indikátor selhání. Očekáváno: "${expectedResult.substring(0, 100)}". Skutečný výsledek: "${resultSummary.substring(0, 100)}".` 
    };
  }

  // Success indicator + reasonable keyword match = PASS
  if (hasSuccessIndicator && matchRatio >= 0.3) {
    return { 
      status: 'passed', 
      reasoning: `Výsledek obsahuje indikátor úspěchu a ${Math.round(matchRatio * 100)}% klíčových slov.` 
    };
  }

  // High keyword match = PASS
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

// Self-invoke to process next test (recursive edge function call)
// SIMPLIFIED: delay is now handled externally via EdgeRuntime.waitUntil
async function scheduleNextTest(batchId: string, testIds: string[], currentIndex: number, userId: string, batchDelaySeconds?: number) {
  const functionUrl = `${SUPABASE_URL}/functions/v1/run-tests-batch`;
  
  console.log(`[Batch ${batchId}] Scheduling next test invocation for index ${currentIndex + 1}`);
  
  try {
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        batchId,
        testIds,
        userId,
        batchDelaySeconds,
        currentIndex: currentIndex + 1, // Move to next test
        isRecursiveCall: true,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Batch ${batchId}] Failed to schedule next test:`, errorText);
    } else {
      console.log(`[Batch ${batchId}] Next test scheduled successfully`);
    }
  } catch (error) {
    console.error(`[Batch ${batchId}] Error scheduling next test:`, error);
  }
}

// Process a single test with atomic claim mechanism to prevent duplicate invocations
async function processSingleTest(
  batchId: string, 
  testId: string, 
  userId: string, 
  testIds: string[],
  testIndex: number,
  totalTests: number,
  overrideDelaySeconds?: number
): Promise<{ didRun: boolean; passed: boolean; failed: boolean; sessionId: string | null }> {
  console.log(`[Batch ${batchId}] Processing test ${testId} (${testIndex + 1}/${totalTests})`);
  
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  console.log(`[Batch ${batchId}] Claim attempt testId=${testId} index=${testIndex}`);
  
  // ATOMIC CLAIM: Only succeed if test is not already running
  // We reset task_id at batch start, so we only need to check status here
  // This prevents duplicate invocations from creating multiple sessions/tasks
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
    console.error(`[Batch ${batchId}] Claim error for testId=${testId}:`, claimError);
    // On error, treat as failed claim - let another invocation handle it
    return { didRun: false, passed: false, failed: false, sessionId: null };
  }

  if (!claimResult) {
    // Another invocation already claimed this test - skip silently
    console.log(`[Batch ${batchId}] Claim SKIPPED (already running or claimed) testId=${testId}`);
    return { didRun: false, passed: false, failed: false, sessionId: null };
  }

  console.log(`[Batch ${batchId}] Claim SUCCESS for testId=${testId}`);
  
  // Update batch current_test_id
  await supabase
    .from("test_batch_runs")
    .update({ current_test_id: testId })
    .eq("id", batchId);
  
  let sessionIdForCleanup: string | null = null;
  let batchDelaySeconds = overrideDelaySeconds ?? 10;
  
  try {
    const { data: test, error: testError } = await supabase
      .from("generated_tests")
      .select("*")
      .eq("id", testId)
      .single();

    if (testError || !test) {
      console.error(`[Batch ${batchId}] Test not found: ${testId}`);
      // Rollback claim
      await supabase
        .from("generated_tests")
        .update({ status: "error", task_id: null, result_summary: "Test not found" })
        .eq("id", testId);
      return { didRun: true, passed: false, failed: true, sessionId: null };
    }

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
        batchDelaySeconds = overrideDelaySeconds ?? project.batch_delay_seconds ?? 10;
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

    console.log(`[Batch ${batchId}] Creating browser-use task for test ${testId}${browserProfileId ? ` with profile ${browserProfileId}` : ''}, maxSteps: ${maxSteps}, recordVideo: ${recordVideo}`);
    
    // Step 1: Create session and task with retry for concurrency errors
    let sessionId: string | null = null;
    let browserTaskId: string | null = null;
    
    const maxCreateRetries = 4;
    const retryDelays = [20000, 40000, 60000, 90000];
    
    for (let createAttempt = 1; createAttempt <= maxCreateRetries; createAttempt++) {
      console.log(`[Batch ${batchId}] Task creation attempt ${createAttempt}/${maxCreateRetries}`);
      
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
        console.log(`[Batch ${batchId}] Session create response: ${sessionRes.status} ${sessionRaw.substring(0, 500)}`);
        
        if (sessionRes.ok) {
          const sessionData = JSON.parse(sessionRaw);
          sessionId = sessionData.id || sessionData.sessionId || sessionData.session_id;
          sessionIdForCleanup = sessionId;
          console.log(`[Batch ${batchId}] Created session, sessionId: ${sessionId}`);
        } else if (sessionRaw.includes("Too many concurrent")) {
          console.log(`[Batch ${batchId}] Session creation hit concurrency limit`);
          if (sessionIdForCleanup) {
            await stopSessionResilient(sessionIdForCleanup, batchId);
            sessionIdForCleanup = null;
          }
          if (createAttempt < maxCreateRetries) {
            console.log(`[Batch ${batchId}] Waiting ${retryDelays[createAttempt - 1] / 1000}s before retry...`);
            await delay(retryDelays[createAttempt - 1]);
            continue;
          }
        }
      } catch (e) {
        console.error(`[Batch ${batchId}] Error creating session:`, e);
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
        console.log(`[Batch ${batchId}] Creating task with session: ${sessionId}`);
      } else if (browserProfileId) {
        taskPayload.profile_id = browserProfileId;
        taskPayload.profileId = browserProfileId;
        console.log(`[Batch ${batchId}] Creating task with direct profile (fallback): ${browserProfileId}`);
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
        console.error(`[Batch ${batchId}] Failed to create task: ${errorText}`);
        
        if (errorText.includes("Too many concurrent") && createAttempt < maxCreateRetries) {
          console.log(`[Batch ${batchId}] Task creation hit concurrency limit, attempt ${createAttempt}/${maxCreateRetries}`);
          if (sessionIdForCleanup) {
            await stopSessionResilient(sessionIdForCleanup, batchId);
            sessionIdForCleanup = null;
            sessionId = null;
          }
          console.log(`[Batch ${batchId}] Waiting ${retryDelays[createAttempt - 1] / 1000}s before retry...`);
          await delay(retryDelays[createAttempt - 1]);
          continue;
        }
        
        throw new Error(`Failed to create task: ${errorText}`);
      }

      const createData = await createResponse.json();
      browserTaskId = createData.id;
      
      if (!sessionIdForCleanup) {
        const taskSessionId = createData.sessionId || createData.session_id;
        if (taskSessionId) {
          sessionIdForCleanup = taskSessionId;
          console.log(`[Batch ${batchId}] Captured sessionId from task response: ${sessionIdForCleanup}`);
        }
      }

      if (!browserTaskId) {
        throw new Error("No task ID returned from browser-use");
      }

      console.log(`[Batch ${batchId}] Browser-use task created: ${browserTaskId}`);
      break;
    }
    
    if (!browserTaskId) {
      throw new Error("Failed to create task after all retries");
    }

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
      console.error(`[Batch ${batchId}] Failed to create task record:`, taskError2);
      // Rollback the claim on generated_tests
      await supabase
        .from("generated_tests")
        .update({
          status: "error",
          result_summary: `Failed to create task record: ${taskError2?.message || "Unknown error"}`,
        })
        .eq("id", testId);
      throw new Error("Failed to create task record");
    }

    console.log(`[Batch ${batchId}] Task record created: ${taskRecord.id}`);

    // Poll for task completion
    let taskFinished = false;
    let taskStatus = "";
    let resultSummary = "";
    let steps: unknown[] = [];
    let screenshots: string[] = [];
    let recordings: string[] = [];
    const maxPolls = 360; // ~30 minutes max
    let pollCount = 0;

    while (!taskFinished && pollCount < maxPolls) {
      pollCount++;
      await delay(5000);

      try {
        const statusRes = await fetch(
          `https://api.browser-use.com/api/v2/tasks/${browserTaskId}`,
          {
            headers: {
              "X-Browser-Use-API-Key": BROWSER_USE_API_KEY!,
            },
          }
        );

        if (!statusRes.ok) {
          console.error(`[Batch ${batchId}] Status check failed: ${statusRes.status}`);
          continue;
        }

        const statusData = await statusRes.json();
        taskStatus = statusData.status;
        
        // Capture sessionId from polling if we don't have it
        if (!sessionIdForCleanup) {
          const polledSessionId = statusData.sessionId || statusData.session_id;
          if (polledSessionId) {
            sessionIdForCleanup = polledSessionId;
            console.log(`[Batch ${batchId}] Captured sessionId from polling: ${sessionIdForCleanup}`);
          }
        }

        console.log(`[Batch ${batchId}] Task ${browserTaskId} status: ${taskStatus}`);

        if (taskStatus === "finished" || taskStatus === "failed" || taskStatus === "stopped") {
          taskFinished = true;
          resultSummary = statusData.output || statusData.result || "";
          steps = statusData.steps || [];

          // IMPORTANT: strict one-by-one execution
          // Close the browser session FIRST, then schedule the next invocation.
          // This prevents "Too many concurrent active sessions" errors when a previous invocation
          // continues media processing while a new one starts.
          if (sessionIdForCleanup) {
            try {
              await stopSessionResilient(sessionIdForCleanup, batchId);
            } catch (e) {
              console.log(`[Batch ${batchId}] Error stopping session before scheduling next test:`, e);
            }
          }

          // NOTE: scheduling next test is now handled in the main serve function via EdgeRuntime.waitUntil
          // This ensures the delay completes even if edge function wants to shut down

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

          // Wait for video processing
          console.log(`[Batch ${batchId}] Waiting for video processing...`);
          await delay(5000);

          // Fetch media files - try both task and session endpoints
          const maxMediaRetries = 6;
          for (let mediaAttempt = 1; mediaAttempt <= maxMediaRetries; mediaAttempt++) {
            console.log(`[Batch ${batchId}] Media fetch attempt ${mediaAttempt}/${maxMediaRetries}...`);
            
            // First try task endpoint
            const mediaRes = await fetch(
              `https://api.browser-use.com/api/v2/tasks/${browserTaskId}`,
              {
                headers: {
                  "X-Browser-Use-API-Key": BROWSER_USE_API_KEY!,
                },
              }
            );

            if (mediaRes.ok) {
              const mediaData = await mediaRes.json();
              const outputFiles = mediaData.outputFiles || mediaData.output_files || [];
              
              console.log(`[Batch ${batchId}] Attempt ${mediaAttempt} - Status: ${mediaData.status}, OutputFiles: ${JSON.stringify(outputFiles)}`);
              console.log(`[Batch ${batchId}] Attempt ${mediaAttempt} - OutputFiles raw:`, JSON.stringify(outputFiles));
              
              const videoFiles = outputFiles.filter((f: { id?: string; fileName?: string }) => {
                const fileName = f?.fileName || '';
                return fileName.endsWith('.webm') || fileName.endsWith('.mp4');
              });
              console.log(`[Batch ${batchId}] Video files found: ${videoFiles.length}`);
              
              // Get new screenshots from steps
              if (mediaData.steps && Array.isArray(mediaData.steps)) {
                for (const step of mediaData.steps) {
                  if (typeof step === "object" && step !== null) {
                    const stepObj = step as Record<string, unknown>;
                    if (stepObj.screenshotUrl && typeof stepObj.screenshotUrl === "string" && !screenshots.includes(stepObj.screenshotUrl)) {
                      screenshots.push(stepObj.screenshotUrl);
                    }
                    if (stepObj.screenshot_url && typeof stepObj.screenshot_url === "string" && !screenshots.includes(stepObj.screenshot_url)) {
                      screenshots.push(stepObj.screenshot_url);
                    }
                  }
                }
              }
              
              // Process video files from task
              for (const file of videoFiles) {
                if (file.id) {
                  try {
                    const downloadRes = await fetch(
                      `https://api.browser-use.com/api/v2/files/${file.id}/download`,
                      {
                        headers: {
                          "X-Browser-Use-API-Key": BROWSER_USE_API_KEY!,
                        },
                      }
                    );
                    if (downloadRes.ok) {
                      const downloadData = await downloadRes.json();
                      if (downloadData.url) {
                        recordings.push(downloadData.url);
                        console.log(`[Batch ${batchId}] Got recording URL from task: ${downloadData.url.substring(0, 50)}...`);
                      }
                    }
                  } catch (e) {
                    console.log(`[Batch ${batchId}] Error fetching video download URL:`, e);
                  }
                }
              }
              
              // If no videos from task, try session endpoint (v2 API may store recordings there)
              // NOTE: session may already be stopped for sequential safety; keep this as best-effort.
              if (recordings.length === 0 && sessionId) {
                console.log(`[Batch ${batchId}] No recordings from task, trying session endpoint: ${sessionId}`);
                try {
                  const sessionRes = await fetch(
                    `https://api.browser-use.com/api/v2/sessions/${sessionId}`,
                    {
                      headers: {
                        "X-Browser-Use-API-Key": BROWSER_USE_API_KEY!,
                      },
                    }
                  );
                  if (sessionRes.ok) {
                    const sessionData = await sessionRes.json();
                    console.log(`[Batch ${batchId}] Session data keys:`, Object.keys(sessionData));
                    
                    // Check for recordings in various possible fields
                    const sessionRecordings = sessionData.recordings || sessionData.recording || sessionData.videos || [];
                    const sessionOutputFiles = sessionData.outputFiles || sessionData.output_files || [];
                    
                    console.log(`[Batch ${batchId}] Session recordings: ${JSON.stringify(sessionRecordings)}`);
                    console.log(`[Batch ${batchId}] Session outputFiles: ${JSON.stringify(sessionOutputFiles)}`);
                    
                    // Process session recordings if they're URLs
                    if (Array.isArray(sessionRecordings)) {
                      for (const rec of sessionRecordings) {
                        if (typeof rec === 'string' && rec.startsWith('http')) {
                          recordings.push(rec);
                        } else if (typeof rec === 'object' && rec !== null) {
                          const url = rec.url || rec.downloadUrl || rec.download_url;
                          if (url) recordings.push(url);
                        }
                      }
                    }
                    
                    // Process session output files for videos
                    if (Array.isArray(sessionOutputFiles)) {
                      const sessionVideoFiles = sessionOutputFiles.filter((f: { id?: string; fileName?: string }) => {
                        const fileName = f?.fileName || '';
                        return fileName.endsWith('.webm') || fileName.endsWith('.mp4');
                      });
                      
                      for (const file of sessionVideoFiles) {
                        if (file.id) {
                          try {
                            const downloadRes = await fetch(
                              `https://api.browser-use.com/api/v2/files/${file.id}/download`,
                              {
                                headers: {
                                  "X-Browser-Use-API-Key": BROWSER_USE_API_KEY!,
                                },
                              }
                            );
                            if (downloadRes.ok) {
                              const downloadData = await downloadRes.json();
                              if (downloadData.url) {
                                recordings.push(downloadData.url);
                                console.log(`[Batch ${batchId}] Got recording URL from session: ${downloadData.url.substring(0, 50)}...`);
                              }
                            }
                          } catch (e) {
                            console.log(`[Batch ${batchId}] Error fetching session video download URL:`, e);
                          }
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.log(`[Batch ${batchId}] Error fetching session for recordings:`, e);
                }
              }
              
              console.log(`[Batch ${batchId}] Final media: ${screenshots.length} screenshots, ${recordings.length} recordings`);
              
              if (recordings.length > 0 || mediaAttempt === maxMediaRetries) {
                break;
              }
            }
            
            if (mediaAttempt < maxMediaRetries) {
              console.log(`[Batch ${batchId}] Waiting 5s for video processing...`);
              await delay(5000);
            }
          }
        }
      } catch (e) {
        console.error(`[Batch ${batchId}] Error polling task:`, e);
      }
    }

    // Calculate execution time
    const startedAt = taskRecord.started_at ? new Date(taskRecord.started_at).getTime() : Date.now();
    const executionTimeMs = Date.now() - startedAt;
    const stepCount = Array.isArray(steps) ? steps.length : 0;

    // Evaluate test result
    // taskStatus === "failed" means technical error → status = 'error'
    // evaluation.status === "failed" means functional failure → status = 'failed'
    const evaluation = evaluateTestResult(resultSummary, test.expected_result);
    const finalStatus = taskStatus === "failed" ? "error" : evaluation.status;
    const resultReasoning = evaluation.reasoning;

    console.log(`[Batch ${batchId}] Test evaluation: ${finalStatus} - ${resultReasoning}`);

    // Calculate cost
    const execMinutes = (executionTimeMs || 0) / 60000;
    const proxyRate = recordVideo ? 0.008 : 0.004;
    const estimatedCost = 0.01 + (stepCount * 0.01) + (execMinutes * proxyRate);
    
    console.log(`[Batch ${batchId}] Cost: ${stepCount} steps, ${execMinutes.toFixed(2)} min, $${estimatedCost.toFixed(4)}`);

    // Update task record
    // 'error' (technical) → tasks.status = 'failed'
    // 'failed' (functional) → tasks.status = 'completed' (test ran successfully, just didn't pass)
    await supabase
      .from("tasks")
      .update({
        status: finalStatus === "error" ? "failed" : "completed",
        completed_at: new Date().toISOString(),
        screenshots: screenshots.length > 0 ? screenshots : null,
        recordings: recordings.length > 0 ? recordings : null,
        result: { output: resultSummary, reasoning: resultReasoning },
        step_count: stepCount,
      })
      .eq("id", taskRecord.id);

    // Update generated_tests with all metrics
    const updateResult = await supabase
      .from("generated_tests")
      .update({
        status: finalStatus,
        last_run_at: new Date().toISOString(),
        execution_time_ms: executionTimeMs,
        result_summary: resultSummary || null,
        result_reasoning: resultReasoning || null,
        step_count: stepCount,
        estimated_cost: estimatedCost,
        task_id: taskRecord.id,
      })
      .eq("id", testId);
    
    if (updateResult.error) {
      console.error(`[Batch ${batchId}] Failed to update generated_test ${testId}:`, updateResult.error);
    } else {
      console.log(`[Batch ${batchId}] Updated generated_test ${testId}: status=${finalStatus}, steps=${stepCount}, cost=$${estimatedCost.toFixed(4)}`);
    }

    console.log(`[Batch ${batchId}] Test ${testId} completed with status: ${finalStatus}`);
    
    return { didRun: true, 
      passed: finalStatus === "passed", 
      failed: finalStatus !== "passed",
      // session already stopped above to guarantee one-by-one execution
      sessionId: null
    };
  } catch (error) {
    console.error(`[Batch ${batchId}] Error running test ${testId}:`, error);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Best-effort cleanup to avoid leaking active sessions when an error occurs mid-run
    if (sessionIdForCleanup) {
      try {
        await stopSessionResilient(sessionIdForCleanup, batchId);
        sessionIdForCleanup = null;
      } catch (e) {
        console.log(`[Batch ${batchId}] Error stopping session in error handler:`, e);
      }
    }
    
    try {
      // Technical error → status = 'error'
      await supabase
        .from("generated_tests")
        .update({
          status: "error",
          last_run_at: new Date().toISOString(),
          result_summary: `Chyba: ${error instanceof Error ? error.message : "Neznámá chyba"}`,
          result_reasoning: null,
          execution_time_ms: null,
          step_count: null,
          estimated_cost: null,
        })
        .eq("id", testId);
    } catch (updateError) {
      console.error(`[Batch ${batchId}] Failed to update test status:`, updateError);
    }

    return { didRun: true, passed: false, failed: true, sessionId: null };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batchId, testIds, userId, batchDelaySeconds, currentIndex, isRecursiveCall } = await req.json();

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

    // Initial call: check for active batches, start batch, and IMMEDIATELY return
    if (!isRecursiveCall) {
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
        })
        .eq("id", batchId);

      console.log(`[run-tests-batch] Starting batch ${batchId} with ${testIds.length} tests${batchDelaySeconds ? `, delay: ${batchDelaySeconds}s` : ''}`);

      // Fire-and-forget: spawn async call to process first test
      // This returns IMMEDIATELY to avoid 504 timeout
      const selfUrl = `${SUPABASE_URL}/functions/v1/run-tests-batch`;
      fireAndForget(selfUrl, {
        batchId,
        testIds,
        userId,
        batchDelaySeconds,
        currentIndex: 0,
        isRecursiveCall: true,
      });

      // Return immediately - frontend relies on real-time subscription for updates
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

    // Check if batch is paused or cancelled
    const { data: batchState } = await supabase
      .from("test_batch_runs")
      .select("paused, status, completed_tests, passed_tests, failed_tests")
      .eq("id", batchId)
      .single();

    if (batchState?.status === "cancelled") {
      console.log(`[Batch ${batchId}] Batch was cancelled`);
      return new Response(
        JSON.stringify({ success: true, message: "Batch was cancelled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle pause - wait and retry
    if (batchState?.paused) {
      console.log(`[Batch ${batchId}] Batch is paused, waiting 10s before re-checking...`);
      await delay(10000);
      
      // Re-invoke to check again
      await scheduleNextTest(batchId, testIds, index - 1, userId, batchDelaySeconds);
      
      return new Response(
        JSON.stringify({ success: true, message: "Batch paused, scheduled re-check" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if we've finished all tests
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
    console.log(`[Batch ${batchId}] Processing test ${index + 1}/${testIds.length}: ${testId}`);

    // Process single test (this may take a while due to media fetch)
    const result = await processSingleTest(
      batchId,
      testId,
      userId,
      testIds,
      index,
      testIds.length,
      batchDelaySeconds
    );

    // If claim failed (duplicate invocation), skip progress update and scheduling
    // The invocation that successfully claimed the test will handle everything
    if (!result.didRun) {
      console.log(`[Batch ${batchId}] Skipping progress update for duplicate invocation at index ${index}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "Skipped duplicate invocation",
          batchId,
          currentIndex: index,
          skipped: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update batch progress - only when test actually ran
    const completedTests = (batchState?.completed_tests || 0) + 1;
    const passedTests = (batchState?.passed_tests || 0) + (result.passed ? 1 : 0);
    const failedTests = (batchState?.failed_tests || 0) + (result.failed ? 1 : 0);

    console.log(`[Batch ${batchId}] Updating progress: ${completedTests}/${testIds.length}`);

    await supabase
      .from("test_batch_runs")
      .update({
        completed_tests: completedTests,
        passed_tests: passedTests,
        failed_tests: failedTests,
        updated_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    // Check if there are more tests to run
    const hasMoreTests = index + 1 < testIds.length;
    
    if (hasMoreTests) {
      // Schedule the next test using EdgeRuntime.waitUntil
      // This guarantees the delay + scheduling completes even if edge function wants to shut down
      const minDelay = Math.max(batchDelaySeconds || 10, 5) * 1000;
      console.log(`[Batch ${batchId}] Scheduling next test (index ${index + 1}) with ${minDelay / 1000}s delay via EdgeRuntime.waitUntil`);
      
      const schedulePromise = (async () => {
        await delay(minDelay);
        await scheduleNextTest(batchId, testIds, index, userId, batchDelaySeconds);
      })();
      
      // @ts-ignore - EdgeRuntime is available in Deno edge functions
      EdgeRuntime.waitUntil(schedulePromise);
    } else {
      // Mark batch as completed - this was the last test
      console.log(`[Batch ${batchId}] All tests completed (${completedTests} total, ${passedTests} passed, ${failedTests} failed)`);
      
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
        message: `Test ${index + 1}/${testIds.length} processed`,
        batchId,
        currentIndex: index,
        completed: completedTests,
        passed: passedTests,
        failed: failedTests,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[run-tests-batch] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
