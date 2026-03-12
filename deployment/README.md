# Legito Agent - Azure Deployment Package

## Obsah balíčku

```
deployment/
├── frontend/              # Frontend konfigurace
│   ├── Dockerfile         # Docker build pro nginx
│   ├── nginx.conf         # Nginx konfigurace pro SPA
│   ├── MIGRATION-GUIDE.md # Průvodce nahrazením souborů
│   └── .env.example       # Vzorové proměnné
│
├── backend/               # Node.js Express API
│   ├── src/
│   │   ├── index.ts       # Entry point
│   │   ├── db.ts          # PostgreSQL connection pool
│   │   ├── middleware/    # Auth (Azure AD JWT) + CORS
│   │   ├── routes/        # 6 API endpointů + 12 CRUD routerů
│   │   └── utils/         # Azure OpenAI helper
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── .env.example
│
├── database/
│   ├── init.sql           # Konsolidovaný SQL (13 tabulek, triggery)
│   └── seed.sql           # Vzorová data
│
├── infra/
│   └── azure-pipelines.yml # CI/CD pipeline
│
├── docs/
│   ├── MIGRATION.md       # Krok za krokem návod
│   ├── ARCHITECTURE.md    # Diagram a popis komponent
│   ├── ENV-VARIABLES.md   # Seznam všech proměnných
│   └── CHECKLIST.md       # Migrační checklist s ověřeními
│
└── README.md              # Tento soubor
```

## Quick Start

1. **Databáze:** Spusťte `database/init.sql` na PostgreSQL 15+ serveru
2. **Backend:** `cd backend && npm install && npm run dev`
3. **Frontend:** Zkopírujte současný `src/` + `public/` do `frontend/`, upravte API volání
4. **Deploy:** Použijte `infra/azure-pipelines.yml` v Azure DevOps

## API Endpointy

### Funkční endpointy (6)

| Route | Popis |
|---|---|
| `/api/browser-use` | Proxy k Browser-Use Cloud API |
| `/api/generate-tests` | AI generování testů |
| `/api/fetch-documentation` | Stahování a parsování dokumentace |
| `/api/run-tests-batch` | Batch spouštění testů |
| `/api/structure-training` | AI strukturování tréninku |
| `/api/evaluate-test` | Evidence-based evaluace testů (scoring, requirements) |

### CRUD endpointy (12)

`/api/profiles`, `/api/projects`, `/api/project-credentials`, `/api/test-suites`, `/api/tasks`, `/api/generated-tests`, `/api/test-cases`, `/api/test-batch-runs`, `/api/documentation-verifications`, `/api/verification-steps`, `/api/operation-templates`, `/api/operation-trainings`

## Evidence-Based QA Engine

Verze 2.0 obsahuje vícevrstvý evaluační systém, který nahrazuje heuristické hledání klíčových slov:

1. **Extrakce požadavků** — AI parsuje `expected_result` na strukturované požadavky (`url_match`, `text_presence`, `no_errors`, `element_exists`, `custom`)
2. **Evidence Bundle** — výsledky testů ukládají strukturovaná fakta (finální URL, DOM text, screenshoty, konzolové chyby)
3. **Deterministická validace** — kódová verifikace URL shody, přítomnosti textu, absence chyb
4. **AI Reasoning** — Gemini / GPT vyhodnocuje požadavky, které nelze ověřit deterministicky
5. **Scoring** — vážený model (40 % deterministické + 40 % požadavky + 20 % AI) → `final_score` a `confidence_score`

Výsledný stav: `passed` (≥0.80) | `degraded` (0.60–0.79) | `failed` (<0.60) | `error`

## Klíčové rozdíly oproti Lovable verzi

| Komponenta | Lovable | Azure |
|---|---|---|
| Auth | Supabase Auth | Azure AD (Entra ID) + MSAL |
| DB klient | @supabase/supabase-js | node-postgres (pg) |
| AI | Lovable AI Gateway | Azure OpenAI |
| Functions | Deno Edge Functions (6) | Express.js routes (6) |
| RLS | PostgreSQL RLS policies | Aplikační middleware |
| Evaluace | Keyword matching | Evidence-Based QA Engine |

## Dokumentace

- **[CHECKLIST.md](docs/CHECKLIST.md)** — Kompletní migrační checklist s ověřeními
- **[MIGRATION.md](docs/MIGRATION.md)** — Kompletní návod pro DevOps tým
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Architektura a datové toky
- **[ENV-VARIABLES.md](docs/ENV-VARIABLES.md)** — Všechny proměnné prostředí

## Požadavky

- Node.js 22 LTS
- PostgreSQL 15+
- Azure subscription (App Service, PostgreSQL Flexible Server, Azure OpenAI, Entra ID)
- Browser-Use Cloud API klíč
