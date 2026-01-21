# Browser-Use Test Dashboard - Technická dokumentace

## 📋 Přehled aplikace

**Browser-Use Test Dashboard** je webová aplikace pro automatizované testování webových aplikací pomocí browser automation služby Browser-Use Cloud. Aplikace umožňuje:

- Generování testovacích případů z popisů nebo dokumentace pomocí AI
- Import testů z Azure DevOps (XLSX export)
- Spouštění automatizovaných browser testů
- Sledování výsledků v reálném čase
- Verifikaci dokumentace aplikací
- Export výsledků do Excelu

---

## 🏗️ Architektura

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │   Pages     │ │ Components  │ │   Hooks     │ │    i18n     ││
│  │  (Dashboard)│ │    (UI)     │ │ (useAuth)   │ │  (EN/CS)    ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Supabase Cloud)                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                │
│  │  Database   │ │    Auth     │ │Edge Functions│                │
│  │ (PostgreSQL)│ │  (Supabase) │ │   (Deno)    │                │
│  └─────────────┘ └─────────────┘ └─────────────┘                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                             │
│  ┌─────────────┐ ┌─────────────┐                                 │
│  │Browser-Use  │ │ Lovable AI  │                                 │
│  │  Cloud API  │ │   Gateway   │                                 │
│  └─────────────┘ └─────────────┘                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Technologie

### Frontend
| Technologie | Verze | Účel |
|-------------|-------|------|
| React | 18.3.1 | UI framework |
| Vite | - | Build tool |
| TypeScript | - | Type safety |
| Tailwind CSS | - | Styling |
| shadcn/ui | - | UI komponenty |
| React Router | 6.30.1 | Routing |
| TanStack Query | 5.83.0 | Data fetching & caching |
| i18next | 25.7.4 | Internationalizace (EN/CS) |
| xlsx | 0.18.5 | Excel import/export |
| pdfjs-dist | 3.11.174 | PDF parsing |

### Backend
| Technologie | Účel |
|-------------|------|
| Supabase | Database, Auth, Edge Functions |
| PostgreSQL | Relační databáze |
| Deno | Runtime pro Edge Functions |

### Externí služby
| Služba | Účel |
|--------|------|
| Browser-Use Cloud API | Browser automation |
| Lovable AI Gateway | AI pro generování testů |
| Jina AI Reader | Extrakce obsahu z URL |

---

## 📁 Struktura projektu

```
src/
├── components/           # Znovupoužitelné komponenty
│   ├── ui/              # shadcn/ui komponenty
│   ├── DashboardLayout.tsx
│   ├── DocumentationVerification.tsx
│   ├── ImageGallery.tsx
│   ├── NavLink.tsx
│   ├── ProjectCredentials.tsx
│   ├── ProjectTestHistory.tsx
│   └── StructuredResult.tsx
├── hooks/               # Custom React hooks
│   ├── use-mobile.tsx
│   ├── use-toast.ts
│   └── useAuth.tsx
├── i18n/                # Překlady
│   ├── index.ts
│   └── locales/
│       ├── cs/translation.json
│       └── en/translation.json
├── integrations/
│   └── supabase/
│       ├── client.ts    # Supabase klient
│       └── types.ts     # Auto-generované typy
├── lib/
│   └── utils.ts         # Utility funkce
├── pages/
│   ├── Auth.tsx         # Přihlášení/Registrace
│   ├── Index.tsx        # Landing page
│   ├── NotFound.tsx     # 404 stránka
│   └── dashboard/       # Dashboard stránky
│       ├── DashboardHome.tsx
│       ├── DocumentationVerify.tsx
│       ├── NewOperation.tsx
│       ├── NewTask.tsx
│       ├── OperationDetail.tsx
│       ├── OperationHistory.tsx
│       ├── OperationsDashboard.tsx
│       ├── OperationTemplates.tsx
│       ├── OperationTraining.tsx
│       ├── Projects.tsx
│       ├── TaskDetail.tsx
│       ├── TaskHistory.tsx
│       ├── TestGenerator.tsx
│       └── TestsDashboard.tsx
├── App.tsx              # Hlavní komponenta s routingem
├── App.css
├── index.css            # Globální styly + Tailwind
├── main.tsx             # Entry point
└── vite-env.d.ts

supabase/
├── config.toml          # Konfigurace Supabase
├── migrations/          # Databázové migrace
└── functions/           # Edge Functions (Deno)
    ├── browser-use/     # Browser automation proxy
    ├── fetch-documentation/  # Stahování dokumentace
    ├── generate-tests/  # AI generování testů
    ├── run-tests-batch/ # Batch spouštění testů
    └── structure-training/   # Strukturování tréninku
```

---

## 📄 Stránky (Pages)

### Veřejné stránky

| Stránka | Route | Popis |
|---------|-------|-------|
| Landing | `/` | Úvodní stránka |
| Auth | `/auth` | Přihlášení a registrace |
| NotFound | `*` | 404 stránka |

### Dashboard (chráněné auth)

| Stránka | Route | Popis |
|---------|-------|-------|
| DashboardHome | `/dashboard` | Přehled a statistiky |
| Projects | `/dashboard/projects` | Správa projektů |
| TestGenerator | `/dashboard/test-generator` | Generování testů |
| TestsDashboard | `/dashboard/tests` | Přehled a spouštění testů |
| DocumentationVerify | `/dashboard/doc-verify` | Verifikace dokumentace |
| NewTask | `/dashboard/new-task` | Vytvoření nového tasku |
| TaskHistory | `/dashboard/history` | Historie tasků |
| TaskDetail | `/dashboard/task/:taskId` | Detail tasku |
| OperationsDashboard | `/dashboard/operations` | Operace dashboard |
| NewOperation | `/dashboard/operations/new` | Nová operace |
| OperationHistory | `/dashboard/operations/history` | Historie operací |
| OperationDetail | `/dashboard/operations/:operationId` | Detail operace |
| OperationTemplates | `/dashboard/operations/templates` | Šablony operací |
| OperationTraining | `/dashboard/operations/training` | Tréninky operací |

---

## 🧩 Komponenty

### Layout komponenty

| Komponenta | Soubor | Popis |
|------------|--------|-------|
| DashboardLayout | `DashboardLayout.tsx` | Hlavní layout s navigací a sidebarem |
| NavLink | `NavLink.tsx` | Navigační odkaz v menu |

### Funkční komponenty

| Komponenta | Soubor | Popis |
|------------|--------|-------|
| DocumentationVerification | `DocumentationVerification.tsx` | Verifikace dokumentace projektu |
| ImageGallery | `ImageGallery.tsx` | Galerie screenshotů a nahrávek |
| ProjectCredentials | `ProjectCredentials.tsx` | Správa přihlašovacích údajů projektu |
| ProjectTestHistory | `ProjectTestHistory.tsx` | Historie testů projektu |
| StructuredResult | `StructuredResult.tsx` | Zobrazení strukturovaných výsledků |

### UI komponenty (shadcn/ui)

Kompletní sada shadcn/ui komponent v `src/components/ui/`:
- Accordion, Alert, Avatar, Badge, Button, Card, Checkbox
- Dialog, Dropdown, Form, Input, Label, Popover, Progress
- Select, Separator, Sheet, Skeleton, Switch, Table, Tabs
- Textarea, Toast, Toggle, Tooltip, a další...

---

## 🪝 Hooks

| Hook | Soubor | Popis |
|------|--------|-------|
| useAuth | `useAuth.tsx` | Správa autentizace (login, logout, session) |
| useMobile | `use-mobile.tsx` | Detekce mobilního zařízení |
| useToast | `use-toast.ts` | Zobrazování toast notifikací |

---

## 🗄️ Databáze (Supabase PostgreSQL)

### Tabulky

#### `profiles`
Uživatelské profily.
| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | uuid | PK |
| user_id | uuid | FK na auth.users |
| email | text | Email uživatele |
| full_name | text | Celé jméno |
| avatar_url | text | URL avataru |
| created_at | timestamptz | Vytvořeno |
| updated_at | timestamptz | Aktualizováno |

#### `projects`
Testovací projekty.
| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | uuid | PK |
| user_id | uuid | Vlastník projektu |
| name | text | Název projektu |
| description | text | Popis |
| base_url | text | Základní URL aplikace |
| setup_prompt | text | Inicializační prompt (login apod.) |
| browser_profile_id | text | ID Browser-Use profilu |
| max_steps | integer | Max kroků pro test (default 10) |
| record_video | boolean | Nahrávat video (default true) |
| batch_delay_seconds | integer | Prodleva mezi testy v batchi (default 10) |
| created_at | timestamptz | Vytvořeno |
| updated_at | timestamptz | Aktualizováno |

#### `project_credentials`
Přihlašovací údaje pro projekty.
| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | uuid | PK |
| user_id | uuid | Vlastník |
| project_id | uuid | FK na projects |
| name | text | Název účtu |
| username | text | Uživatelské jméno |
| password | text | Heslo |
| description | text | Popis účtu |
| created_at | timestamptz | Vytvořeno |
| updated_at | timestamptz | Aktualizováno |

#### `generated_tests`
Vygenerované/importované testy.
| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | uuid | PK |
| user_id | uuid | Vlastník |
| project_id | uuid | FK na projects |
| test_suite_id | uuid | FK na test_suites |
| task_id | uuid | FK na tasks (poslední běh) |
| azure_devops_id | text | ID z Azure DevOps |
| title | text | Název testu |
| prompt | text | Kroky testu |
| expected_result | text | Očekávaný výsledek |
| priority | text | low/medium/high |
| status | text | pending/running/passed/not_passed/failed |
| source_type | text | description/documentation/azure_devops |
| result_summary | text | Souhrn výsledku |
| result_reasoning | text | AI odůvodnění |
| last_run_at | timestamptz | Poslední spuštění |
| execution_time_ms | integer | Doba běhu v ms |
| step_count | integer | Počet kroků |
| estimated_cost | numeric | Odhadované náklady |
| created_at | timestamptz | Vytvořeno |
| updated_at | timestamptz | Aktualizováno |

#### `test_suites`
Sady testů (pro import z Azure DevOps).
| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | uuid | PK |
| user_id | uuid | Vlastník |
| project_id | uuid | FK na projects |
| name | text | Název sady |
| description | text | Popis |
| created_at | timestamptz | Vytvořeno |
| updated_at | timestamptz | Aktualizováno |

#### `test_batch_runs`
Evidence batch spuštění testů.
| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | uuid | PK |
| user_id | uuid | Vlastník |
| status | text | pending/running/completed/failed/cancelled |
| total_tests | integer | Celkem testů |
| completed_tests | integer | Dokončeno |
| passed_tests | integer | Prošlo |
| failed_tests | integer | Neprošlo |
| test_ids | uuid[] | Seznam ID testů |
| current_test_id | uuid | Aktuálně běžící test |
| batch_size | integer | Velikost batche |
| paused | boolean | Pozastaveno |
| error_message | text | Chybová zpráva |
| started_at | timestamptz | Zahájeno |
| completed_at | timestamptz | Dokončeno |
| created_at | timestamptz | Vytvořeno |
| updated_at | timestamptz | Aktualizováno |

#### `tasks`
Historie jednotlivých browser sessions.
| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | uuid | PK |
| user_id | uuid | Vlastník |
| project_id | uuid | FK na projects |
| browser_use_task_id | text | ID v Browser-Use API |
| title | text | Název tasku |
| prompt | text | Prompt pro browser automation |
| task_type | text | test/scrape/operation |
| status | enum | pending/running/completed/failed |
| priority | enum | low/medium/high |
| result | jsonb | Výsledek z Browser-Use |
| steps | jsonb | Kroky provedené browserem |
| step_count | integer | Počet kroků |
| live_url | text | URL live preview |
| screenshots | text[] | URL screenshotů |
| recordings | text[] | URL nahrávek |
| error_message | text | Chybová zpráva |
| started_at | timestamptz | Zahájeno |
| completed_at | timestamptz | Dokončeno |
| created_at | timestamptz | Vytvořeno |
| updated_at | timestamptz | Aktualizováno |

#### `test_cases`
Manuálně vytvořené test cases.
| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | uuid | PK |
| user_id | uuid | Vlastník |
| test_suite_id | uuid | FK na test_suites |
| title | text | Název |
| prompt | text | Kroky testu |
| expected_result | text | Očekávaný výsledek |
| priority | enum | low/medium/high |
| created_at | timestamptz | Vytvořeno |
| updated_at | timestamptz | Aktualizováno |

#### `documentation_verifications`
Verifikace dokumentace.
| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | uuid | PK |
| user_id | uuid | Vlastník |
| project_id | uuid | FK na projects |
| documentation_source | text | Zdroj dokumentace |
| documentation_url | text | URL dokumentace |
| documentation_preview | text | Náhled obsahu |
| status | text | pending/running/completed/failed |
| total_steps | integer | Celkem kroků |
| passed_steps | integer | Prošlo |
| failed_steps | integer | Neprošlo |
| created_at | timestamptz | Vytvořeno |
| completed_at | timestamptz | Dokončeno |

#### `verification_steps`
Kroky verifikace dokumentace.
| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | uuid | PK |
| verification_id | uuid | FK na documentation_verifications |
| task_id | uuid | FK na tasks |
| step_number | integer | Pořadí kroku |
| step_description | text | Popis kroku |
| status | text | pending/running/passed/failed |
| result | text | Výsledek |
| created_at | timestamptz | Vytvořeno |
| completed_at | timestamptz | Dokončeno |

#### `operation_templates`
Šablony operací.
| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | uuid | PK |
| user_id | uuid | Vlastník |
| name | text | Název |
| description | text | Popis |
| prompt | text | Prompt šablony |
| steps | jsonb | Kroky |
| created_at | timestamptz | Vytvořeno |
| updated_at | timestamptz | Aktualizováno |

#### `operation_trainings`
Tréninky operací.
| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | uuid | PK |
| user_id | uuid | Vlastník |
| name | text | Název |
| description | text | Popis |
| source_type | text | file/url |
| source_content | text | Obsah zdroje |
| structured_instructions | jsonb | Strukturované instrukce |
| created_at | timestamptz | Vytvořeno |
| updated_at | timestamptz | Aktualizováno |

### Enumy

```sql
-- task_priority
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');

-- task_status
CREATE TYPE task_status AS ENUM ('pending', 'running', 'completed', 'failed');
```

### Databázové funkce

```sql
-- Automatické vytvoření profilu při registraci
CREATE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Automatická aktualizace updated_at
CREATE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Row Level Security (RLS)

Všechny tabulky mají zapnuté RLS s politikami:
- Uživatelé mohou číst/vytvářet/upravovat/mazat pouze vlastní záznamy
- Kontrola pomocí `auth.uid() = user_id`

---

## ⚡ Edge Functions (API Endpoints)

### `browser-use`
**Účel:** Proxy pro Browser-Use Cloud API

**Akce:**
| Akce | Metoda | Popis |
|------|--------|-------|
| diagnose | POST | Test připojení k API |
| create_task | POST | Vytvoření browser tasku |
| continue_task | POST | Pokračování v tasku |
| get_task_status | POST | Stav tasku |
| get_task_details | POST | Detail tasku |
| stop_task | POST | Zastavení tasku |
| pause_task | POST | Pozastavení tasku |
| resume_task | POST | Obnovení tasku |
| sync_media | POST | Synchronizace screenshotů/nahrávek |
| probe_live_url | POST | Nalezení live URL |
| create_profile | POST | Vytvoření browser profilu |
| delete_profile | POST | Smazání browser profilu |
| upload_file | POST | Nahrání souboru |

**Požadované secrets:**
- `BROWSER_USE_API_KEY`

---

### `generate-tests`
**Účel:** AI generování testových případů

**Akce:**
| Akce | Popis |
|------|-------|
| (default) | Generování testů z popisu nebo dokumentace |
| parse_tests | Parsování testů z raw textu |

**Vstup:**
```json
{
  "description": "Popis aplikace",
  "documentation": "Text dokumentace",
  "baseUrl": "https://example.com",
  "testType": "functional",
  "projectId": "uuid",
  "action": "parse_tests",
  "rawText": "text k parsování"
}
```

**Výstup:**
```json
{
  "testCases": [
    {
      "title": "Název testu",
      "prompt": "Kroky testu",
      "expectedResult": "Očekávaný výsledek",
      "priority": "medium"
    }
  ]
}
```

**Požadované secrets:**
- `LOVABLE_API_KEY`

---

### `fetch-documentation`
**Účel:** Stahování a extrakce obsahu z URL

**Funkce:**
- Stahování HTML/Markdown obsahu
- Extrakce obrázků
- AI analýza screenshotů (Gemini vision)
- Podpora Jina AI Reader pro lepší extrakci

**Vstup:**
```json
{
  "url": "https://docs.example.com/page",
  "analyzeImages": true
}
```

**Výstup:**
```json
{
  "content": "Extrahovaný text...",
  "imagesAnalyzed": 5,
  "hasImageAnalysis": true
}
```

**Požadované secrets:**
- `LOVABLE_API_KEY`

---

### `run-tests-batch`
**Účel:** Batch spouštění testů na pozadí

**Funkce:**
- Sekvenční spouštění testů
- Podpora pause/resume/cancel
- Automatické vyhodnocení výsledků
- Real-time aktualizace stavu

**Vstup:**
```json
{
  "batchId": "uuid",
  "testIds": ["uuid1", "uuid2"],
  "userId": "uuid",
  "batchDelaySeconds": 10
}
```

**Logika vyhodnocení:**
- Porovnání `result_summary` s `expected_result`
- Hledání klíčových slov úspěchu/neúspěchu
- Automatické přiřazení statusu: `passed`, `not_passed`, `failed`

**Požadované secrets:**
- `BROWSER_USE_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

---

### `structure-training`
**Účel:** AI strukturování tréningových dokumentů

**Vstup:**
```json
{
  "content": "Obsah dokumentu",
  "name": "Název dokumentu"
}
```

**Výstup:**
```json
{
  "instructions": [
    {
      "title": "Krok 1",
      "description": "Detailní popis",
      "expected_outcome": "Očekávaný výsledek"
    }
  ]
}
```

**Požadované secrets:**
- `LOVABLE_API_KEY`

---

## 🔑 Environment Variables & Secrets

### Frontend (.env)
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIs...
VITE_SUPABASE_PROJECT_ID=xxx
```

### Edge Functions (Supabase Secrets)
| Secret | Popis |
|--------|-------|
| BROWSER_USE_API_KEY | API klíč pro Browser-Use Cloud |
| LOVABLE_API_KEY | API klíč pro Lovable AI Gateway |
| SUPABASE_URL | URL Supabase projektu |
| SUPABASE_ANON_KEY | Anonymní klíč |
| SUPABASE_SERVICE_ROLE_KEY | Service role klíč (admin přístup) |
| SUPABASE_DB_URL | Connection string k databázi |

---

## 🔄 Datové toky

### 1. Import testů z Azure DevOps
```
XLSX soubor → parseAzureDevOpsExport() → test_suites + generated_tests → DB
```

### 2. Generování testů z dokumentace
```
URL/PDF → fetch-documentation → AI (Gemini) → generate-tests → generated_tests → DB
```

### 3. Spuštění batch testů
```
UI → test_batch_runs (DB) → run-tests-batch → browser-use → 
→ tasks (DB) + generated_tests (update) → Realtime → UI
```

### 4. Verifikace dokumentace
```
URL/PDF → fetch-documentation → AI → verification_steps → 
→ browser-use → tasks → verification_steps (update) → UI
```

---

## 🔒 Bezpečnost

### Autentizace
- Supabase Auth (email/password)
- JWT tokeny
- Protected routes v React Router

### Autorizace
- Row Level Security na všech tabulkách
- `auth.uid() = user_id` kontrola
- Service role pouze pro Edge Functions

### Doporučení pro on-prem
1. Nahradit Supabase Auth za Azure AD/Entra ID
2. Použít Azure Database for PostgreSQL
3. Migrovat Edge Functions na Node.js + Azure App Service
4. Použít Azure OpenAI místo Lovable AI Gateway

---

## 🚀 Migrace na On-Premises

### Architektura pro Azure

```
┌─────────────────────────────────────────────────────────────────┐
│                    Azure App Service (Frontend)                  │
│                    React/Vite static files                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Azure App Service (Backend)                    │
│                   Node.js 22 LTS + Express                       │
│    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│    │browser-use  │ │generate-tests│ │fetch-docs   │              │
│    └─────────────┘ └─────────────┘ └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Azure Database for PostgreSQL                       │
│              Flexible Server (Burstable B1ms)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                │
│  │Browser-Use  │ │ Azure OpenAI │ │ Azure AD    │                │
│  │  Cloud API  │ │ (GPT-4o-mini)│ │ (Entra ID)  │                │
│  └─────────────┘ └─────────────┘ └─────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

### Kroky migrace

1. **Frontend**
   - `npm run build` → deploy static files na Azure App Service
   - Konfigurovat environment variables

2. **Backend**
   - Konvertovat Edge Functions (Deno) → Node.js Express API
   - Nahradit Supabase klient za přímé PostgreSQL připojení (pg library)
   - Implementovat JWT validaci pro Azure AD tokeny

3. **Databáze**
   - Export schématu ze Supabase
   - Import do Azure PostgreSQL
   - Zachovat RLS policies nebo implementovat na aplikační úrovni

4. **Autentizace**
   - Nahradit Supabase Auth za MSAL (Microsoft Authentication Library)
   - Konfigurovat Azure AD app registration

5. **AI**
   - Nahradit Lovable AI Gateway za Azure OpenAI
   - Použít GPT-4o-mini pro generování testů

---

## 📝 Changelog

| Verze | Datum | Změny |
|-------|-------|-------|
| 1.0 | 2025-01 | Initiální verze dokumentace |

---

## 📞 Kontakt

Pro dotazy ohledně migrace kontaktujte vývojový tým.
