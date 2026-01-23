
# Oprava Edge Function Timeout pro run-tests-batch

## Problém
Edge funkce `run-tests-batch` dostává **504 Gateway Timeout** protože synchronně čeká na dokončení testu (2-4 minuty), což překračuje Supabase limit (~150s).

**Aktuální chybný flow:**
```text
┌─────────────┐       ┌──────────────────┐       ┌─────────────────┐
│   Frontend  │──────>│ run-tests-batch  │──────>│ Browser-Use API │
│             │       │  (čeká 2-4 min)  │<──────│                 │
│  TIMEOUT!   │<──────│                  │       │                 │
└─────────────┘       └──────────────────┘       └─────────────────┘
```

## Řešení - Fire-and-Forget Pattern

**Správný flow:**
```text
┌─────────────┐       ┌──────────────────┐       ┌─────────────────┐
│   Frontend  │──────>│ run-tests-batch  │──────>│ Browser-Use API │
│             │<──────│ (vrátí hned)     │       │    (async)      │
│   OK 200    │       │                  │       │                 │
└─────────────┘       └──────────────────┘       └─────────────────┘
                              │
                              │ (self-invoke async)
                              v
                      ┌──────────────────┐
                      │ processSingleTest│
                      │   (na pozadí)    │
                      └──────────────────┘
```

## Změny

### 1. Upravit `supabase/functions/run-tests-batch/index.ts`

**A) Přidat fire-and-forget helper funkci:**
```typescript
async function fireAndForget(url: string, body: object) {
  // Spustí fetch ale NEČEKÁ na odpověď
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(body),
  }).catch(e => console.error("Fire-and-forget error:", e));
}
```

**B) Změnit hlavní handler - initial call:**

Pro první volání (ne-rekurzivní):
- Nastavit batch status na "running"
- Okamžitě vrátit response `{ success: true, message: "Batch started" }`
- **PŘED vrácením** spustit `fireAndForget` s `currentIndex: 0, isRecursiveCall: true`

```typescript
if (!isRecursiveCall) {
  // ... validace, check aktivních batchů ...
  
  // Start batch
  await supabase.from("test_batch_runs").update({
    status: "running",
    started_at: new Date().toISOString(),
  }).eq("id", batchId);
  
  // Fire-and-forget první test
  fireAndForget(`${SUPABASE_URL}/functions/v1/run-tests-batch`, {
    batchId,
    testIds,
    userId,
    batchDelaySeconds,
    currentIndex: 0,
    isRecursiveCall: true,
  });
  
  // OKAMŽITĚ vrátit response
  return new Response(
    JSON.stringify({ success: true, message: "Batch started", batchId }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

**C) Rekurzivní volání - zpracování testu:**

Pro `isRecursiveCall === true`:
- Zavolat `processSingleTest` (to může trvat dlouho)
- Po dokončení zavolat `scheduleNextTest` pro další test
- Vrátit response

Tento kód už existuje, jen ho ponecháme pro rekurzivní volání.

### 2. Upravit frontend `TestsDashboard.tsx`

V `runSelectedTests` funkci nepotřebujeme čekat na výsledek edge funkce - stačí ověřit že se batch spustil:

```typescript
const response = await supabase.functions.invoke('run-tests-batch', {
  body: { ... },
});

if (response.error) {
  // Handle 409 conflict nebo jiné errory
  throw new Error(response.error.message);
}

// response.data obsahuje { success: true, message: "Batch started" }
// Frontend se pak spoléhá na real-time subscription pro updates
```

## Výhody
- **Žádný timeout** - frontend dostane response do 1-2 sekund
- **Robustnější** - testy běží nezávisle na frontend spojení
- **Škálovatelné** - každý test běží ve vlastní edge function invokaci

## Deployment
Po úpravě je potřeba:
1. Uložit změny v `run-tests-batch/index.ts`
2. Deploy edge function
3. Otestovat nový batch run
