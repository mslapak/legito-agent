
<context>
U tebe se teď reálně stalo tohle (podle DB + logů):

1) V tabulce `test_batch_runs` je batch `2d678...` pořád `status=running`, `completed_tests=0`, `updated_at` se nezměnil od začátku (13:11:56).
2) V logu `run-tests-batch` vidíme jen opakované “Task … status: started” a žádné “Updating progress” ani “Scheduling next test”.
3) V tabulce `generated_tests` pro test `64078...` je `status=pending` a `task_id=null` – i když task v `tasks` tabulce existuje a doběhl (`f1004add...` je `completed`).

Z toho vychází dvě hlavní příčiny:
- **(A) Frontend sabotuje běh**: `TestsDashboard.tsx` má logiku, která když test má `status=running`, ale `task_id` je null, tak ho “opraví” zpět na `pending`. To je v našem batch režimu špatně, protože `run-tests-batch` dnes nastavuje `generated_tests.task_id` až na konci (po dokončení testu). Tzn. UI ti testy “shazuje” zpět.
- **(B) Edge funkce může být ukončena uprostřed běhu**: i když jsme přidali `waitUntil` pro scheduling dalšího testu, pořád máme dlouhotrvající polling + media fetch uvnitř jedné invokace. Když runtime invokaci zabije uprostřed (limit/instabilita), stane se přesně to, co vidíme: task v `tasks` může být už zapsaný jako completed, ale batch progress + scheduling se nikdy nedokončí.

Cíl: udělat to “strojově stabilní” pro 10+ testů, bez závislosti na jedné dlouhé invokaci a bez UI, které mění stavy.

</context>

<goal>
- Batch spolehlivě jede 1→2→…→10 testů.
- UI “Active background batches” a progress se průběžně aktualizují.
- Žádné resetování `generated_tests` zpět na `pending` během běhu.
- Každá invokace backend funkce je krátká (sekundy), žádné minuty pollingu v jedné invokaci.
</goal>

<root-causes>
1) `src/pages/dashboard/TestsDashboard.tsx`:
   - V “poll running tests” části je blok:
     - když `generated_tests.status === 'running'` a `task_id` chybí → update `generated_tests.status = 'pending'`.
   - V batch režimu ale `task_id` chybí po většinu běhu (protože se nastavuje až po dokončení), takže UI test “srazí”.

2) `supabase/functions/run-tests-batch/index.ts`:
   - Dělá dlouhé čekání: poll každých 5s (až 30 minut) + media retry loop.
   - Pokud runtime invokaci ukončí v nevhodném bodě, batch progress (`test_batch_runs.completed_tests`) se nikdy neupdatuje a další test se nenaplánuje.
   - `test_batch_runs.updated_at` se aktualizuje jen při progress incrementu, takže UI snadno vyhodnotí batch jako “stuck”.

</root-causes>

<solution-approach>
Předěláme batch běh na krátké “state machine” invokace (robustní pattern):

A) “Start/launch phase” (krátká invokace)
- Claim test (status→running)
- Vytvořit Browser-Use session/task + DB `tasks` record (status running)
- **Ihned uložit `generated_tests.task_id = taskRecord.id`** (tím přestaneme narážet na UI reset)
- Nečekat na dokončení provider tasku.
- Naplánovat “poll phase” (self invoke) za X sekund přes `EdgeRuntime.waitUntil`.

B) “Poll phase” (krátká invokace opakovaně)
- Načíst `tasks.status` pro `generated_tests.task_id`
- Pokud `tasks.status` stále running:
  - (volitelně) zavolat backend funkci `browser-use` pro refresh detailů / nebo rovnou provider status, ale vždy rychle
  - update `test_batch_runs.updated_at` jako heartbeat
  - naplánovat další poll za X sekund
  - return
- Pokud `tasks.status` je final (completed/failed/cancelled):
  - provést vyhodnocení výsledku (evaluateTestResult) a doplnit `generated_tests.status/result_summary/...`
  - increment batch progress (`completed_tests/passed_tests/failed_tests`) + update `updated_at`
  - naplánovat další index (další testcase) přes `EdgeRuntime.waitUntil` (s batchDelaySeconds)
  - pokud poslední, označit batch jako completed

C) Frontend fix
- Zrušit/změnit pravidlo “když running a bez task_id → pending”.
- V nejhorším to změnit na “když running + bez task_id + last_run_at starší než X minut → pending” (ochrana proti reálným rozbitým stavům), ale ne během normálního běhu.

D) Heartbeat
- Během poll fáze vždy update `test_batch_runs.updated_at` (i když completed_tests se nezměnilo), aby UI vidělo život a necancelovalo to jako stale.
</solution-approach>

<implementation-steps>
1) Backend: `supabase/functions/run-tests-batch/index.ts`
   - Přidat “fáze” do request body (např. `phase: 'start' | 'poll'` nebo `mode`).
   - U prvního spuštění testu:
     - po vytvoření `tasks` záznamu okamžitě update `generated_tests.task_id = taskRecord.id` (nečekat na konec).
     - místo dlouhého poll loopu rovnou naplánovat `phase='poll'` (EdgeRuntime.waitUntil + delay).
   - V `phase='poll'`:
     - načíst DB task status pro `task_id`
     - pokud není hotovo → heartbeat update batch run + reschedule poll
     - pokud hotovo → finalize generated_tests + progress update + schedule next index
   - Ujistit se, že scheduling logy jsou jednoznačné (aby šlo debuggovat).

2) Frontend: `src/pages/dashboard/TestsDashboard.tsx`
   - Upravit logiku v “Poll running tests”:
     - odstranit automatické přepnutí na pending jen kvůli `task_id=null`.
     - případně nahradit ochranným pravidlem založeným na čase (`last_run_at`), ne na `task_id`.

3) Stabilita UI “Active background batches”
   - Ověřit, že se `fetchActiveBatches()` trefuje na správné řádky:
     - (doporučení) filtrovat `test_batch_runs` podle `user_id = user.id`, aby se netahaly cizí batche a UI nebylo matoucí.
   - Díky heartbeatům bude progress panel “živý”.

4) Test plán
   - Spustit batch se 2 testy:
     - ověřit, že `completed_tests` jde 0→1→2 a `updated_at` se mění i během čekání.
   - Spustit batch s 10 testy:
     - ověřit, že se nezasekne na 0/10, a že po každém testu dojde k naplánování dalšího.
   - Pokud cokoliv spadne, logy budou ukazovat, jestli jsme ve “start” nebo “poll” fázi a proč se reschedulovalo.

</implementation-steps>

<why-this-will-be-stable>
- Odstraníme “minutové invokace” (největší zdroj zabíjení runtimem).
- Každý krok je idempotentní a krátký → když se jedna invokace přeruší, další poll/rekurze to dožene.
- UI už nebude přepisovat běžící testy zpět na pending.
- Batch bude mít heartbeat → už žádné “stuck” active batches bez update.
</why-this-will-be-stable>

<files-to-change>
- `supabase/functions/run-tests-batch/index.ts`
- `src/pages/dashboard/TestsDashboard.tsx`
</files-to-change>
