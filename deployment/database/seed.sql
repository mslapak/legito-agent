-- ============================================================
-- Legito Agent - Seed Data (vzorová data pro testování)
-- ============================================================
-- Spusťte po init.sql:
--   psql $DATABASE_URL -f seed.sql
-- ============================================================

-- 1. Vzorový uživatel (heslo: Test1234!)
INSERT INTO public.users (id, email, password_hash, email_confirmed_at, raw_user_meta_data)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'testuser@example.com',
  crypt('Test1234!', gen_salt('bf')),
  now(),
  '{"full_name": "Test User"}'::jsonb
)
ON CONFLICT (email) DO NOTHING;

-- Profil se vytvoří automaticky triggerem handle_new_user

-- 2. Vzorový projekt
INSERT INTO public.projects (id, user_id, name, description, base_url, max_steps, record_video, batch_delay_seconds)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Legito Demo',
  'Vzorový projekt pro testování platformy Legito',
  'https://app.legito.com',
  15,
  true,
  10
)
ON CONFLICT (id) DO NOTHING;

-- 3. Přihlašovací údaje k projektu
INSERT INTO public.project_credentials (id, user_id, project_id, name, username, password, description)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'Testovací účet',
  'demo@legito.com',
  'demo-password-123',
  'Testovací přihlašovací údaje'
)
ON CONFLICT (id) DO NOTHING;

-- 4. Test suite
INSERT INTO public.test_suites (id, user_id, project_id, name, description)
VALUES (
  'd0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'Smoke testy',
  'Základní ověření funkcionality aplikace'
)
ON CONFLICT (id) DO NOTHING;

-- 5. Vzorové test cases
INSERT INTO public.test_cases (id, user_id, test_suite_id, title, prompt, expected_result, priority)
VALUES
  (
    'e0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    'Přihlášení do aplikace',
    'Přejdi na přihlašovací stránku, zadej email a heslo, klikni na Přihlásit se a ověř, že se zobrazí dashboard.',
    'Uživatel je přihlášen a vidí hlavní dashboard.',
    'high'
  ),
  (
    'e0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    'Vytvoření nové šablony',
    'Po přihlášení přejdi do sekce Šablony, klikni na Vytvořit novou šablonu, zadej název "Testovací šablona" a ulož ji.',
    'Šablona "Testovací šablona" je vytvořena a zobrazena v seznamu.',
    'medium'
  ),
  (
    'e0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    'Export dokumentu do PDF',
    'Otevři existující dokument, klikni na tlačítko Export a vyber formát PDF. Ověř, že se stáhne soubor.',
    'PDF soubor je úspěšně stažen.',
    'low'
  )
ON CONFLICT (id) DO NOTHING;

-- 6. Vzorové generated_tests (propojené s test suite)
INSERT INTO public.generated_tests (id, user_id, project_id, test_suite_id, title, prompt, expected_result, priority, status, source_type)
VALUES
  (
    'f0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    'Ověření přihlášení',
    'Přejdi na stránku přihlášení, zadej platné přihlašovací údaje a ověř přesměrování na dashboard.',
    'Dashboard se zobrazí po přihlášení.',
    'high',
    'pending',
    'description'
  ),
  (
    'f0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    'Neplatné přihlášení',
    'Přejdi na stránku přihlášení, zadej neplatné heslo a ověř, že se zobrazí chybová zpráva.',
    'Zobrazí se chybová zpráva o neplatných údajích.',
    'medium',
    'pending',
    'description'
  )
ON CONFLICT (id) DO NOTHING;

-- 7. Vzorová operation template
INSERT INTO public.operation_templates (id, user_id, name, description, prompt, steps)
VALUES (
  'g0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Vytvoření dokumentu z šablony',
  'Automatizace vytvoření nového dokumentu pomocí existující šablony v Legitu.',
  'Přejdi do sekce Šablony, vyber šablonu, klikni na "Vytvořit dokument", vyplň požadovaná pole a ulož dokument.',
  '[{"step_number": 1, "next_goal": "Přejít do sekce Šablony"}, {"step_number": 2, "next_goal": "Vybrat šablonu"}, {"step_number": 3, "next_goal": "Kliknout na Vytvořit dokument"}, {"step_number": 4, "next_goal": "Vyplnit formulář"}, {"step_number": 5, "next_goal": "Uložit dokument"}]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Hotovo! Přihlašovací údaje:
--   Email: testuser@example.com
--   Heslo: Test1234!
-- ============================================================
