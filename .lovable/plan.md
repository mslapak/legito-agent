
# Oprava: Batch nepokračuje na další test + progress se neaktualizuje

## Zjištěné problémy

### 1. Edge function shutdown přerušuje chain
```text
12:57:50Z - Waiting 10s before scheduling next test...
12:57:53Z - shutdown (po 3 sekundách!)
```
Funkce `scheduleNextTest` čeká 10 sekund UVNITŘ sebe, ale je volaná fire-and-forget. Edge runtime ukončí funkci dříve, než proběhne delay.

### 2. Progress update se nikdy neprovede
Řádky 1033-1048 aktualizují `completed_tests`, ale jsou **ZA** návratem z `processSingleTest`. Protože edge funkce dostane shutdown, tento kód se nikdy nespustí.

### 3. Duplicitní scheduleNextTest
Funkce je volaná DVAkrát:
- Řádek 579 (fire-and-forget v `processSingleTest`)
- Řádek 1056 (await v `serve`)

Logika na řádku 579 je problematická - čeká uvnitř fire-and-forget, což edge runtime nemůže garantovat.

## Řešení

### Změna architektury: EdgeRuntime.waitUntil

Místo fire-and-forget použijeme `EdgeRuntime.waitUntil()`, které garantuje, že Deno počká na dokončení async operace před shutdownem.

### Krok 1: Přesunout progress update PŘED scheduleNextTest

Aktuálně:
```text
processSingleTest() → vrátí → progress update → scheduleNextTest
                                                ↑
                                            shutdown zde!
```

Nová logika:
```text
processSingleTest() → progress update → vrátí → scheduleNextTest (waitUntil)
```

### Krok 2: Odstranit duplicitní scheduleNextTest z processSingleTest

Řádky 575-582 v `processSingleTest` se musí odstranit - scheduling bude pouze v hlavní `serve` funkci.

### Krok 3: Použít EdgeRuntime.waitUntil pro scheduling

```typescript
// V serve funkci, po progress update:
if (hasMoreTests) {
  const schedulePromise = scheduleNextTest(batchId, testIds, index, userId, batchDelaySeconds);
  // @ts-ignore - EdgeRuntime je dostupný v Deno edge functions
  EdgeRuntime.waitUntil(schedulePromise);
}

// Vrátit response IHNED - waitUntil zajistí dokončení
return new Response(...);
```

### Krok 4: Zjednodušit scheduleNextTest

Odstranit interní delay z `scheduleNextTest` - delay bude PŘED voláním v hlavní funkci:

```typescript
// V serve funkci:
if (hasMoreTests) {
  const minDelay = Math.max(batchDelaySeconds || 10, 5) * 1000;
  
  const schedulePromise = (async () => {
    await delay(minDelay);
    await scheduleNextTest(batchId, testIds, index, userId);
  })();
  
  EdgeRuntime.waitUntil(schedulePromise);
}
```

## Soubory k úpravě

| Soubor | Změna |
|--------|-------|
| `supabase/functions/run-tests-batch/index.ts` | (1) Odstranit scheduleNextTest z processSingleTest (řádky 575-582); (2) Přidat EdgeRuntime.waitUntil v serve funkci; (3) Zjednodušit scheduleNextTest funkci |

## Očekávaný výsledek

```text
Test 1 finished
→ Progress update: 1/2
→ Response vrácena klientovi
→ EdgeRuntime.waitUntil: čeká 10s, pak volá další test
→ Test 2 started
→ Progress update: 2/2
→ Batch completed
```

UI bude správně ukazovat progress díky Realtime subscription na `test_batch_runs` tabulku (trigger `batch_runs_updated_at` zajistí update `updated_at`).
