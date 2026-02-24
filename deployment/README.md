# Legito Agent - Azure Deployment Package

## Obsah balíčku

```
deployment/
├── frontend/              # Frontend konfigurace
│   ├── Dockerfile         # Docker build pro nginx
│   ├── nginx.conf         # Nginx konfigurace pro SPA
│   └── .env.example       # Vzorové proměnné
│
├── backend/               # Node.js Express API
│   ├── src/
│   │   ├── index.ts       # Entry point
│   │   ├── db.ts          # PostgreSQL connection pool
│   │   ├── middleware/    # Auth (Azure AD JWT) + CORS
│   │   ├── routes/        # 5 API endpointů
│   │   └── utils/         # Azure OpenAI helper
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── .env.example
│
├── database/
│   └── init.sql           # Konsolidovaný SQL (13 tabulek, triggery)
│
├── infra/
│   └── azure-pipelines.yml # CI/CD pipeline
│
├── docs/
│   ├── MIGRATION.md       # Krok za krokem návod
│   ├── ARCHITECTURE.md    # Diagram a popis komponent
│   └── ENV-VARIABLES.md   # Seznam všech proměnných
│
└── README.md              # Tento soubor
```

## Quick Start

1. **Databáze:** Spusťte `database/init.sql` na PostgreSQL 15+ serveru
2. **Backend:** `cd backend && npm install && npm run dev`
3. **Frontend:** Zkopírujte současný `src/` + `public/` do `frontend/`, upravte API volání
4. **Deploy:** Použijte `infra/azure-pipelines.yml` v Azure DevOps

## Klíčové rozdíly oproti Lovable verzi

| Komponenta | Lovable | Azure |
|---|---|---|
| Auth | Supabase Auth | Azure AD (Entra ID) + MSAL |
| DB klient | @supabase/supabase-js | node-postgres (pg) |
| AI | Lovable AI Gateway | Azure OpenAI |
| Functions | Deno Edge Functions | Express.js (Node.js 22) |
| RLS | PostgreSQL RLS policies | Aplikační middleware |

## Dokumentace

- **[MIGRATION.md](docs/MIGRATION.md)** — Kompletní návod pro DevOps tým
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Architektura a datové toky
- **[ENV-VARIABLES.md](docs/ENV-VARIABLES.md)** — Všechny proměnné prostředí

## Požadavky

- Node.js 22 LTS
- PostgreSQL 15+
- Azure subscription (App Service, PostgreSQL Flexible Server, Azure OpenAI, Entra ID)
- Browser-Use Cloud API klíč
