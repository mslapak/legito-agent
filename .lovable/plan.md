# Evidence-Based QA Engine — Implementation Plan

## Status: ✅ IMPLEMENTED (Phase 1-4)

All 9 tasks completed. The system is now live.

## What was built

### Edge Function: `evaluate-test`
- Requirement extraction via Lovable AI (Gemini 2.5 Flash) with tool calling
- Deterministic validation (url_match, text_presence, no_errors, element_exists)
- AI evaluation for "unknown" requirements
- Weighted scoring engine (40% deterministic, 40% requirements, 20% AI)
- Status mapping: ≥0.80 passed, 0.60-0.79 degraded, <0.60 failed

### Database Changes
- `generated_tests.evaluation_details` (JSONB) — full structured evaluation
- `generated_tests.confidence_score` (numeric) — 0.0-1.0
- `generated_tests.final_score` (numeric) — 0.0-1.0
- New status: `degraded` alongside passed/failed/error

### Updated `run-tests-batch`
- Builds evidence bundles from Browser-Use API output
- Calls `evaluate-test` for evidence-based scoring
- Falls back to legacy heuristic if evaluate-test fails
- Stores evaluation_details, confidence_score, final_score

### Import Quality Gate (TestGenerator)
- Hard reject: missing title, no steps, empty actions
- Warnings: missing expected result, excessive step length
- Quality stats shown in toast after import

### UI: Structured Evaluation Display (TestsDashboard)
- Score & confidence progress bars
- Requirements checklist with ✔/✗ and source (deterministic/AI)
- Score breakdown (deterministic, requirements, AI percentages)
- `degraded` status badge (amber)
- Legacy result_reasoning fallback for old tests
