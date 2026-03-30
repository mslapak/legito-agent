

# Session Recorder — Nahrávání uživatelských akcí a generování test cases

## Co to bude dělat

Uživatel spustí "nahrávací session" v Browser-Use s pozorovacím promptem. Browser-Use otevře live prohlížeč, uživatel v něm provádí akce (klikání, navigace, vyplňování formulářů). Browser-Use zaznamenává kroky (steps). Po ukončení session AI analyzuje zaznamenané kroky a vygeneruje strukturované test cases, které se uloží do `generated_tests` tabulky a lze je exportovat jako XLSX pro Azure DevOps.

## Uživatelský flow

```text
1. Uživatel otevře "Recorder" stránku
2. Vybere projekt, zadá název session
3. Klikne "Start Recording"
   → Browser-Use task se vytvoří s observačním promptem + keepBrowserOpen=true
   → Zobrazí se live iframe
4. Uživatel provádí akce v live prohlížeči
5. Klikne "Stop & Generate Tests"
   → Task se zastaví, stáhnou se kroky (steps) + screenshoty
   → AI (edge function) analyzuje kroky a vygeneruje test cases
6. Zobrazí se seznam vygenerovaných TC s možností editace
7. Uživatel uloží TC do DB a/nebo exportuje XLSX
```

## Technické řešení

### Phase 1: DB + Edge Function

**DB migrace** — nová tabulka `recorded_sessions`:
- `id`, `user_id`, `project_id`, `title`
- `browser_use_task_id`, `task_id` (FK na tasks)
- `recorded_steps` (JSONB — raw kroky z Browser-Use)
- `generated_test_ids` (UUID[] — vygenerované TC)
- `status` (recording / processing / completed / failed)
- `created_at`, `completed_at`

**Edge function `generate-tests-from-recording`**:
- Vstup: `recorded_steps` (JSON z Browser-Use), `project_id`, `base_url`
- AI prompt analyzuje sekvenci kroků (next_goal, url, evaluation_previous_goal)
- Výstup: pole test cases ve formátu `{ title, prompt, expectedResult, priority }`
- Uloží TC do `generated_tests` s `source_type = 'recording'`

### Phase 2: Frontend

**Nová stránka `RecordSession.tsx`** (`/dashboard/recorder`):
- Formulář: název session, výběr projektu, base URL
- Tlačítko "Start Recording" → volá `browser-use` edge function s:
  - `action: 'create_task'`
  - `prompt: 'Observe and record every user action. Do not interact autonomously. Wait for user to perform actions. Log each click, navigation, form input with exact selectors and values.'`
  - `keepBrowserOpen: true`
- Live iframe zobrazí browser
- Tlačítko "Stop & Generate" → zastaví task, stáhne steps, zavolá AI generátor

**Nová stránka `RecordingDetail.tsx`** (`/dashboard/recorder/:id`):
- Zobrazí zaznamenané kroky
- Seznam vygenerovaných TC s editací (title, prompt, expected result)
- Tlačítka: "Uložit do projektu", "Export XLSX"

**XLSX export** — stejný formát jako stávající export v TestsDashboard:
- Sloupce: ID, Title, Step Action, Step Expected Result, Priority

**Navigace** — přidání "Recorder" do sidebar sekce Testing.

### Phase 3: Deployment parity

- Express route `deployment/backend/src/routes/generate-tests-from-recording.ts`
- CRUD router pro `recorded_sessions`
- Update `init.sql` o novou tabulku

## Soubory k vytvoření/úpravě

| Soubor | Změna |
|--------|-------|
| DB migrace | Nová tabulka `recorded_sessions` |
| `supabase/functions/generate-tests-from-recording/index.ts` | Nová edge function |
| `src/pages/dashboard/RecordSession.tsx` | Nová stránka — recorder UI |
| `src/pages/dashboard/RecordingDetail.tsx` | Nová stránka — detail + TC edit |
| `src/App.tsx` | Přidat routes |
| `src/components/DashboardLayout.tsx` | Přidat nav item |
| `src/i18n/locales/en/translation.json` | Překlady |
| `src/i18n/locales/cs/translation.json` | Překlady |
| `deployment/backend/src/routes/generate-tests-from-recording.ts` | Express route |
| `deployment/backend/src/routes/crud/recorded-sessions.ts` | CRUD router |
| `deployment/backend/src/index.ts` | Registrace routes |
| `deployment/database/init.sql` | Nová tabulka |

## Pořadí implementace

1. DB migrace + RLS
2. Edge function pro AI generování TC z kroků
3. RecordSession stránka (start/stop/live view)
4. RecordingDetail stránka (kroky + TC + XLSX export)
5. Navigace + překlady
6. Deployment parity (Express + init.sql)

