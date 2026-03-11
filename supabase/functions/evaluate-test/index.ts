import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// ==================== TYPES ====================

interface Requirement {
  id: string;
  type: "url_match" | "text_presence" | "element_exists" | "no_errors" | "custom";
  description: string;
  value?: string;
}

interface RequirementResult {
  id: string;
  status: "passed" | "failed" | "unknown";
  reasoning: string;
  source: "deterministic" | "ai";
}

interface EvidenceBundle {
  technical_status: "success" | "error";
  execution: {
    steps_completed: number;
    execution_time_ms: number;
  };
  evidence: {
    final_url: string;
    output_text: string;
    screenshot_urls: string[];
    console_errors: number;
    step_summaries: string[];
  };
  raw_output: string;
}

interface EvaluationResult {
  technical_status: string;
  requirements: RequirementResult[];
  assertion_score: number;
  requirement_score: number;
  ai_alignment_score: number;
  final_score: number;
  confidence: number;
  final_status: "passed" | "degraded" | "failed" | "error";
  reasoning: string[];
}

// ==================== REQUIREMENT EXTRACTION ====================

async function extractRequirements(expectedResult: string): Promise<Requirement[]> {
  if (!expectedResult || expectedResult.trim() === "") {
    return [];
  }

  if (!LOVABLE_API_KEY) {
    // Fallback: create a single custom requirement from the text
    return [{ id: "R1", type: "custom", description: expectedResult, value: expectedResult }];
  }

  try {
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
            content: `You are a QA requirements analyst. Extract testable requirements from the expected result description. Each requirement should be independently verifiable. Use these types:
- url_match: The final URL should contain a specific path or pattern. Set "value" to the URL fragment.
- text_presence: A specific text/message should be visible on the page. Set "value" to the exact text to search for.
- element_exists: A specific UI element should exist. Set "value" to the element description.
- no_errors: No error messages or console errors should be present.
- custom: Any other verifiable condition. Set "value" to the condition description.

Extract 1-5 requirements. Be specific and actionable.`,
          },
          {
            role: "user",
            content: `Extract testable requirements from this expected result:\n\n"${expectedResult}"`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_requirements",
              description: "Extract structured testable requirements from expected result text.",
              parameters: {
                type: "object",
                properties: {
                  requirements: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", description: "Requirement ID like R1, R2, etc." },
                        type: { type: "string", enum: ["url_match", "text_presence", "element_exists", "no_errors", "custom"] },
                        description: { type: "string", description: "Human-readable description of what to verify" },
                        value: { type: "string", description: "The specific value to check for (URL fragment, text, element name, etc.)" },
                      },
                      required: ["id", "type", "description"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["requirements"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_requirements" } },
      }),
    });

    if (!response.ok) {
      console.error("AI extraction failed:", response.status);
      return [{ id: "R1", type: "custom", description: expectedResult, value: expectedResult }];
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return parsed.requirements || [];
    }

    return [{ id: "R1", type: "custom", description: expectedResult, value: expectedResult }];
  } catch (e) {
    console.error("Requirement extraction error:", e);
    return [{ id: "R1", type: "custom", description: expectedResult, value: expectedResult }];
  }
}

// ==================== DETERMINISTIC VALIDATION ====================

function validateDeterministic(requirements: Requirement[], evidence: EvidenceBundle["evidence"]): RequirementResult[] {
  return requirements.map((req) => {
    switch (req.type) {
      case "url_match": {
        if (!evidence.final_url || !req.value) {
          return { id: req.id, status: "unknown" as const, reasoning: "No URL evidence available", source: "deterministic" as const };
        }
        const urlLower = evidence.final_url.toLowerCase();
        const valueLower = req.value.toLowerCase();
        if (urlLower.includes(valueLower)) {
          return { id: req.id, status: "passed" as const, reasoning: `URL contains "${req.value}"`, source: "deterministic" as const };
        }
        return { id: req.id, status: "failed" as const, reasoning: `URL "${evidence.final_url}" does not contain "${req.value}"`, source: "deterministic" as const };
      }

      case "text_presence": {
        if (!req.value) {
          return { id: req.id, status: "unknown" as const, reasoning: "No value to check", source: "deterministic" as const };
        }
        const outputLower = (evidence.output_text || "").toLowerCase();
        const stepText = evidence.step_summaries.join(" ").toLowerCase();
        const allText = `${outputLower} ${stepText}`;
        const searchValue = req.value.toLowerCase();
        if (allText.includes(searchValue)) {
          return { id: req.id, status: "passed" as const, reasoning: `Text "${req.value}" found in output`, source: "deterministic" as const };
        }
        // Partial match: check individual words
        const words = searchValue.split(/\s+/).filter((w) => w.length > 3);
        const matched = words.filter((w) => allText.includes(w));
        if (words.length > 0 && matched.length / words.length >= 0.7) {
          return { id: req.id, status: "passed" as const, reasoning: `${Math.round((matched.length / words.length) * 100)}% of key words found`, source: "deterministic" as const };
        }
        return { id: req.id, status: "unknown" as const, reasoning: `Text "${req.value}" not directly found, needs AI analysis`, source: "deterministic" as const };
      }

      case "no_errors": {
        if (evidence.console_errors === 0) {
          return { id: req.id, status: "passed" as const, reasoning: "No console errors detected", source: "deterministic" as const };
        }
        return { id: req.id, status: "failed" as const, reasoning: `${evidence.console_errors} console errors detected`, source: "deterministic" as const };
      }

      case "element_exists": {
        if (!req.value) {
          return { id: req.id, status: "unknown" as const, reasoning: "No element to check", source: "deterministic" as const };
        }
        const allOutput = `${evidence.output_text || ""} ${evidence.step_summaries.join(" ")}`.toLowerCase();
        if (allOutput.includes(req.value.toLowerCase())) {
          return { id: req.id, status: "passed" as const, reasoning: `Element reference "${req.value}" found in output`, source: "deterministic" as const };
        }
        return { id: req.id, status: "unknown" as const, reasoning: `Element "${req.value}" not found deterministically, needs AI`, source: "deterministic" as const };
      }

      case "custom":
      default:
        return { id: req.id, status: "unknown" as const, reasoning: "Custom requirement needs AI evaluation", source: "deterministic" as const };
    }
  });
}

// ==================== AI EVALUATION ====================

async function evaluateWithAI(
  unknownRequirements: { req: Requirement; result: RequirementResult }[],
  evidence: EvidenceBundle
): Promise<RequirementResult[]> {
  if (unknownRequirements.length === 0 || !LOVABLE_API_KEY) {
    return unknownRequirements.map((u) => ({
      ...u.result,
      status: "unknown" as const,
      reasoning: u.result.reasoning + " (AI unavailable)",
      source: "ai" as const,
    }));
  }

  const evidenceSummary = `
Final URL: ${evidence.evidence.final_url || "unknown"}
Output text (excerpt): ${(evidence.evidence.output_text || "").substring(0, 2000)}
Steps completed: ${evidence.execution.steps_completed}
Console errors: ${evidence.evidence.console_errors}
Step summaries: ${evidence.evidence.step_summaries.slice(0, 10).join("\n")}
Technical status: ${evidence.technical_status}
  `.trim();

  const reqDescriptions = unknownRequirements.map((u) => `- ${u.req.id}: ${u.req.description} (type: ${u.req.type}, value: "${u.req.value || ""}")`).join("\n");

  try {
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
            content: `You are a QA test evaluator. Based on the evidence from a browser automation test, determine whether each requirement was met. Be conservative: if evidence is ambiguous, mark as "failed". Provide brief reasoning for each.`,
          },
          {
            role: "user",
            content: `Evaluate these requirements against the evidence:\n\nRequirements:\n${reqDescriptions}\n\nEvidence:\n${evidenceSummary}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "evaluate_requirements",
              description: "Evaluate requirements against test evidence",
              parameters: {
                type: "object",
                properties: {
                  requirements_status: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        status: { type: "string", enum: ["passed", "failed"] },
                        reasoning: { type: "string" },
                      },
                      required: ["id", "status", "reasoning"],
                      additionalProperties: false,
                    },
                  },
                  confidence: { type: "number", description: "Overall confidence 0.0-1.0" },
                },
                required: ["requirements_status", "confidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "evaluate_requirements" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error("AI rate limited");
      } else if (response.status === 402) {
        console.error("AI payment required");
      }
      return unknownRequirements.map((u) => ({
        ...u.result,
        source: "ai" as const,
      }));
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      const aiResults = parsed.requirements_status || [];

      return unknownRequirements.map((u) => {
        const aiResult = aiResults.find((a: { id: string }) => a.id === u.req.id);
        if (aiResult) {
          return {
            id: u.req.id,
            status: aiResult.status as "passed" | "failed",
            reasoning: aiResult.reasoning,
            source: "ai" as const,
          };
        }
        return { ...u.result, source: "ai" as const };
      });
    }

    return unknownRequirements.map((u) => ({ ...u.result, source: "ai" as const }));
  } catch (e) {
    console.error("AI evaluation error:", e);
    return unknownRequirements.map((u) => ({ ...u.result, source: "ai" as const }));
  }
}

// ==================== SCORING ENGINE ====================

function computeScore(
  requirements: Requirement[],
  results: RequirementResult[],
  technicalStatus: string,
  aiConfidence: number
): EvaluationResult {
  // Technical error overrides everything
  if (technicalStatus === "error") {
    return {
      technical_status: technicalStatus,
      requirements: results,
      assertion_score: 0,
      requirement_score: 0,
      ai_alignment_score: 0,
      final_score: 0,
      confidence: 1.0,
      final_status: "error",
      reasoning: ["Technical error occurred during test execution"],
    };
  }

  // No requirements = auto pass if technical success
  if (requirements.length === 0) {
    return {
      technical_status: technicalStatus,
      requirements: results,
      assertion_score: 1.0,
      requirement_score: 1.0,
      ai_alignment_score: 1.0,
      final_score: 1.0,
      confidence: 0.7,
      final_status: "passed",
      reasoning: ["Test completed without defined expected result"],
    };
  }

  // Calculate deterministic assertion score
  const deterministicResults = results.filter((r) => r.source === "deterministic" && r.status !== "unknown");
  const deterministicPassed = deterministicResults.filter((r) => r.status === "passed").length;
  const assertionScore = deterministicResults.length > 0 ? deterministicPassed / deterministicResults.length : 0.5;

  // Calculate overall requirement score (all results)
  const allResolved = results.filter((r) => r.status !== "unknown");
  const allPassed = allResolved.filter((r) => r.status === "passed").length;
  const requirementScore = allResolved.length > 0 ? allPassed / allResolved.length : 0.5;

  // AI alignment score = confidence from AI, or 0.5 if no AI used
  const aiResults = results.filter((r) => r.source === "ai");
  const aiAlignmentScore = aiResults.length > 0 ? aiConfidence : 0.5;

  // Weighted final score: 40% deterministic, 40% requirements, 20% AI
  const finalScore = assertionScore * 0.4 + requirementScore * 0.4 + aiAlignmentScore * 0.2;

  // Status mapping
  let finalStatus: "passed" | "degraded" | "failed";
  if (finalScore >= 0.8) {
    finalStatus = "passed";
  } else if (finalScore >= 0.6) {
    finalStatus = "degraded";
  } else {
    finalStatus = "failed";
  }

  // Build reasoning
  const reasoning: string[] = [];
  for (const r of results) {
    const icon = r.status === "passed" ? "✔" : r.status === "failed" ? "✗" : "?";
    reasoning.push(`${icon} ${r.id}: ${r.reasoning}`);
  }

  return {
    technical_status: technicalStatus,
    requirements: results,
    assertion_score: Math.round(assertionScore * 100) / 100,
    requirement_score: Math.round(requirementScore * 100) / 100,
    ai_alignment_score: Math.round(aiAlignmentScore * 100) / 100,
    final_score: Math.round(finalScore * 100) / 100,
    confidence: Math.round((aiResults.length > 0 ? aiConfidence : assertionScore) * 100) / 100,
    final_status: finalStatus,
    reasoning,
  };
}

// ==================== MAIN HANDLER ====================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { expected_result, evidence_bundle, action } = await req.json();

    // Action: extract requirements only
    if (action === "extract") {
      const requirements = await extractRequirements(expected_result || "");
      return new Response(JSON.stringify({ requirements }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: full evaluation (default)
    const expectedResult: string = expected_result || "";
    const evidence: EvidenceBundle = evidence_bundle || {
      technical_status: "success",
      execution: { steps_completed: 0, execution_time_ms: 0 },
      evidence: { final_url: "", output_text: "", screenshot_urls: [], console_errors: 0, step_summaries: [] },
      raw_output: "",
    };

    // Step 1: Extract requirements
    const requirements = await extractRequirements(expectedResult);

    // Step 2: Deterministic validation
    const deterministicResults = validateDeterministic(requirements, evidence.evidence);

    // Step 3: AI evaluation for unknowns
    const unknowns = deterministicResults
      .filter((r) => r.status === "unknown")
      .map((r) => ({
        req: requirements.find((req) => req.id === r.id)!,
        result: r,
      }))
      .filter((u) => u.req);

    let aiConfidence = 0.5;
    let finalResults = [...deterministicResults];

    if (unknowns.length > 0) {
      const aiResults = await evaluateWithAI(unknowns, evidence);
      
      // Try to extract confidence from AI response
      // Use average of AI-resolved results as proxy
      const aiPassed = aiResults.filter(r => r.status === "passed").length;
      aiConfidence = aiResults.length > 0 ? (aiPassed / aiResults.length) * 0.9 + 0.1 : 0.5;
      
      // Merge AI results back
      finalResults = deterministicResults.map((dr) => {
        if (dr.status === "unknown") {
          const aiResult = aiResults.find((ar) => ar.id === dr.id);
          return aiResult || dr;
        }
        return dr;
      });
    }

    // Step 4: Compute score
    const evaluation = computeScore(requirements, finalResults, evidence.technical_status, aiConfidence);

    return new Response(JSON.stringify(evaluation), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("evaluate-test error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
