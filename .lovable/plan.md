

# Oprava: Zaseknutý batch se nezobrazuje jako ukončený

## Aktuální stav

| Batch ID | Status | Progress | Vytvořen | Problém |
|----------|--------|----------|----------|---------|
| `2e4b818c-...` | `running` | 0/1 | před ~1 hodinou | Test se nikdy nespustil, batch visí |

Test `aeeb0c3e` má status `pending` a `task_id: null` - edge funkce buď crashla před spuštěním, nebo `fireAndForget` selhal.

## Řešení

### Krok 1: Manuální ukončení zaseknutého batche

Okamžitě označit batch jako `error` s vysvětlující zprávou:

```sql
UPDATE test_batch_runs 
SET status = 'error',
    error_message = 'Batch timed out - no progress detected',
    completed_at = now()
WHERE id = '2e4b818c-c1b4-42cb-8055-ecc611e571aa';
```

### Krok 2: Přidat Stale Batch Detection do UI

Upravit `src/pages/dashboard/TestsDashboard.tsx` tak, aby automaticky detekoval a označil "zaseklé" batche:

**Logika:**
- Pokud batch je `running` déle než **10 minut** bez změny `completed_tests`
- Automaticky ho označit jako `error` v UI a nabídnout tlačítko "Vyčistit"

**Implementace:**

```typescript
// V fetchActiveBatches() nebo jako useEffect
const checkStaleBatches = async () => {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  
  const { data: staleBatches } = await supabase
    .from('test_batch_runs')
    .select('id')
    .eq('status', 'running')
    .lt('updated_at', tenMinutesAgo);
  
  if (staleBatches?.length) {
    // Mark as error
    await supabase
      .from('test_batch_runs')
      .update({ 
        status: 'error', 
        error_message: 'Batch timed out - no progress for 10+ minutes',
        completed_at: new Date().toISOString()
      })
      .in('id', staleBatches.map(b => b.id));
    
    // Refresh UI
    fetchActiveBatches();
  }
};
```

### Krok 3: Přidat `updated_at` trigger na batch progress

Aby stale detection fungovala správně, potřebujeme aktualizovat `updated_at` při každé změně progressu:

```sql
-- Trigger pro automatickou aktualizaci updated_at
CREATE OR REPLACE FUNCTION update_batch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER batch_runs_updated_at
  BEFORE UPDATE ON test_batch_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_batch_updated_at();
```

## Soubory k úpravě

| Soubor | Změna |
|--------|-------|
| Database | (1) UPDATE zaseknutého batche; (2) Přidat trigger pro `updated_at` |
| `src/pages/dashboard/TestsDashboard.tsx` | Přidat stale batch detection (10 min timeout) |

## Výsledek

- UI automaticky vyčistí "zombie" batche které visí déle než 10 minut
- Uživatel uvidí chybovou zprávu místo nekonečného "běží"
- Může okamžitě spustit nový batch

