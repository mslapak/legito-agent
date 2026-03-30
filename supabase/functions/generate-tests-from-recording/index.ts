import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const stepsText = recorded_steps.map((step: any, i: number) => {
      const parts = [`Step ${i + 1}:`];
      if (step.url) parts.push(`  URL: ${step.url}`);
      if (step.next_goal) parts.push(`  Action: ${step.next_goal}`);
      if (step.evaluation_previous_goal) parts.push(`  Result: ${step.evaluation_previous_goal}`);
      return parts.join("\n");
    }).join("\n\n");

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

    // Call AI Gateway
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const aiResponse = await fetch("https://ai-gateway.lovable.dev/v1/chat/completions", {
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
      return new Response(JSON.stringify({ error: "AI generation failed", details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    let testCases: any[] = [];

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      testCases = parsed.testCases || [];
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
