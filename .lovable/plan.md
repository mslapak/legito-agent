

# Oprava: Batch nespouští další testy po dokončení prvního

## Problém
Po dokončení testu se batch zastaví, protože chybí volání `scheduleNextTest()` v hlavním handleru. Funkce existuje, ale není nikde volána po úspěšném zpracování testu.

## Analýza kódu

**Aktuální flow (nefunkční):**
```text
Initial Call
    │
    ▼
fireAndForget(currentIndex: 0) ──► processSingleTest(test 0)
                                          │
                                          ▼
                                   Update progress
                                          │
                                          ▼
                                   Return response
                                          │
                                          ▼
                                   KONEC! (chybí scheduleNextTest)
```

**Požadovaný flow:**
```text
Initial Call
    │
    ▼
fireAndForget(currentIndex: 0) ──► processSingleTest(test 0)
                                          │
                                          ▼
                                   Update progress
                                          │
                                          ▼
                                   scheduleNextTest(currentIndex + 1) ◄── TOTO CHYBÍ!
                                          │
                                          ▼
                                   Return response
```

## Řešení

Upravit `supabase/functions/run-tests-batch/index.ts` - přidat volání `scheduleNextTest()` po dokončení testu:

**Změna v řádcích cca 999-1013:**

Před:
```typescript
const hasMoreTests = index + 1 < testIds.length;
if (!hasMoreTests) {
  console.log(`[Batch ${batchId}] All tests completed...`);
  // ... mark batch as completed
}

return new Response(...);
```

Po:
```typescript
const hasMoreTests = index + 1 < testIds.length;
if (hasMoreTests) {
  // NOVÉ: Spustit další test
  console.log(`[Batch ${batchId}] Scheduling next test (index ${index + 1})`);
  await scheduleNextTest(batchId, testIds, index, userId, batchDelaySeconds);
} else {
  console.log(`[Batch ${batchId}] All tests completed...`);
  // ... mark batch as completed
}

return new Response(...);
```

## Technické detaily

- `scheduleNextTest()` již obsahuje delay logiku (čeká `batchDelaySeconds` před voláním)
- `scheduleNextTest()` volá sebe sama přes `fetch()` s `currentIndex + 1`
- Tím se zajistí sekvenční zpracování testů s požadovanou prodlevou

## Soubory k úpravě

| Soubor | Změna |
|--------|-------|
| `supabase/functions/run-tests-batch/index.ts` | Přidat volání `scheduleNextTest()` po úspěšném dokončení testu (před řádek 1014) |

## Ověření

Po úpravě:
1. Spustit batch s více testy
2. V logách ověřit:
   - `[Batch X] Scheduling next test (index 1)`
   - `[Batch X] Waiting Xs before scheduling next test invocation...`
   - `[Batch X] Processing test 2/N: ...`
3. Ověřit že progress v UI se aktualizuje (1/4, 2/4, ...)

