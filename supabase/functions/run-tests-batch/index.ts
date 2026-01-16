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

// Evaluate test result against expected result
function evaluateTestResult(resultSummary: string, expectedResult: string | null): { status: 'passed' | 'not_passed', reasoning: string } {
  // If no expected result is defined, default to passed (test completed)
  if (!expectedResult || expectedResult.trim() === '') {
    return { status: 'passed', reasoning: 'Test dokončen bez definovaného očekávaného výsledku.' };
  }

  const result = resultSummary.toLowerCase().trim();
  const expected = expectedResult.toLowerCase().trim();

  // Check for explicit failure indicators in result
  const failureIndicators = ['error', 'failed', 'not found', 'timeout', 'exception', 'chyba', 'selhalo', 'nenalezeno'];
  const hasFailureIndicator = failureIndicators.some(ind => result.includes(ind));

  // Check for explicit success indicators in result
  const successIndicators = ['success', 'passed', 'completed', 'verified', 'confirmed', 'ok', 'úspěch', 'ověřeno', 'potvrzeno'];
  const hasSuccessIndicator = successIndicators.some(ind => result.includes(ind));

  // Extract keywords from expected result (words longer than 3 chars)
  const keywords = expected
    .split(/[\s,;.!?]+/)
    .filter(word => word.length > 3)
    .filter(word => !['should', 'must', 'will', 'that', 'this', 'with', 'from', 'have', 'been', 'mělo', 'musí', 'bude', 'tento', 'tato', 'které'].includes(word));

  // Count how many keywords appear in the result
  const matchedKeywords = keywords.filter(kw => result.includes(kw));
  const matchRatio = keywords.length > 0 ? matchedKeywords.length / keywords.length : 0;

  // Decision logic
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

  // If at least 50% of keywords match, consider it passed
  if (matchRatio >= 0.5) {
    return { 
      status: 'passed', 
      reasoning: `${Math.round(matchRatio * 100)}% klíčových slov z očekávaného výsledku nalezeno ve výsledku testu.` 
    };
  }

  // Otherwise, not passed
  return { 
    status: 'not_passed', 
    reasoning: `Pouze ${Math.round(matchRatio * 100)}% klíčových slov z očekávaného výsledku nalezeno. Očekáváno: "${expectedResult.substring(0, 100)}". Skutečný výsledek: "${resultSummary.substring(0, 100)}".` 
  };
}

async function runBatchInBackground(batchId: string, testIds: string[], userId: string) {
  console.log(`[Batch ${batchId}] Starting background execution for ${testIds.length} tests`);

  // Create admin client with service role
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  // Update batch status to running
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

    // Update current test
    await supabase
      .from("test_batch_runs")
      .update({ current_test_id: testId })
      .eq("id", batchId);

    try {
      // Get test details
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

      // Get project info for setup_prompt, credentials, and browser profile
      let setupPrompt = "";
      let baseUrl = "";
      let credentials = "";
      let browserProfileId: string | null = null;
      let maxSteps = 10; // Default to 10 for cost optimization
      let recordVideo = true;

      if (test.project_id) {
        const { data: project } = await supabase
          .from("projects")
          .select("setup_prompt, base_url, browser_profile_id, max_steps, record_video")
          .eq("id", test.project_id)
          .single();

        if (project) {
          setupPrompt = project.setup_prompt || "";
          baseUrl = project.base_url || "";
          browserProfileId = project.browser_profile_id || null;
          maxSteps = project.max_steps ?? 10;
          recordVideo = project.record_video ?? true;
        }

        // Get credentials
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

      // Build full prompt
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
      
      // Step 1: If we have a profile, create a session first
      let sessionId: string | null = null;
      
      if (browserProfileId) {
        console.log(`[Batch ${batchId}] Creating session with profile: ${browserProfileId}`);
        try {
          const sessionPayload = { 
            profileId: browserProfileId,
            profile_id: browserProfileId,
          };
          
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
            console.log(`[Batch ${batchId}] Created session with profile, sessionId: ${sessionId}`);
          } else {
            console.error(`[Batch ${batchId}] Failed to create session with profile: ${sessionRes.status}`);
          }
        } catch (e) {
          console.error(`[Batch ${batchId}] Error creating session with profile:`, e);
        }
      }
      
      // Step 2: Create the task with project cost settings
      const taskPayload: Record<string, unknown> = {
        task: fullPrompt,
        save_browser_data: true,
        record_video: recordVideo,
        max_steps: maxSteps,
      };
      
      // If we created a session with profile, use that sessionId
      if (sessionId) {
        taskPayload.sessionId = sessionId;
        taskPayload.session_id = sessionId;
        console.log(`[Batch ${batchId}] Creating task with session: ${sessionId}`);
      } else if (browserProfileId) {
        // Fallback: try passing profileId directly
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
        throw new Error(`Failed to create task: ${errorText}`);
      }

      const createData = await createResponse.json();
      const browserTaskId = createData.id;

      if (!browserTaskId) {
        throw new Error("No task ID returned from browser-use");
      }

      console.log(`[Batch ${batchId}] Browser-use task created: ${browserTaskId}`);

      // Create record in tasks table BEFORE updating generated_tests
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

      // Update generated_tests with the correct task_id (UUID from tasks table)
      await supabase
        .from("generated_tests")
        .update({ 
          status: "running",
          task_id: taskRecord.id, // This is the UUID from tasks table!
        })
        .eq("id", testId);

      // Poll for task completion (max 5 minutes)
      let taskCompleted = false;
      let attempts = 0;
      const maxAttempts = 100; // 100 * 3s = 5 minutes
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

          if (["finished", "completed", "done", "failed", "error", "stopped"].includes(apiStatus)) {
            taskCompleted = true;

            if (apiStatus === "failed" || apiStatus === "error") {
              finalStatus = "failed";
            }

            // Calculate execution time
            const startedAt = statusData.started_at || statusData.startedAt || statusData.created_at;
            const finishedAt = statusData.finished_at || statusData.finishedAt || new Date().toISOString();

            if (startedAt) {
              executionTimeMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
            }

            // Extract result
            const output = statusData.output || statusData.result || "";
            resultSummary =
              typeof output === "string" ? output.substring(0, 500) : JSON.stringify(output).substring(0, 500);
            
            // Evaluate result against expected result (only if not already failed)
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
      
      // Wait for video processing before fetching media
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
            
            // Extract screenshots from steps
            if (details.steps && Array.isArray(details.steps)) {
              screenshots = details.steps
                .filter((step: any) => step.screenshotUrl)
                .map((step: any) => step.screenshotUrl);
            }
            
            // Extract recordings from outputFiles - v2 API returns {id, fileName} objects
            if (details.outputFiles && Array.isArray(details.outputFiles)) {
              console.log(`[Batch ${batchId}] OutputFiles raw:`, JSON.stringify(details.outputFiles));
              
              // Filter for video files
              const videoFiles = details.outputFiles.filter((f: any) => {
                const fileName = f?.fileName || '';
                return fileName.endsWith('.webm') || fileName.endsWith('.mp4');
              });
              
              console.log(`[Batch ${batchId}] Video files found: ${videoFiles.length}`);
              
              // Fetch download URLs for each video file
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
            
            // If we got recordings, we're done
            if (recordings.length > 0) {
              console.log(`[Batch ${batchId}] Got recordings on attempt ${mediaAttempt}`);
              break;
            }
          }
        } catch (mediaError) {
          console.error(`[Batch ${batchId}] Media fetch attempt ${mediaAttempt} error:`, mediaError);
        }
        
        // Wait before next retry (except on last attempt)
        if (mediaAttempt < maxMediaRetries) {
          await delay(5000);
        }
      }
      
      console.log(`[Batch ${batchId}] Final media: ${screenshots.length} screenshots, ${recordings.length} recordings`);

      // Update tasks table with final status and media
      await supabase
        .from("tasks")
        .update({
          status: finalStatus === "passed" ? "completed" : (finalStatus === "not_passed" ? "completed" : "failed"),
          completed_at: new Date().toISOString(),
          screenshots: screenshots.length > 0 ? screenshots : null,
          recordings: recordings.length > 0 ? recordings : null,
          result: { output: resultSummary, reasoning: resultReasoning },
        })
        .eq("id", taskRecord.id);

      // Update test result in generated_tests
      await supabase
        .from("generated_tests")
        .update({
          status: finalStatus,
          last_run_at: new Date().toISOString(),
          execution_time_ms: executionTimeMs,
          result_summary: resultSummary || null,
          result_reasoning: resultReasoning || null,
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

      // Update test as failed
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
    const { batchId, testIds, userId } = await req.json();

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

    console.log(`[run-tests-batch] Starting batch ${batchId} with ${testIds.length} tests`);

    // Start background task using global EdgeRuntime
    (globalThis as any).EdgeRuntime.waitUntil(runBatchInBackground(batchId, testIds, userId));

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
