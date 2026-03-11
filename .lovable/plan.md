

# Evidence-Based QA Engine — Implementation Plan

## Summary

Transform the current keyword-matching test evaluator into a multi-layer evidence-based evaluation system with structured requirements, deterministic validation, AI reasoning, and transparent scoring.

## Scope

9 tasks organized into 4 phases. Each phase builds on the previous one.

---

## Phase 1: Foundation (Tasks 1-3)

### Task 1 — Requirement Extraction Edge Function

Create a new edge function `evaluate-test` that extracts structured requirements from `expected_result` text using AI (Lovable AI Gateway with `google/gemini-2.5-flash`).

**Input:** `{ expected_result: string }`
**Output:**
```json
{
  "requirements": [
    { "id": "R1", "type": "url_match", "description": "User is on confirmation page", "value": "/checkout" },
    { "id": "R2", "type": "text_presence", "description": "Message 'Order placed' visible", "value": "Order placed" },
    { "id": "R3", "type": "no_errors", "description": "No error messages visible" }
  ]
}
```

Uses tool calling to ensure structured JSON output. Requirement types: `url_match`, `text_presence`, `element_exists`, `no_errors`, `custom`.

### Task 2 — Evidence Bundle in `tasks.result`

Extend the `run-tests-batch` edge function to store a structured evidence bundle when finalizing a test. The Browser-Use API output, steps, screenshots, and metadata are already available — restructure them into:

```json
{
  "technical_status": "success|error",
  "execution": { "steps_completed": 8, "execution_time_ms": 13200 },
  "evidence": {
    "final_url": "...",
    "output_text": "...",
    "screenshot_urls": [],
    "console_errors": 0,
    "step_summaries": []
  },
  "raw_output": "original browser-use output"
}
```

No DB schema change needed — `tasks.result` is already JSONB.

### Task 3 — Database: Add scoring columns

Add columns to `generated_tests`:
- `evaluation_details` (JSONB) — full structured evaluation result
- `confidence_score` (numeric) — 0.0-1.0
- `final_score` (numeric) — 0.0-1.0

Add new status value `degraded` alongside existing `passed`, `failed`, `error`, `pending`, `running`.

---

## Phase 2: Evaluation Engine (Tasks 4-6)

### Task 4 — Deterministic Validation

Add deterministic validation logic to the `evaluate-test` edge function:

- `url_match`: compare evidence `final_url` against requirement value
- `text_presence`: search `output_text` for required string
- `no_errors`: check `console_errors === 0`
- `element_exists`: search output text for element references

Each requirement gets status: `passed`, `failed`, or `unknown`.

### Task 5 — AI Evaluation Layer

For requirements with `unknown` status after deterministic checks, call Lovable AI (`google/gemini-2.5-flash`) with:
- The requirement description
- The evidence bundle
- Output text excerpt

AI returns structured JSON via tool calling:
```json
{
  "requirements_status": [
    { "id": "R3", "status": "passed", "reasoning": "No error indicators found" }
  ],
  "confidence": 0.91
}
```

### Task 6 — Scoring Engine

Compute final score using weighted model:
- Deterministic assertions: 40%
- Requirement evaluation: 40%
- AI reasoning: 20%

Status mapping:
- `≥ 0.80` → `passed`
- `0.60–0.79` → `degraded`
- `< 0.60` → `failed`
- Technical error → `error` (overrides score)

Store full evaluation in `generated_tests.evaluation_details`.

---

## Phase 3: Replace Heuristics (Task 7)

### Task 7 — Replace `evaluateTestResult` in `run-tests-batch`

Replace the current `evaluateTestResult()` keyword-matching function in `supabase/functions/run-tests-batch/index.ts` with a call to the new `evaluate-test` edge function.

Flow change in poll finalization (line ~763):
```
// OLD: const evaluation = evaluateTestResult(resultSummary, expectedResult);
// NEW: call evaluate-test function with evidence bundle + expected_result
```

Also update `deployment/backend/src/routes/run-tests-batch.ts` with equivalent logic.

Update `generated_tests` to store `evaluation_details`, `confidence_score`, `final_score`.

---

## Phase 4: Import & UI (Tasks 8-9)

### Task 8 — Import Quality Gate & Normalization

Add validation to Azure DevOps import in `TestGenerator.tsx`:

**Hard reject:** no steps, empty action, missing title.
**Warning:** missing expected result, excessive step length.

Tag imported tests with `import_status`: `imported_ready`, `imported_needs_review`, `imported_rejected`.

Normalize imported test cases: combine step actions into structured prompts, reconstruct `expected_result` from step expected values.

### Task 9 — UI: Structured Evaluation Display

Update test detail modal in `TestsDashboard.tsx` to display:
- Confidence score (progress bar)
- Final score with color coding
- Requirements checklist (✔/✗ per requirement with reasoning)
- Evaluation breakdown (deterministic vs AI scores)

Replace current `result_reasoning` text display with a rich component showing the structured `evaluation_details`.

Add `degraded` status badge (yellow/amber) alongside existing passed/failed/error.

---

## Files Modified

| File | Changes |
|---|---|
| `supabase/functions/evaluate-test/index.ts` | **NEW** — requirement extraction, deterministic validation, AI evaluation, scoring |
| `supabase/functions/run-tests-batch/index.ts` | Replace `evaluateTestResult()` with call to evaluate-test |
| `deployment/backend/src/routes/run-tests-batch.ts` | Same replacement for deployment backend |
| `src/pages/dashboard/TestsDashboard.tsx` | Structured evaluation display, degraded badge, confidence score |
| `src/pages/dashboard/TestGenerator.tsx` | Import quality gate validation |
| `src/components/StructuredResult.tsx` | Optional: support rendering evaluation_details JSON |
| DB migration | Add `evaluation_details`, `confidence_score`, `final_score` to `generated_tests` |
| `supabase/config.toml` | Register evaluate-test function |

## Implementation Order

Tasks 1-3 first (foundation), then 4-6 (engine), then 7 (integration), then 8-9 (import & UI). Each phase is independently testable.

