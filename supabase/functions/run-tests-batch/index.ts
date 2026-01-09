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

      // Get project info for setup_prompt and credentials
      let setupPrompt = "";
      let baseUrl = "";
      let credentials = "";

      if (test.project_id) {
        const { data: project } = await supabase
          .from("projects")
          .select("setup_prompt, base_url")
          .eq("id", test.project_id)
          .single();

        if (project) {
          setupPrompt = project.setup_prompt || "";
          baseUrl = project.base_url || "";
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

      // Update test status to running
      await supabase
        .from("generated_tests")
        .update({ status: "running" })
        .eq("id", testId);

      // Create browser-use task
      console.log(`[Batch ${batchId}] Creating browser-use task for test ${testId}`);
      const createResponse = await fetch("https://api.browser-use.com/api/v2/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": BROWSER_USE_API_KEY!,
        },
        body: JSON.stringify({
          task: fullPrompt,
          save_browser_data: false,
        }),
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

      // Save task_id to generated_tests
      await supabase
        .from("generated_tests")
        .update({ task_id: browserTaskId })
        .eq("id", testId);

      // Poll for task completion (max 5 minutes)
      let taskCompleted = false;
      let attempts = 0;
      const maxAttempts = 100; // 100 * 3s = 5 minutes
      let finalStatus = "passed";
      let resultSummary = "";
      let executionTimeMs: number | null = null;

      while (!taskCompleted && attempts < maxAttempts) {
        await delay(3000);
        attempts++;

        try {
          const statusResponse = await fetch(
            `https://api.browser-use.com/api/v2/tasks/${browserTaskId}`,
            {
              headers: {
                "X-API-Key": BROWSER_USE_API_KEY!,
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
          }
        } catch (pollError) {
          console.error(`[Batch ${batchId}] Poll error:`, pollError);
        }
      }

      if (!taskCompleted) {
        finalStatus = "failed";
        resultSummary = "Timeout - test nedoběhl do 5 minut";
      }

      // Update test result
      await supabase
        .from("generated_tests")
        .update({
          status: finalStatus,
          last_run_at: new Date().toISOString(),
          execution_time_ms: executionTimeMs,
          result_summary: resultSummary || null,
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
      await supabase
        .from("generated_tests")
        .update({
          status: "failed",
          last_run_at: new Date().toISOString(),
          result_summary: `Chyba: ${error instanceof Error ? error.message : "Neznámá chyba"}`,
        })
        .eq("id", testId);

      failedTests++;
    }

    completedTests++;

    // Update batch progress
    await supabase
      .from("test_batch_runs")
      .update({
        completed_tests: completedTests,
        passed_tests: passedTests,
        failed_tests: failedTests,
      })
      .eq("id", batchId);
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
