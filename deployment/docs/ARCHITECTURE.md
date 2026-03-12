# Architektura aplikace

## Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Azure Cloud                              │
│                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────┐ │
│  │   Frontend    │     │   Backend    │     │  PostgreSQL  │ │
│  │  App Service  │────▶│  App Service │────▶│  Flexible    │ │
│  │  (Static)     │     │  (Node.js)   │     │  Server      │ │
│  │               │     │              │     │              │ │
│  │  React/Vite   │     │  Express.js  │     │  13 tabulek  │ │
│  │  Tailwind CSS │     │  6 API routes│     │  2 enumy     │ │
│  └──────┬───────┘     └──────┬───────┘     └──────────────┘ │
│         │                    │                               │
│         │              ┌─────┴─────┐                        │
│         │              │           │                        │
│  ┌──────┴───────┐  ┌──┴────┐  ┌──┴──────────┐             │
│  │  Azure AD    │  │Browser│  │ Azure OpenAI │             │
│  │  (Entra ID)  │  │-Use   │  │ (GPT-4o-mini)│             │
│  │  Auth/SSO    │  │Cloud  │  │              │             │
│  └──────────────┘  │API    │  └──────────────┘             │
│                    └───────┘                                │
└─────────────────────────────────────────────────────────────┘
```

## Komponenty

### Frontend (React)
- **Technologie:** React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui
- **Hosting:** Azure App Service (Static Web App) nebo nginx container
- **Autentizace:** MSAL.js (Azure AD / Entra ID)
- **API komunikace:** Fetch volání na Express backend

### Backend (Node.js Express)
- **Technologie:** Node.js 22 LTS, Express.js, TypeScript
- **Hosting:** Azure App Service (Linux, Node.js runtime)
- **Databáze:** node-postgres (pg) connection pool
- **Auth middleware:** JWT validace Azure AD tokenů přes jwks-rsa

#### API Endpointy

| Route | Metoda | Popis |
|---|---|---|
| `/api/health` | GET | Health check |
| `/api/browser-use` | POST | Proxy k Browser-Use Cloud API |
| `/api/generate-tests` | POST | AI generování testů |
| `/api/fetch-documentation` | POST | Stahování a parsování dokumentace |
| `/api/run-tests-batch` | POST | Batch spouštění testů |
| `/api/structure-training` | POST | AI strukturování tréninku |
| `/api/evaluate-test` | POST | Evidence-based evaluace testů (scoring, requirements) |

### Databáze (PostgreSQL)
- **Hosting:** Azure Database for PostgreSQL Flexible Server
- **Verze:** PostgreSQL 15+
- **Sizing:** Burstable B1ms (do 10 uživatelů)
- **Tabulky:** 13 (users, profiles, projects, tasks, generated_tests, ...)
- **Autorizace:** Na aplikační úrovni (middleware), bez RLS

### Externí služby

| Služba | Účel | Firewall pravidlo |
|---|---|---|
| Browser-Use Cloud | Automatizace prohlížeče | `api.browser-use.com:443` |
| Browser-Use Live | Live preview | `live.browser-use.com:443` |
| Browser-Use CDN | Média (screenshoty, videa) | `cdn.browser-use.com:443` |
| Azure OpenAI | AI generování testů | `*.openai.azure.com:443` |
| Jina AI Reader | Extrakce obsahu z URL | `r.jina.ai:443` |

## Datové toky

### 1. Generování testů
```
Uživatel → Frontend → POST /api/generate-tests → Azure OpenAI → Testy do DB
```

### 2. Spuštění testu
```
Frontend → POST /api/browser-use (create_task) → Browser-Use Cloud
         → Polling statusu → Výsledek do DB → Frontend zobrazí výsledek
```

### 3. Batch run
```
Frontend → POST /api/run-tests-batch → Spustí 1. test
         → Self-invoke (poll) → Kontrola statusu
         → Self-invoke (start) → Spustí další test → ...
```

### 4. Verifikace dokumentace
```
Frontend → POST /api/fetch-documentation → Jina AI Reader + HTML parsing
         → POST /api/generate-tests → Generuje kroky
         → POST /api/browser-use × N → Ověří každý krok
```
