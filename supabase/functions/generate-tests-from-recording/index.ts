import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const firstNonEmptyString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const stringifyActions = (actions: unknown): string => {
  if (!Array.isArray(actions)) return "";
  return actions
    .map((a) => {
      if (typeof a === "string") return a;
      try { return JSON.stringify(a); } catch { return ""; }
    })
    .filter(Boolean)
    .join(", ");
};

const describeStep = (step: Record<string, any>, index: number): string => {
  const url = firstNonEmptyString(step.url);
  const action = firstNonEmptyString(step.next_goal, step.nextGoal);
  const result = firstNonEmptyString(step.evaluation_previous_goal, step.evaluationPreviousGoal);
  const memory = firstNonEmptyString(step.memory, step.observation, step.description);
  const actions = stringifyActions(step.actions);

  const parts = [`Step ${index + 1}:`];
  if (url) parts.push(`  URL: ${url}`);
  if (action) parts.push(`  Action: ${action}`);
  if (result) parts.push(`  Result: ${result}`);
  if (memory) parts.push(`  Observation: ${memory}`);
  if (actions) parts.push(`  Raw actions: ${actions}`);
  return parts.join("\n");
};

const buildFallbackTestCases = (
  recordedSteps: Record<string, any>[],
  baseUrl?: string,
  sessionTitle?: string,
) => {
  const steps = recordedSteps.map((step, i) => {
    const action = firstNonEmptyString(
      step.next_goal, step.nextGoal, step.memory,
      stringifyActions(step.actions),
    ) || (step.url ? `Open ${step.url}` : "Replay observed interaction");

    const expected = firstNonEmptyString(
      step.evaluation_previous_goal, step.evaluationPreviousGoal, step.memory,
    ) || "Action completes without errors";

    return { action: `${i + 1}. ${action}`, expected: `${i + 1}. ${expected}` };
  });

  const prompt = steps.map((s) => s.action).join("\n");
  const expectedResult = steps.map((s) => s.expected).join("\n");

  return [{
    title: sessionTitle?.trim() || "Replay recorded user flow",
    prompt: baseUrl ? `Open ${baseUrl}\n${prompt}` : prompt,
    expectedResult: baseUrl ? `Page loads successfully\n${expectedResult}` : expectedResult,
    priority: recordedSteps.length >= 3 ? "high" : "medium",
  }];
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { recorded_steps, project_id, base_url, session_title } = await req.json();

    if (!recorded_steps || !Array.isArray(recorded_steps) || recorded_steps.length === 0) {
      return new Response(JSON.stringify({ error: "No recorded steps provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stepsText = recorded_steps
      .map((step: any, i: number) => describeStep(step, i))
      .join("\n\n");

    const systemPrompt = `You are a QA test case generator. You analyze recorded browser session steps and produce ONE detailed structured test case.

Rules:
- Generate exactly ONE test case covering the entire recorded session
- SKIP idle steps: Do NOT include "Wait for X seconds", "No action detected", or any step where the user did nothing. These are observation artifacts, not user actions.
- EXTRACT REAL USER ACTIONS: Focus on what the user actually did — clicked a button, navigated to a URL, typed text into a field, selected a dropdown option, scrolled to an element, opened a tab, submitted a form, etc.
- Look at the "Action", "Observation", and "Raw actions" fields in each recorded step to identify the real interaction (e.g. click_element, input_text, go_to_url, select_option)
- Each step must be a specific, actionable instruction: "Click on the 'Login' button", "Enter 'admin@test.com' into the Email field", "Navigate to https://example.com/dashboard"
- For EVERY step provide a corresponding expected result: what should visibly happen after the action (e.g. "Login form submits and dashboard appears", "Email field shows the entered address")
- The number of steps MUST equal the number of expected results (1:1 mapping)
- Write in the same language as the recorded steps (Czech or English)
- Assign priority: high for critical flows (login, payment, data entry), medium for standard features, low for cosmetic/minor
- Be specific: use exact URLs, button labels, field names, CSS selectors from the recording
- The first step should typically be "Navigate to URL: <base_url>"`;

    const userPrompt = `Analyze these recorded browser interaction steps. Extract ONLY the real user actions (clicks, typing, navigation, selections) and ignore any idle/wait steps. Generate ONE detailed test case:

${base_url ? `Base URL: ${base_url}` : ""}
${session_title ? `Session: ${session_title}` : ""}

RECORDED STEPS:
${stepsText}

IMPORTANT: Do NOT create steps like "Wait for 5 seconds" — these are NOT user actions. Extract only genuine interactions from the Action/Observation/Raw actions data.`;

    let testCases: any[] = [];

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (lovableApiKey) {
      try {
        const aiResponse = await fetch(AI_GATEWAY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "generate_test_case",
                  description: "Generate a single detailed test case from recorded steps with 1:1 step-to-expected mapping",
                  parameters: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Descriptive test case title based on the session" },
                      steps: {
                        type: "array",
                        description: "Ordered list of test steps, one per recorded interaction",
                        items: {
                          type: "object",
                          properties: {
                            action: { type: "string", description: "Specific actionable instruction (e.g. Click on X, Enter value Y, Wait for Z)" },
                            expected: { type: "string", description: "Expected result after performing this action" },
                          },
                          required: ["action", "expected"],
                        },
                      },
                      priority: { type: "string", enum: ["high", "medium", "low"] },
                    },
                    required: ["title", "steps", "priority"],
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "generate_test_case" } },
          }),
        });

        if (!aiResponse.ok) {
          console.error("AI Gateway error:", await aiResponse.text());
        } else {
          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            const parsed = JSON.parse(toolCall.function.arguments);
            if (parsed.steps && Array.isArray(parsed.steps)) {
              const prompt = parsed.steps.map((s: any, i: number) => `${i + 1}. ${s.action}`).join("\n");
              const expectedResult = parsed.steps.map((s: any, i: number) => `${i + 1}. ${s.expected}`).join("\n");
              testCases = [{
                title: parsed.title || session_title || "Recorded test case",
                prompt,
                expectedResult,
                priority: parsed.priority || "medium",
              }];
            }
          }
        }
      } catch (aiError) {
        console.error("AI generation failed, using fallback:", aiError);
      }
    }

    if (testCases.length === 0) {
      testCases = buildFallbackTestCases(recorded_steps, base_url, session_title);
    }

    return new Response(JSON.stringify({ testCases }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
