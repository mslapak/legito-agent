
<context>
U tebe se znovu rozjela situace, kdy se v jedné batchi spustí víc testů najednou. Z aktuálního kódu `run-tests-batch` je vidět, že další invokace se plánuje „fire-and-forget“ a zároveň uvnitř `scheduleNextTest` je delay. Pokud se omylem spustí více invokací pro stejný `currentIndex` (např. duplicita self-invoke, retry, nebo opakované naplánování), všechny ty duplicity po svém delay doběhnou a spustí další index → výsledkem je více paralelních browser sessionů.

Nejbezpečnější fix je udělat celý batch runner idempotentní: pro každý `testId` dovolíme “claim” pouze jedné invokaci. Všechny ostatní invokace pro stejný test se okamžitě ukončí a nic nespustí. To zabrání paralelnímu startu i kdyby se scheduling rozbil.
</context>

<goals>
1) Garantovat “one-by-one” i při duplicitních invokacích (hard server-side guard).
2) Nezvyšovat počet paralelních browser sessionů ani omylem.
3) Nezkreslovat batch progress (completed/passed/failed) kvůli duplicitám.
</goals>

<root-cause-analysis>
Aktuálně není žádný atomický “lock/claim” mechanismus, který by řekl: “Tento test teď zpracovává konkrétní invokace.”  
Proto když dojde k duplicitní invokaci pro stejný index/test (a to se v praxi občas stává), obě invokace vytvoří session + task a jede to paralelně.

Klíčový problém: kontrola “už běží?” je jen na úrovni batch runu (jeden batch na usera), ale chybí ochrana “jeden test z batch runu může běžet jen jednou”.
</root-cause-analysis>

<implementation-steps>
<step id="1" title="Přidat server-side claim na úrovni generated_tests před vytvořením session/task">
V `supabase/functions/run-tests-batch/index.ts` upravíme `processSingleTest()` tak, aby ještě před voláním Browser-Use API provedla atomický claim:

- Vygeneruje se `claimedTaskId = crypto.randomUUID()` (Deno runtime).
- Provede se UPDATE na `generated_tests`, který uspěje pouze pokud test není už rozběhnutý:
  - podmínka typicky: `id = testId AND status != 'running' AND task_id IS NULL`  
  - update nastaví: `status='running'`, `task_id=claimedTaskId`, `last_run_at=now()`
- Pokud update neovlivní žádný řádek (0 rows), znamená to, že test už někdo jiný claimnul → tato invokace se hned ukončí bez vytvoření session/task.

Tímhle zajistíme, že session/task se vytvoří jen jednou, i kdyby se runner spustil duplicitně.
</step>

<step id="2" title="Zajistit korektní progress – duplicity nesmí zvyšovat completed_tests">
Upravíme návratový typ `processSingleTest()` tak, aby vracel např.:
- `didRun: boolean` (true jen když claim proběhl a test se opravdu spustil)
- `passed/failed` jako dnes

V hlavním handleru (část kolem řádků ~910+) uděláme:
- pokud `didRun === false`:
  - neinkrementovat `completed_tests/passed_tests/failed_tests`
  - pouze vrátit odpověď typu “Skipped duplicate invocation”
  - a hlavně nic dalšího neschedulovat (protože schedulování udělá ta invokace, která test skutečně běží)

To zabrání tomu, aby duplicity “dokončovaly” batch a rozházely statistiky.
</step>

<step id="3" title="Když claim uspěje, vytvořit tasks záznam s předem vygenerovaným id">
Protože claim nastaví `generated_tests.task_id = claimedTaskId` ještě před vložením do `tasks`, upravíme insert do `tasks` tak, aby používal stejné ID:

- Insert do `tasks` bude obsahovat `id: claimedTaskId`
- Pokud insert selže, v catch bloku provedeme rollback na `generated_tests`:
  - `status='error'` nebo zpět `pending`
  - `task_id = null`
  - `result_summary = ...`

Tím nedovolíme, aby zůstal “viset” `task_id` bez odpovídajícího `tasks` záznamu.
</step>

<step id="4" title="Dodat logy, abychom příště přesně viděli, jestli šlo o duplicitu">
Doplníme logy:
- `[Batch X] Claim attempt testId=... index=...`
- `[Batch X] Claim success taskId=...`
- `[Batch X] Claim SKIPPED (already running)`

Tohle umožní rychle v logách potvrdit, že problém byl duplicita invokace a že se už bezpečně ignoruje.
</step>

<step id="5" title="Ověření fixu">
Po úpravě:
- spustit batch s více testy
- v logách ověřit, že pro jeden `testId` je jen jeden “Claim success”
- ověřit, že se nevytváří více paralelních sessions (zmizí “Too many concurrent active sessions” během batch runu)
</step>
</implementation-steps>

<files-to-change>
1) `supabase/functions/run-tests-batch/index.ts`
   - `processSingleTest()` přidat claim na `generated_tests` ještě před session/task creation
   - upravit insert do `tasks` aby používal předem vygenerované `id`
   - vracet `didRun` a podle toho řídit inkrement progressu v handleru
2) `src/pages/dashboard/TestsDashboard.tsx`
   - pravděpodobně bez změn (frontend už batch spouští jen jednou), maximálně jen drobné UX hlášky “batch started”
</files-to-change>

<risk-notes>
- Claim podmínka musí být dostatečně přísná, aby blokovala duplicity, ale zároveň umožnila re-run testu (tzn. při novém spuštění musí být `task_id` předem null nebo test resetnutý). Pokud teď aplikace testy nerezetuje `task_id`, doplníme i safe reset (typicky se to už dělá přes “Reset test status”).
- Pokud existuje stav, kdy `status='running'` zůstane viset (např. crash), je možné doplnit “stale lock” logiku později (např. pokud `last_run_at` je starší než X minut, dovolíme re-claim). To ale nechci teď otevírat bez potvrzení, aby se nezavedla další nejistota.
</risk-notes>
