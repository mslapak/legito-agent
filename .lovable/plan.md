

# Oprava: Falešně negativní vyhodnocení testu

## Identifikovaný problém

Test `Regression Test - Dashboard - Account links - Settings - 02` skončil jako **"Failed"**, přestože výsledek jasně ukazuje **úspěch**:

| Pole | Hodnota |
|------|---------|
| `result_summary` | "The test of DocBot application was **successful**..." |
| `result_reasoning` | "Výsledek obsahuje **kritický indikátor selhání**" |
| `status` | `failed` |

### Příčina

V `result_summary` je věta:
> "The Guided Tour was **not displayed** during this session, so no action was needed"

Logika `evaluateTestResult` v `run-tests-batch/index.ts` obsahuje `criticalFailureIndicators`:

```typescript
const criticalFailureIndicators = [
  'timeout', 'failure', 'was not displayed', 'not displayed', ...
];
```

Fráze **"not displayed"** triggeruje false positive, i když kontextově to znamená pouze "prvek nebyl přítomen, takže jsem ho nemusel zavřít" = **validní úspěch**.

## Řešení

### Vylepšit logiku vyhodnocování

Aktuální logika je příliš naivní - hledá pouhý výskyt slov bez ohledu na kontext.

**Navrhované změny v `supabase/functions/run-tests-batch/index.ts`:**

1. **Přidat prioritu úspěšných indikátorů** - pokud výsledek obsahuje silné úspěšné fráze na začátku, nedělat kritické selhání
2. **Změnit kritické indikátory na specifičtější fráze** - např. `"test failed"`, `"error occurred"`, `"could not complete"`
3. **Vyloučit false positives** - fráze jako "was not displayed during this session" nebo "was not shown (expected)" by neměly být kritické selhání

```typescript
function evaluateTestResult(resultSummary: string, expectedResult: string | null): { status: 'passed' | 'failed', reasoning: string } {
  // ...
  
  const result = resultSummary.toLowerCase().trim();
  
  // STRONG success indicators at the beginning take precedence
  const strongSuccessStarts = [
    'the test of', 'test was successful', 'test completed successfully',
    'all steps completed', 'verification successful'
  ];
  const startsWithStrongSuccess = strongSuccessStarts.some(s => result.startsWith(s) || result.includes('was successful'));
  
  // Critical failures - more specific patterns
  const criticalFailurePatterns = [
    'timeout', 
    'test failed', 
    'could not complete',
    'error occurred',
    'exception thrown',
    'did not complete the task',
    'nebyl dokončen',
    'test selhal'
  ];
  
  // Context-aware exclusion: "not displayed" is OK if followed by context
  const falsePositiveContexts = [
    'was not displayed during this session',
    'was not shown during',
    'not displayed (expected)',
    'not displayed, so no action'
  ];
  
  const hasFalsePositiveContext = falsePositiveContexts.some(ctx => result.includes(ctx));
  
  // Only trigger critical failure if not a false positive context and not strong success
  const hasCriticalFailure = !startsWithStrongSuccess && 
    !hasFalsePositiveContext && 
    criticalFailurePatterns.some(ind => result.includes(ind));
    
  // ... rest of logic
}
```

## Soubory k úpravě

| Soubor | Změna |
|--------|-------|
| `supabase/functions/run-tests-batch/index.ts` | Vylepšit `evaluateTestResult` funkci - přidat kontext-aware vyhodnocování |

## Alternativní přístup

Pokud chceme robustnější řešení, můžeme použít AI model pro vyhodnocení výsledků:

- Použít Lovable AI (např. `gemini-2.5-flash`) pro inteligentní vyhodnocení
- Předat `result_summary` + `expected_result` modelu
- Model vrátí `passed/failed` s reasoning

Toto by eliminovalo všechny edge case s keyword matching, ale přidá latenci a náklady.

## Doporučený postup

1. **Okamžitě**: Implementovat context-aware vyhodnocování (výše)
2. **Volitelně**: Ručně opravit status tohoto konkrétního testu na `passed`

