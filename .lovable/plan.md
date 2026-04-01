

# Změna struktury generovaných test cases z nahrávek

## Současný stav

AI generuje 3-15 test cases z jedné nahrávací session, každý s jedním `prompt` (kroky) a jedním `expectedResult`. Kroky jsou obecné a expected result je souhrnný.

## Požadovaný stav

**1 nahrávka = 1 test case** s detailními kroky, kde:
- Každý krok je konkrétní akce (klikni, otevři, vyplň, počkej...)
- Každý krok má vlastní expected result (co se má stát po provedení)

## Co se změní

### 1. AI prompt a tool schema (edge function `generate-tests-from-recording`)

Změna system promptu a tool schématu:
- Místo pole `testCases` s `prompt` + `expectedResult` bude AI generovat **1 test case** se strukturou:
  - `title` -- název celé session
  - `steps[]` -- pole kroků, každý s `action` (co udělat) a `expected` (co se má stát)
  - `priority`
- Prompt bude AI instruovat: "Vygeneruj JEDEN test case. Každý zaznamenaný krok rozpiš jako konkrétní instrukci (klikni na X, otevři Y, počkej až se zobrazí Z). Ke každému kroku uveď expected result."

Výstupní formát do DB zůstane kompatibilní:
- `prompt` = kroky spojené newliny (číslované: `1. Klikni na...`)
- `expected_result` = expected results spojené newliny (číslované: `1. Zobrazí se...`)
- Počet řádků v prompt == počet řádků v expected_result (mapování 1:1)

### 2. Fallback generátor

Aktualizace `buildFallbackTestCases` -- stejná logika: 1 TC, kroky z recorded_steps, expected z evaluation_previous_goal každého kroku.

### 3. XLSX export (RecordingDetail)

Stávající logika exportu už podporuje 1:1 mapování kroků na expected results (řádek 165-167). Žádná změna potřeba -- formát se automaticky přizpůsobí.

### 4. Deployment backend parity

Aktualizace `deployment/backend/src/routes/generate-tests-from-recording.ts` se stejnými změnami promptu.

## Soubory k úpravě

| Soubor | Změna |
|--------|-------|
| `supabase/functions/generate-tests-from-recording/index.ts` | Nový prompt, schema, fallback |
| `deployment/backend/src/routes/generate-tests-from-recording.ts` | Stejné změny promptu |

## Příklad výstupu

**Prompt (uložený v DB):**
```
1. Otevři stránku https://app.example.com/login
2. Klikni na pole "Email" a zadej testuser@example.com
3. Klikni na pole "Heslo" a zadej heslo123
4. Klikni na tlačítko "Přihlásit se"
5. Počkej až se zobrazí dashboard
```

**Expected result (uložený v DB):**
```
1. Stránka se načte a zobrazí přihlašovací formulář
2. Pole je aktivní a text se zobrazuje
3. Pole je aktivní, text je maskovaný
4. Formulář se odešle, zobrazí se loading
5. Dashboard se zobrazí s uvítací zprávou
```

**XLSX export** -- každý řádek = 1 step s odpovídajícím expected result (stávající logika to již zvládá).

