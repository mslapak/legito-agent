
# Oprava: Batch UI nezobrazuje progress ani název aktuálního testu

## Identifikované problémy

Analýza databáze a kódu odhalila následující root causes:

| Problém | Příčina | Dopad |
|---------|---------|-------|
| Testy se nespouští | Claim podmínka vyžaduje `task_id IS NULL`, ale testy z předchozích běhů mají `task_id` nastaveno | Batch "běží" ale nic nedělá |
| Progress = 0/4 | `completed_tests` se neaktualizuje, protože claim failne | UI ukazuje špatný progres |
| Chybí název testu | `current_test_id` se nenastaví, protože claim failne | Prázdné "Aktuální: ..." |
| Tlačítka `tests.pause` | Překladový klíč se nezobrazuje správně | Chybí lokalizace tlačítek |

## Řešení

### Krok 1: Reset test `task_id` před batch runem

Před spuštěním batch runu resetovat `task_id` na `null` pro všechny vybrané testy. To zajistí, že claim podmínka projde.

**Změna v `supabase/functions/run-tests-batch/index.ts`** - před řádek 130 (před main loop):

```typescript
// Reset task_id for all tests in batch to ensure fresh claim
console.log(`[Batch ${batchId}] Resetting task_id for ${testIds.length} tests before batch start`);

await supabase
  .from("generated_tests")
  .update({ task_id: null })
  .in("id", testIds)
  .neq("status", "running"); // Only reset non-running tests
```

### Krok 2: Upravit claim podmínku - povolit re-run testů

Změnit atomický claim tak, aby umožnil re-run testů které mají `status` != `running`:

**Změna řádků 205-216:**

Před:
```typescript
.neq("status", "running")
.is("task_id", null)
```

Po:
```typescript
.neq("status", "running")
// Removed: .is("task_id", null) - allows re-runs of previously executed tests
```

A přidat podmínku pouze pro aktuálně běžící test:
```typescript
// Check if test is already being processed in THIS batch
const { data: currentlyRunning } = await supabase
  .from("generated_tests")
  .select("status")
  .eq("id", testId)
  .eq("status", "running")
  .single();

if (currentlyRunning) {
  console.log(`[Batch ${batchId}] Test ${testId} already running, skipping`);
  return { didRun: false, passed: false, failed: false, sessionId: null };
}
```

### Krok 3: Ověřit překlady

Zkontrolovat a opravit případné duplicitní JSON objekty v překladových souborech:
- `src/i18n/locales/cs/translation.json`
- `src/i18n/locales/en/translation.json`

Potenciální problém: duplicitní `tests` objekty, kde druhý přepíše první a ztratí klíče `pause`, `resume`, `cancel`.

---

## Technické detaily

### Datový flow po opravě

```text
Batch Start
    │
    ▼
Reset všech test task_id → null
    │
    ▼
fireAndForget(index: 0)
    │
    ▼
processSingleTest() ──► Claim test (status != 'running')
                              │
                              ▼
                        Update current_test_id ← NYNÍ FUNGUJE
                              │
                              ▼
                        Run browser session
                              │
                              ▼
                        Update completed_tests ← NYNÍ FUNGUJE
                              │
                              ▼
                        scheduleNextTest(index + 1)
```

### Soubory k úpravě

| Soubor | Změna |
|--------|-------|
| `supabase/functions/run-tests-batch/index.ts` | (1) Přidat reset `task_id` při startu batch; (2) Upravit claim podmínku |
| `src/i18n/locales/cs/translation.json` | Ověřit/opravit duplicitní `tests` objekt |
| `src/i18n/locales/en/translation.json` | Ověřit/opravit duplicitní `tests` objekt |

---

## Ověření po implementaci

1. Spustit batch s 3+ testy
2. V UI ověřit:
   - Progress se aktualizuje (1/3, 2/3, ...)
   - Název aktuálního testu se zobrazuje
   - Tlačítka "Pozastavit" / "Zrušit" mají správný text
3. V databázi ověřit:
   - `test_batch_runs.completed_tests` se inkrementuje
   - `test_batch_runs.current_test_id` se mění s každým testem
