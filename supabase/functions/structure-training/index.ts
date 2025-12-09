import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, name } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert at analyzing training documentation and converting it into structured, actionable instructions for a browser automation agent.

Your task is to:
1. Read the provided training content
2. Extract the key steps and actions described
3. Convert them into a structured list of instructions that an AI agent can follow

Return a JSON array of steps, where each step has:
- "title": A short action title (e.g., "Navigate to Dashboard")
- "description": Detailed instructions for this step
- "expected_outcome": What should happen after completing this step (optional)

Focus on:
- Clear, actionable steps
- Specific UI elements to interact with (buttons, links, fields)
- Order of operations
- Any conditions or decision points

Respond ONLY with a valid JSON array, no additional text.`,
          },
          {
            role: "user",
            content: `Training document: "${name}"\n\nContent:\n${content}`,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;

    if (!aiResponse) {
      throw new Error("No response from AI");
    }

    // Parse the JSON response
    let instructions;
    try {
      // Clean up the response (remove markdown code blocks if present)
      const cleanedResponse = aiResponse.replace(/```json\n?|\n?```/g, "").trim();
      instructions = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error("Failed to parse AI response:", aiResponse);
      throw new Error("Invalid AI response format");
    }

    return new Response(
      JSON.stringify({ instructions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in structure-training:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
