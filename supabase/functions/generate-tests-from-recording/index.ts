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
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

const stringifyActions = (actions: unknown): string => {
  if (!Array.isArray(actions)) return "";

  return actions
    .map((action) => {
      if (typeof action === "string") return action;
      try {
        return JSON.stringify(action);
      } catch {
        return "";
      }
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
  const stepDescriptions = recordedSteps
    .slice(0, 12)
    .map((step, index) => {
      const description = firstNonEmptyString(
        step.memory,
        step.next_goal,
        step.nextGoal,
        step.evaluation_previous_goal,
        step.evaluationPreviousGoal,
        stringifyActions(step.actions),
      );

      if (!description) {
        const stepUrl = firstNonEmptyString(step.url);
        return stepUrl ? `${index + 1}. Open ${stepUrl}` : `${index + 1}. Replay observed interaction`;
      }

      return `${index + 1}. ${description}`;
    });

  const expectedResult =
    [...recordedSteps]
      .reverse()
      .map((step) =>
        firstNonEmptyString(
          step.evaluation_previous_goal,
          step.evaluationPreviousGoal,
          step.memory,
        ),
      )
      .find(Boolean) ||
    "The recorded flow should be reproducible without unexpected regressions.";

  const testCases = [
    {
      title: sessionTitle?.trim() ? `${sessionTitle.trim()} — replay recorded flow` : "Replay recorded user flow",
      prompt: [
        baseUrl ? `Open ${baseUrl}.` : null,
        "Replay the observed user flow in this order:",
        ...stepDescriptions,
        "Verify the application state and messages match the recorded observations.",
      ]
        .filter(Boolean)
        .join("\n"),
      expectedResult,
      priority: recordedSteps.length >= 3 ? "high" : "medium",
    },
  ];

  const validationObservation = [...recordedSteps]
    .map((step) =>
      firstNonEmptyString(
        step.memory,
        step.evaluation_previous_goal,
        step.evaluationPreviousGoal,
      ),
    )
    .find((text) => /error|validation|invalid|workspace|failed|not found/i.test(text));

  if (validationObservation) {
    testCases.push({
      title: "Verify observed validation or error handling",
      prompt: [
        baseUrl ? `Open ${baseUrl}.` : null,
        "Repeat the input or submit action that led to the observed validation or error state during recording.",
        "Verify the application displays the same protective feedback and does not proceed silently.",
      ]
        .filter(Boolean)
        .join("\n"),
      expectedResult: validationObservation,
      priority: "medium",
    });
  }

  return testCases;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth
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

    // Format steps for AI analysis
    const stepsText = recorded_steps
      .map((step: any, i: number) => describeStep(step, i))
      .join("\n\n");

    const systemPrompt = `You are a QA test case generator. You analyze recorded user interaction steps from a browser session and generate structured test cases for Azure DevOps.

Rules:
- Group related sequential steps into logical test cases (e.g. "Login flow", "Form submission", "Navigation check")
- Each test case should be independently executable
- Write clear, actionable prompts that a browser automation agent can follow
- Include expected results based on what was observed during recording
- Assign priority: high for critical flows (login, payment), medium for standard features, low for cosmetic/minor
- Write in the same language as the recorded steps (Czech or English)
- Generate 3-15 test cases depending on session complexity`;

    const userPrompt = `Analyze these recorded browser interaction steps and generate test cases:

${base_url ? `Base URL: ${base_url}` : ""}
${session_title ? `Session: ${session_title}` : ""}

RECORDED STEPS:
${stepsText}

Generate structured test cases from these interactions.`;

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
                  name: "generate_test_cases",
                  description: "Generate structured test cases from recorded steps",
                  parameters: {
                    type: "object",
                    properties: {
                      testCases: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            title: { type: "string", description: "Short descriptive test case title" },
                            prompt: { type: "string", description: "Detailed step-by-step instructions for browser automation agent" },
                            expectedResult: { type: "string", description: "What should be verified after execution" },
                            priority: { type: "string", enum: ["high", "medium", "low"] },
                          },
                          required: ["title", "prompt", "expectedResult", "priority"],
                        },
                      },
                    },
                    required: ["testCases"],
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "generate_test_cases" } },
          }),
        });

        if (!aiResponse.ok) {
          const errText = await aiResponse.text();
          console.error("AI Gateway error:", errText);
        } else {
          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            const parsed = JSON.parse(toolCall.function.arguments);
            testCases = parsed.testCases || [];
          }
        }
      } catch (aiError) {
        console.error("AI generation failed, using fallback test generation:", aiError);
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
