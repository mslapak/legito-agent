

# Deployment balíček pro Azure DevOps

## Přehled

Vytvoříme kompletní deployment balíček, který bude obsahovat vše potřebné pro nasazení aplikace do Azure prostředí. Balíček bude organizovaný jako monorepo s jasnou strukturou pro Azure DevOps CI/CD pipeline.

## Struktura balíčku

```text
legito-agent-azure/
├── frontend/                    # React aplikace (současný src/)
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   ├── Dockerfile
│   └── .env.example
│
├── backend/                     # Node.js Express API (nahrazuje Edge Functions)
│   ├── src/
│   │   ├── index.ts             # Express server entry point
│   │   ├── middleware/
│   │   │   ├── auth.ts          # JWT/Azure AD validace
│   │   │   └── cors.ts
│   │   ├── routes/
│   │   │   ├── browser-use.ts
│   │   │   ├── generate-tests.ts
│   │   │   ├── fetch-documentation.ts
│   │   │   ├── run-tests-batch.ts
│   │   │   └── structure-training.ts
│   │   └── db.ts                # PostgreSQL connection pool (pg)
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── .env.example
│
├── database/
│   ├── init.sql                 # Konsolidovaný SQL (22 migrací → 1 soubor)
│   └── seed.sql                 # Vzorová data (volitelné)
│
├── infra/                       # Infrastructure as Code
│   ├── azure-pipelines.yml      # Azure DevOps CI/CD pipeline
│   └── bicep/                   # Azure Bicep šablony (volitelné)
│       ├── main.bicep
│       └── parameters.json
│
├── docs/
│   ├── MIGRATION.md             # Návod krok za krokem
│   ├── ARCHITECTURE.md          # Diagram architektury
│   └── ENV-VARIABLES.md         # Seznam všech proměnných
│
└── README.md                    # Quick start guide
```

## Co se vytvoří

### 1. Frontend úpravy
- Soubor `.env.example` s proměnnými pro Azure (`VITE_API_URL`, `VITE_AUTH_CLIENT_ID`)
- Nový `src/integrations/api/client.ts` — nahradí Supabase klient za fetch volání na Express backend
- Nový `src/hooks/useAuth.tsx` — nahradí Supabase Auth za MSAL (Azure AD / Entra ID)
- `Dockerfile` pro build a servírování přes nginx

### 2. Backend (Node.js Express)
Konverze všech 5 edge functions z Deno do Node.js:

| Edge Function | Express Route | Popis |
|---|---|---|
| `browser-use` | `POST /api/browser-use` | Proxy k Browser-Use Cloud API |
| `generate-tests` | `POST /api/generate-tests` | AI generování testů (Azure OpenAI) |
| `fetch-documentation` | `POST /api/fetch-documentation` | Stahování dokumentace |
| `run-tests-batch` | `POST /api/run-tests-batch` | Batch spouštění testů |
| `structure-training` | `POST /api/structure-training` | Strukturování tréninku |

Klíčové změny:
- `Deno.env.get()` → `process.env`
- Supabase klient → `pg` (node-postgres) connection pool
- `serve()` → Express router
- Auth: JWT validace Azure AD tokenů přes `jwks-rsa`

### 3. Databáze
- Konsolidace 22 migračních souborů do jednoho `init.sql`
- Odstranění `auth.users` závislostí → vlastní `public.users` tabulka
- Odstranění RLS policies (autorizace na aplikační úrovni)
- Zachování všech triggerů a indexů

### 4. Azure DevOps Pipeline (`azure-pipelines.yml`)
```text
trigger: main branch
stages:
  1. Build Frontend  → npm build → artifact
  2. Build Backend   → npm build → artifact  
  3. Deploy DB       → run init.sql (first time only)
  4. Deploy Backend  → Azure App Service
  5. Deploy Frontend → Azure App Service (static)
```

### 5. Dokumentace
- `MIGRATION.md` — krok za krokem návod pro DevOps tým
- `ENV-VARIABLES.md` — kompletní seznam proměnných s popisem
- `ARCHITECTURE.md` — diagram a popis komponent

## Technické detaily

### Nahrazení závislostí

| Současné (Lovable) | Azure | 
|---|---|
| Supabase Auth | Azure AD (Entra ID) + MSAL |
| Supabase JS Client | node-postgres (`pg`) |
| Lovable AI Gateway | Azure OpenAI Service |
| Edge Functions (Deno) | Express.js (Node.js 22) |
| Supabase Realtime | Polling / WebSocket (volitelné) |

### Požadované Azure AD App Registration
- Redirect URI: `https://<app-url>/auth`
- API permissions: `User.Read`
- Client ID + Tenant ID do env proměnných

## Výstup

Sada souborů přímo v projektu ve složce `deployment/`, kterou lze zkopírovat do Azure DevOps repozitáře a nasadit podle dokumentace.

