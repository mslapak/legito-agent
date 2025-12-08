import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { description, documentation, baseUrl, testType } = await req.json();
    const hasDocumentation = documentation && documentation.trim().length > 0;
    
    console.log(`Generating tests - Source: ${hasDocumentation ? 'documentation' : 'description'}, Type: ${testType}`);

    // Different system prompts based on source
    const systemPromptForDescription = `You are an expert QA engineer specializing in browser automation testing. 
Your task is to generate comprehensive test cases for web applications based on their description.
Each test case should be a clear, actionable prompt that can be executed by a browser automation agent.

Guidelines:
- Write test cases as natural language instructions
- Be specific about expected outcomes
- Include edge cases and error scenarios
- Consider user flows and interactions
- Make each test case independent and atomic

Output format: Return test cases using the generate_test_cases function.`;

    const systemPromptForDocumentation = `You are an expert QA engineer specializing in browser automation testing.
Your task is to analyze application documentation/guides/specifications and extract comprehensive test cases.
Each test case should verify that the application behaves exactly as described in the documentation.

Guidelines:
- Extract ALL testable scenarios from the documentation
- Create test cases for each described feature, user flow, and behavior
- Include positive tests (happy path) as well as negative tests (error handling)
- Write test cases as natural language instructions for a browser automation agent
- Be very specific - reference exact elements, buttons, messages mentioned in docs
- Include validation of expected outcomes as described in the documentation
- Cover edge cases implied by the documentation
- If the documentation mentions error messages, create tests to verify them
- Make each test case independent and atomic

Focus on:
1. User flows and navigation described in the docs
2. Form validations and expected error messages
3. Feature functionality as specified
4. UI elements and their expected behavior
5. Business logic and rules mentioned
6. Integration points described

Output format: Return test cases using the generate_test_cases function.`;

    const systemPrompt = hasDocumentation ? systemPromptForDocumentation : systemPromptForDescription;

    const userPromptForDescription = `Generate comprehensive ${testType || 'functional'} test cases for the following application:

Application URL: ${baseUrl || 'Not specified'}
Description: ${description}

Generate 5-10 test cases covering:
1. Happy path scenarios
2. Edge cases
3. Error handling
4. User experience validation
5. Data validation (if applicable)`;

    const userPromptForDocumentation = `Analyze the following application documentation and generate comprehensive ${testType || 'functional'} test cases.
Extract ALL testable scenarios from this documentation.

Application URL: ${baseUrl || 'Not specified'}

=== DOCUMENTATION START ===
${documentation}
=== DOCUMENTATION END ===

Based on the documentation above, generate test cases that verify:
1. Every feature and functionality mentioned
2. All user flows described step by step
3. Form validations and expected error messages
4. UI behavior and element interactions
5. Business rules and logic
6. Edge cases implied by the documentation

Be thorough - the goal is to have complete test coverage of everything described in the documentation.`;

    const userPrompt = hasDocumentation ? userPromptForDocumentation : userPromptForDescription;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_test_cases",
              description: "Generate test cases for the web application",
              parameters: {
                type: "object",
                properties: {
                  testCases: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Short descriptive title for the test case" },
                        prompt: { type: "string", description: "Detailed step-by-step instructions for the browser automation agent to execute this test" },
                        expectedResult: { type: "string", description: "What should happen if the test passes - the expected outcome" },
                        priority: { type: "string", enum: ["low", "medium", "high"], description: "Priority level based on business importance" }
                      },
                      required: ["title", "prompt", "expectedResult", "priority"]
                    }
                  }
                },
                required: ["testCases"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_test_cases" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI Gateway error:', errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI response received, processing...');

    // Extract test cases from tool call response
    let testCases = [];
    if (data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments) {
      const args = JSON.parse(data.choices[0].message.tool_calls[0].function.arguments);
      testCases = args.testCases;
      console.log(`Generated ${testCases.length} test cases`);
    }

    return new Response(JSON.stringify({ testCases }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-tests function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
