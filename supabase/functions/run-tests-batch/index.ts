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

interface TestBatch {
  id: string;
  user_id: string;
  test_ids: string[];
  status: string;
  total_tests: number;
  completed_tests: number;
  passed_tests: number;
  failed_tests: number;
  current_test_id: string | null;
}

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
function evaluateTestResult(resultSummary: string, expectedResult: string | null): { status: 'passed' | 'not_passed', reasoning: string } {
  if (!expectedResult || expectedResult.trim() === '') {
    return { status: 'passed', reasoning: 'Test dokončen bez definovaného očekávaného výsledku.' };
  }

  const result = resultSummary.toLowerCase().trim();
  const expected = expectedResult.toLowerCase().trim();

  const failureIndicators = ['error', 'failed', 'not found', 'timeout', 'exception', 'chyba', 'selhalo', 'nenalezeno'];
  const hasFailureIndicator = failureIndicators.some(ind => result.includes(ind));

  const successIndicators = ['success', 'passed', 'completed', 'verified', 'confirmed', 'ok', 'úspěch', 'ověřeno', 'potvrzeno'];
  const hasSuccessIndicator = successIndicators.some(ind => result.includes(ind));

  const keywords = expected
    .split(/[\s,;.!?]+/)
    .filter(word => word.length > 3)
    .filter(word => !['should', 'must', 'will', 'that', 'this', 'with', 'from', 'have', 'been', 'mělo', 'musí', 'bude', 'tento', 'tato', 'které'].includes(word));

  const matchedKeywords = keywords.filter(kw => result.includes(kw));
  const matchRatio = keywords.length > 0 ? matchedKeywords.length / keywords.length : 0;

  if (hasFailureIndicator && !hasSuccessIndicator) {
    return { 
      status: 'not_passed', 
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
    status: 'not_passed', 
    reasoning: `Pouze ${Math.round(matchRatio * 100)}% klíčových slov z očekávaného výsledku nalezeno. Očekáváno: "${expectedResult.substring(0, 100)}". Skutečný výsledek: "${resultSummary.substring(0, 100)}".` 
  };
}

async function runBatchInBackground(batchId: string, testIds: string[], userId: string, overrideDelaySeconds?: number) {
  console.log(`[Batch ${batchId}] Starting background execution for ${testIds.length} tests${overrideDelaySeconds ? `, delay override: ${overrideDelaySeconds}s` : ''}`);

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  await supabase
    .from("test_batch_runs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  let completedTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  for (const testId of testIds) {
    // Check if batch is paused or cancelled
    const { data: batchState } = await supabase
      .from("test_batch_runs")
      .select("paused, status")
      .eq("id", batchId)
      .single();

    if (batchState?.status === "cancelled") {
      console.log(`[Batch ${batchId}] Batch was cancelled, stopping execution`);
      break;
    }

    // Wait while paused
    while (batchState?.paused) {
      console.log(`[Batch ${batchId}] Batch is paused, waiting...`);
      await delay(5000);
      
      const { data: checkState } = await supabase
        .from("test_batch_runs")
        .select("paused, status")
        .eq("id", batchId)
        .single();
      
      if (checkState?.status === "cancelled") {
        console.log(`[Batch ${batchId}] Batch was cancelled while paused`);
        return;
      }
      
      if (!checkState?.paused) {
        console.log(`[Batch ${batchId}] Batch resumed, continuing...`);
        break;
      }
    }

    console.log(`[Batch ${batchId}] Processing test ${testId} (${completedTests + 1}/${testIds.length})`);

    await supabase
      .from("test_batch_runs")
      .update({ current_test_id: testId })
      .eq("id", batchId);

    // Variables needed for cleanup after the try block
    let sessionIdForCleanup: string | null = null;
    let batchDelaySecondsForCleanup = 10;

    try {
      const { data: test, error: testError } = await supabase
        .from("generated_tests")
        .select("*")
        .eq("id", testId)
        .single();

      if (testError || !test) {
        console.error(`[Batch ${batchId}] Test not found: ${testId}`);
        failedTests++;
        completedTests++;
        continue;
      }

      let setupPrompt = "";
      let baseUrl = "";
      let credentials = "";
      let browserProfileId: string | null = null;
      let maxSteps = 10;
      let recordVideo = true;
      let batchDelaySeconds = 10;

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
      
      // Step 1: Create a session (with or without profile) - with retry for concurrency errors
      let sessionId: string | null = null;
      let browserTaskId: string | null = null;
      
      const maxCreateRetries = 4;
      const retryDelays = [20000, 40000, 60000, 90000]; // 20s, 40s, 60s, 90s backoff
      
      for (let createAttempt = 1; createAttempt <= maxCreateRetries; createAttempt++) {
        console.log(`[Batch ${batchId}] Task creation attempt ${createAttempt}/${maxCreateRetries}`);
        
        // Try to create session
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
            // Try to cleanup any existing session before retry
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
        
        batchDelaySecondsForCleanup = batchDelaySeconds;
        
        // Step 2: Create the task
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
          
          // Check if it's a concurrency error - retry with backoff
          if (errorText.includes("Too many concurrent") && createAttempt < maxCreateRetries) {
            console.log(`[Batch ${batchId}] Task creation hit concurrency limit, attempt ${createAttempt}/${maxCreateRetries}`);
            // Cleanup session if we created one
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
        
        // IMPORTANT: Capture sessionId from task response if we didn't have one
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
        break; // Success - exit retry loop
      }
      
      if (!browserTaskId) {
        throw new Error("Failed to create task after all retries");
      }

      // Create record in tasks table
      const { data: taskRecord, error: taskError } = await supabase
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

      if (taskError || !taskRecord) {
        console.error(`[Batch ${batchId}] Failed to create task record:`, taskError);
        throw new Error(`Failed to create task record: ${taskError?.message}`);
      }

      console.log(`[Batch ${batchId}] Task record created: ${taskRecord.id}`);

      await supabase
        .from("generated_tests")
        .update({ 
          status: "running",
          task_id: taskRecord.id,
        })
        .eq("id", testId);

      // Poll for task completion (max 5 minutes)
      let taskCompleted = false;
      let attempts = 0;
      const maxAttempts = 100;
      let finalStatus = "passed";
      let resultSummary = "";
      let resultReasoning = "";
      let executionTimeMs: number | null = null;

      while (!taskCompleted && attempts < maxAttempts) {
        await delay(3000);
        attempts++;

        try {
          const statusResponse = await fetch(
            `https://api.browser-use.com/api/v2/tasks/${browserTaskId}`,
            {
              headers: {
                "X-Browser-Use-API-Key": BROWSER_USE_API_KEY!,
              },
            }
          );

          if (!statusResponse.ok) {
            console.log(`[Batch ${batchId}] Status check failed, attempt ${attempts}`);
            continue;
          }

          const statusData = await statusResponse.json();
          const apiStatus = statusData.status;

          console.log(`[Batch ${batchId}] Task ${browserTaskId} status: ${apiStatus}`);
          
          // IMPORTANT: Capture sessionId from polling if we still don't have it
          if (!sessionIdForCleanup) {
            const pollSessionId = statusData.sessionId || statusData.session_id;
            if (pollSessionId) {
              sessionIdForCleanup = pollSessionId;
              console.log(`[Batch ${batchId}] Captured sessionId from polling: ${sessionIdForCleanup}`);
            }
          }

          if (["finished", "completed", "done", "failed", "error", "stopped"].includes(apiStatus)) {
            taskCompleted = true;

            if (apiStatus === "failed" || apiStatus === "error") {
              finalStatus = "failed";
            }

            const startedAt = statusData.started_at || statusData.startedAt || statusData.created_at;
            const finishedAt = statusData.finished_at || statusData.finishedAt || new Date().toISOString();

            if (startedAt) {
              executionTimeMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
            }

            const output = statusData.output || statusData.result || "";
            resultSummary =
              typeof output === "string" ? output.substring(0, 500) : JSON.stringify(output).substring(0, 500);
            
            if (finalStatus !== "failed") {
              const evaluation = evaluateTestResult(resultSummary, test.expected_result);
              finalStatus = evaluation.status;
              resultReasoning = evaluation.reasoning;
              console.log(`[Batch ${batchId}] Test evaluation: ${finalStatus} - ${resultReasoning}`);
            }
          }
        } catch (pollError) {
          console.error(`[Batch ${batchId}] Poll error:`, pollError);
        }
      }

      if (!taskCompleted) {
        finalStatus = "failed";
        resultSummary = "Timeout - test nedoběhl do 5 minut";
      }

      // Fetch detailed task data to get screenshots and recordings with retry
      let screenshots: string[] = [];
      let recordings: string[] = [];
      
      console.log(`[Batch ${batchId}] Waiting for video processing...`);
      await delay(5000);
      
      const maxMediaRetries = 6;
      for (let mediaAttempt = 1; mediaAttempt <= maxMediaRetries; mediaAttempt++) {
        try {
          console.log(`[Batch ${batchId}] Media fetch attempt ${mediaAttempt}/${maxMediaRetries}...`);
          
          const detailsResponse = await fetch(
            `https://api.browser-use.com/api/v2/tasks/${browserTaskId}`,
            {
              headers: {
                "X-Browser-Use-API-Key": BROWSER_USE_API_KEY!,
              },
            }
          );

          if (detailsResponse.ok) {
            const details = await detailsResponse.json();
            console.log(`[Batch ${batchId}] Attempt ${mediaAttempt} - OutputFiles: ${JSON.stringify(details.outputFiles || []).substring(0, 300)}`);
            
            // IMPORTANT: Last chance to capture sessionId
            if (!sessionIdForCleanup) {
              const detailSessionId = details.sessionId || details.session_id;
              if (detailSessionId) {
                sessionIdForCleanup = detailSessionId;
                console.log(`[Batch ${batchId}] Captured sessionId from media fetch: ${sessionIdForCleanup}`);
              }
            }
            
            if (details.steps && Array.isArray(details.steps)) {
              screenshots = details.steps
                .filter((step: any) => step.screenshotUrl)
                .map((step: any) => step.screenshotUrl);
            }
            
            if (details.outputFiles && Array.isArray(details.outputFiles)) {
              console.log(`[Batch ${batchId}] OutputFiles raw:`, JSON.stringify(details.outputFiles));
              
              const videoFiles = details.outputFiles.filter((f: any) => {
                const fileName = f?.fileName || '';
                return fileName.endsWith('.webm') || fileName.endsWith('.mp4');
              });
              
              console.log(`[Batch ${batchId}] Video files found: ${videoFiles.length}`);
              
              for (const file of videoFiles) {
                if (!file.id) continue;
                try {
                  console.log(`[Batch ${batchId}] Fetching download URL for file: ${file.id} (${file.fileName})`);
                  const downloadRes = await fetch(`https://api.browser-use.com/api/v2/files/${file.id}/download`, {
                    headers: { "X-Browser-Use-API-Key": BROWSER_USE_API_KEY! },
                  });
                  
                  if (downloadRes.ok) {
                    const downloadData = await downloadRes.json();
                    console.log(`[Batch ${batchId}] Download response for ${file.id}:`, JSON.stringify(downloadData));
                    const url = downloadData.url || downloadData.downloadUrl || downloadData.download_url || downloadData.signedUrl;
                    if (url) {
                      recordings.push(url);
                      console.log(`[Batch ${batchId}] Got download URL: ${url.substring(0, 100)}...`);
                    }
                  } else {
                    console.log(`[Batch ${batchId}] Download endpoint failed for ${file.id}: ${downloadRes.status}`);
                  }
                } catch (e) {
                  console.error(`[Batch ${batchId}] Error fetching download URL for ${file.id}:`, e);
                }
              }
            }
            
            console.log(`[Batch ${batchId}] Attempt ${mediaAttempt}: ${screenshots.length} screenshots, ${recordings.length} recordings`);
            
            if (recordings.length > 0) {
              console.log(`[Batch ${batchId}] Got recordings on attempt ${mediaAttempt}`);
              break;
            }
          }
        } catch (mediaError) {
          console.error(`[Batch ${batchId}] Media fetch attempt ${mediaAttempt} error:`, mediaError);
        }
        
        if (mediaAttempt < maxMediaRetries) {
          await delay(5000);
        }
      }
      
      console.log(`[Batch ${batchId}] Final media: ${screenshots.length} screenshots, ${recordings.length} recordings`);

      // Calculate step count and estimated cost
      let stepCount = 0;
      try {
        const detailsForSteps = await fetch(
          `https://api.browser-use.com/api/v2/tasks/${browserTaskId}`,
          { headers: { "X-Browser-Use-API-Key": BROWSER_USE_API_KEY! } }
        );
        if (detailsForSteps.ok) {
          const stepsData = await detailsForSteps.json();
          stepCount = Array.isArray(stepsData.steps) ? stepsData.steps.length : 0;
        }
      } catch (e) {
        console.error(`[Batch ${batchId}] Error fetching step count:`, e);
      }

      const execMinutes = (executionTimeMs || 0) / 60000;
      const proxyRate = recordVideo ? 0.008 : 0.004;
      const estimatedCost = 0.01 + (stepCount * 0.01) + (execMinutes * proxyRate);
      
      console.log(`[Batch ${batchId}] Cost: ${stepCount} steps, ${execMinutes.toFixed(2)} min, $${estimatedCost.toFixed(4)}`);

      await supabase
        .from("tasks")
        .update({
          status: finalStatus === "passed" ? "completed" : (finalStatus === "not_passed" ? "completed" : "failed"),
          completed_at: new Date().toISOString(),
          screenshots: screenshots.length > 0 ? screenshots : null,
          recordings: recordings.length > 0 ? recordings : null,
          result: { output: resultSummary, reasoning: resultReasoning },
          step_count: stepCount,
        })
        .eq("id", taskRecord.id);

      await supabase
        .from("generated_tests")
        .update({
          status: finalStatus,
          last_run_at: new Date().toISOString(),
          execution_time_ms: executionTimeMs,
          result_summary: resultSummary || null,
          result_reasoning: resultReasoning || null,
          step_count: stepCount,
          estimated_cost: estimatedCost,
        })
        .eq("id", testId);

      if (finalStatus === "passed") {
        passedTests++;
      } else {
        failedTests++;
      }

      console.log(`[Batch ${batchId}] Test ${testId} completed with status: ${finalStatus}`);
    } catch (error) {
      console.error(`[Batch ${batchId}] Error running test ${testId}:`, error);

      try {
        await supabase
          .from("generated_tests")
          .update({
            status: "failed",
            last_run_at: new Date().toISOString(),
            result_summary: `Chyba: ${error instanceof Error ? error.message : "Neznámá chyba"}`,
          })
          .eq("id", testId);
      } catch (updateError) {
        console.error(`[Batch ${batchId}] Failed to update test status:`, updateError);
      }

      failedTests++;
    }

    // Always increment completed tests and update batch progress
    completedTests++;
    console.log(`[Batch ${batchId}] Updating batch progress: ${completedTests}/${testIds.length} completed, ${passedTests} passed, ${failedTests} failed`);

    try {
      const { error: progressError } = await supabase
        .from("test_batch_runs")
        .update({
          completed_tests: completedTests,
          passed_tests: passedTests,
          failed_tests: failedTests,
          updated_at: new Date().toISOString(),
        })
        .eq("id", batchId);
      
      if (progressError) {
        console.error(`[Batch ${batchId}] Failed to update batch progress:`, progressError);
      } else {
        console.log(`[Batch ${batchId}] Batch progress updated successfully`);
      }
    } catch (progressUpdateError) {
      console.error(`[Batch ${batchId}] Critical error updating batch progress:`, progressUpdateError);
    }

    // Re-check batch state before continuing to next test
    const { data: continueCheck } = await supabase
      .from("test_batch_runs")
      .select("status, paused")
      .eq("id", batchId)
      .single();
    
    if (continueCheck?.status === "cancelled") {
      console.log(`[Batch ${batchId}] Batch cancelled after test completion, stopping`);
      break;
    }

    // Explicitly close the browser session to free up concurrent slot - using resilient method
    if (sessionIdForCleanup) {
      await stopSessionResilient(sessionIdForCleanup, batchId);
    }

    // Wait between tests to ensure session is fully released
    // Minimum 5 seconds safety delay even if batchDelaySecondsForCleanup is lower
    const minDelay = Math.max(batchDelaySecondsForCleanup, 5) * 1000;
    console.log(`[Batch ${batchId}] Waiting ${minDelay / 1000}s before next test...`);
    await delay(minDelay);
  }

  // Mark batch as completed
  await supabase
    .from("test_batch_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      current_test_id: null,
    })
    .eq("id", batchId);

  console.log(
    `[Batch ${batchId}] Completed: ${completedTests} tests, ${passedTests} passed, ${failedTests} failed`
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batchId, testIds, userId, batchDelaySeconds } = await req.json();

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

    // Check for already active batches for this user (pending OR running)
    const supabaseCheck = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const { data: activeBatches, error: checkError } = await supabaseCheck
      .from("test_batch_runs")
      .select("id, status")
      .eq("user_id", userId)
      .in("status", ["pending", "running"])
      .neq("id", batchId);

    if (checkError) {
      console.error("[run-tests-batch] Error checking active batches:", checkError);
    }

    if (activeBatches && activeBatches.length > 0) {
      console.log(`[run-tests-batch] User ${userId} already has active batch: ${activeBatches[0].id} (status: ${activeBatches[0].status})`);
      return new Response(
        JSON.stringify({ 
          error: "Již běží jiný batch run. Počkejte na jeho dokončení nebo ho zrušte.",
          runningBatchId: activeBatches[0].id 
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[run-tests-batch] Starting batch ${batchId} with ${testIds.length} tests${batchDelaySeconds ? `, delay: ${batchDelaySeconds}s` : ''}`);

    // Start background task using global EdgeRuntime
    (globalThis as any).EdgeRuntime.waitUntil(runBatchInBackground(batchId, testIds, userId, batchDelaySeconds));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Batch ${batchId} started in background`,
        batchId,
        totalTests: testIds.length,
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
