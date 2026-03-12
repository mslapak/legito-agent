# Migrační checklist — Legito Agent → Azure

> Tento checklist slouží jako krok-za-krokem průvodce pro DevOps tým.
> Každý krok obsahuje akci, příkaz/postup a ověření.

---

## Fáze 1: Příprava Azure infrastruktury

### 1.1 Resource Group
- [ ] Vytvořit Resource Group `rg-legito-agent` (region: `westeurope`)
```bash
az group create --name rg-legito-agent --location westeurope
```
**Ověření:** `az group show --name rg-legito-agent` vrací JSON s `provisioningState: Succeeded`

### 1.2 PostgreSQL Flexible Server
- [ ] Vytvořit server (`Standard_B1ms`, PostgreSQL 15+)
- [ ] Vytvořit databázi `legito_agent`
- [ ] Přidat firewall pravidlo pro Azure services (`0.0.0.0`)
```bash
az postgres flexible-server create \
  --resource-group rg-legito-agent \
  --name legito-db \
  --location westeurope \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 15 \
  --admin-user legito_admin \
  --admin-password '<SILNÉ_HESLO>'

az postgres flexible-server db create \
  --resource-group rg-legito-agent \
  --server-name legito-db \
  --database-name legito_agent

az postgres flexible-server firewall-rule create \
  --resource-group rg-legito-agent \
  --name legito-db \
  --rule-name AllowAzure \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```
**Ověření:** Připojení přes `psql` funguje, `\l` zobrazí databázi `legito_agent`

### 1.3 Inicializace databáze
- [ ] Spustit `deployment/database/init.sql`
```bash
psql "host=legito-db.postgres.database.azure.com \
      dbname=legito_agent \
      user=legito_admin \
      password=<HESLO> \
      sslmode=require" \
  -f deployment/database/init.sql
```
**Ověření:** `\dt public.*` zobrazí 13 tabulek:
- `users`, `profiles`, `projects`, `project_credentials`
- `test_suites`, `tasks`, `generated_tests`, `test_cases`
- `test_batch_runs`, `documentation_verifications`, `verification_steps`
- `operation_templates`, `operation_trainings`

### 1.4 Vytvoření prvního uživatele
- [ ] Vložit admin uživatele
```sql
INSERT INTO public.users (email, password_hash, email_confirmed_at, raw_user_meta_data)
VALUES (
  'admin@vase-firma.cz',
  crypt('silne-heslo-123', gen_salt('bf')),
  now(),
  '{"full_name": "Admin User"}'::jsonb
);
```
**Ověření:** `SELECT id, email FROM public.users;` vrací řádek + profil se vytvořil automaticky (trigger)

### 1.5 App Service Plan + App Services
- [ ] Vytvořit App Service Plan (`B1`, Linux)
- [ ] Vytvořit backend App Service (`NODE:22-lts`)
- [ ] Vytvořit frontend App Service (`NODE:22-lts`)
```bash
az appservice plan create \
  --resource-group rg-legito-agent \
  --name asp-legito \
  --sku B1 \
  --is-linux

az webapp create \
  --resource-group rg-legito-agent \
  --plan asp-legito \
  --name legito-backend \
  --runtime "NODE:22-lts"

az webapp create \
  --resource-group rg-legito-agent \
  --plan asp-legito \
  --name legito-frontend \
  --runtime "NODE:22-lts"
```
**Ověření:** Oba `https://legito-backend.azurewebsites.net` a `https://legito-frontend.azurewebsites.net` vrací výchozí Azure stránku

---

## Fáze 2: Entra ID (Azure AD)

### 2.1 App Registration
- [ ] Azure Portal → Entra ID → App registrations → **New registration**
- [ ] Name: `Legito Agent`
- [ ] Supported account types: **Single tenant**
- [ ] Redirect URI: `https://legito-frontend.azurewebsites.net/auth` (typ: **SPA**)
- [ ] Zapsat si **Application (client) ID**
- [ ] Zapsat si **Directory (tenant) ID**

### 2.2 API Permissions
- [ ] API permissions → Add → Microsoft Graph → `User.Read`
- [ ] Grant admin consent

**Ověření:** V App Registration → Overview vidíte Client ID a Tenant ID, v API Permissions je `User.Read` se zeleným ✔

---

## Fáze 3: Azure OpenAI

### 3.1 Resource + Deployment
- [ ] Vytvořit Azure OpenAI resource
- [ ] Deploy model `gpt-4o-mini` (nebo `gpt-4o`)
- [ ] Zapsat si **Endpoint URL** a **API Key**

**Ověření:** V Azure Portal → OpenAI resource → Keys and Endpoint zobrazuje platný klíč a URL

---

## Fáze 4: Environment Variables

### 4.1 Backend App Service
- [ ] Nastavit všechny proměnné:
```bash
az webapp config appsettings set \
  --resource-group rg-legito-agent \
  --name legito-backend \
  --settings \
    DATABASE_URL="postgresql://legito_admin:<HESLO>@legito-db.postgres.database.azure.com:5432/legito_agent?sslmode=require" \
    AZURE_AD_TENANT_ID="<TENANT_ID>" \
    AZURE_AD_CLIENT_ID="<CLIENT_ID>" \
    AZURE_OPENAI_ENDPOINT="https://<resource>.openai.azure.com" \
    AZURE_OPENAI_API_KEY="<API_KEY>" \
    AZURE_OPENAI_DEPLOYMENT="gpt-4o-mini" \
    AZURE_OPENAI_API_VERSION="2024-08-01-preview" \
    BROWSER_USE_API_KEY="<BU_KEY>" \
    CORS_ORIGIN="https://legito-frontend.azurewebsites.net" \
    SELF_URL="https://legito-backend.azurewebsites.net" \
    NODE_ENV="production"
```

### 4.2 Frontend build proměnné
- [ ] Nastavit při buildu (nebo v pipeline):
```
VITE_API_URL=https://legito-backend.azurewebsites.net
VITE_AUTH_CLIENT_ID=<CLIENT_ID>
VITE_AUTH_TENANT_ID=<TENANT_ID>
VITE_AUTH_REDIRECT_URI=https://legito-frontend.azurewebsites.net/auth
```

**Ověření:** `az webapp config appsettings list --name legito-backend --resource-group rg-legito-agent` zobrazuje všechny proměnné

---

## Fáze 5: Backend deployment

### 5.1 Build & Deploy
- [ ] `cd deployment/backend && npm install && npm run build`
- [ ] Deploy na App Service (zip deploy nebo Docker)

**Ověření:**
```bash
curl https://legito-backend.azurewebsites.net/api/health
# → {"status":"ok","timestamp":"..."}
```

### 5.2 Ověření endpointů
- [ ] `/api/health` → 200 OK
- [ ] `/api/browser-use` → 401 (bez tokenu = správné)
- [ ] `/api/generate-tests` → 401
- [ ] `/api/fetch-documentation` → 401
- [ ] `/api/run-tests-batch` → 401
- [ ] `/api/structure-training` → 401
- [ ] `/api/evaluate-test` → 401

**Kompletní seznam API routes (6 funkčních + 12 CRUD):**

| Funkční endpointy | CRUD endpointy |
|---|---|
| `/api/browser-use` | `/api/profiles` |
| `/api/generate-tests` | `/api/projects` |
| `/api/fetch-documentation` | `/api/project-credentials` |
| `/api/run-tests-batch` | `/api/test-suites` |
| `/api/structure-training` | `/api/tasks` |
| `/api/evaluate-test` | `/api/generated-tests` |
| | `/api/test-cases` |
| | `/api/test-batch-runs` |
| | `/api/documentation-verifications` |
| | `/api/verification-steps` |
| | `/api/operation-templates` |
| | `/api/operation-trainings` |

---

## Fáze 6: Frontend deployment

### 6.1 Příprava kódu
- [ ] Zkopírovat `src/` a `public/` z hlavního projektu
- [ ] Nahradit `src/hooks/useAuth.tsx` → `deployment/frontend/src/hooks/useAuth.tsx`
- [ ] Nahradit `src/pages/Auth.tsx` → `deployment/frontend/src/pages/Auth.tsx`
- [ ] Přidat `src/api/client.ts` z `deployment/frontend/src/api/client.ts`
- [ ] Přidat `src/api/auth.ts` z `deployment/frontend/src/api/auth.ts`

### 6.2 Find & Replace v celém `src/`
- [ ] `import { supabase } from '@/integrations/supabase/client'` → `import { api } from '@/api/client'`
- [ ] `supabase.from(` → `api.from(`
- [ ] `supabase.functions.invoke(` → `api.functions.invoke(`
- [ ] `supabase.channel(` → `api.channel(`
- [ ] `supabase.removeChannel(` → `api.removeChannel(`

### 6.3 Závislosti
```bash
npm install @azure/msal-browser @azure/msal-react
npm uninstall @supabase/supabase-js
```

### 6.4 Build & Deploy
- [ ] `npm run build`
- [ ] Deploy `dist/` na App Service (nebo nginx kontejner s `deployment/frontend/nginx.conf`)

**Ověření:** `https://legito-frontend.azurewebsites.net` zobrazuje login stránku

---

## Fáze 7: Firewall pravidla

### 7.1 Outbound (App Service → internet)
- [ ] `api.browser-use.com:443`
- [ ] `live.browser-use.com:443`
- [ ] `cdn.browser-use.com:443`
- [ ] `*.openai.azure.com:443`
- [ ] `r.jina.ai:443`

### 7.2 Inbound
- [ ] Port `443` z interní sítě / VPN

**Ověření:** Z App Service konzole: `curl -s https://api.browser-use.com` vrací odpověď (ne timeout)

---

## Fáze 8: CI/CD (volitelné)

### 8.1 Azure DevOps Pipeline
- [ ] Vytvořit projekt v Azure DevOps
- [ ] Importovat kód
- [ ] Vytvořit Variable Group `legito-agent-vars` s DB credentials
- [ ] Vytvořit Service Connection k Azure subscription
- [ ] Upravit `deployment/infra/azure-pipelines.yml` — doplnit názvy resources
- [ ] Spustit pipeline

**Ověření:** Pipeline proběhne zeleně, oba App Services se aktualizují

---

## Fáze 9: End-to-end ověření

### 9.1 Přihlášení
- [ ] Otevřít `https://legito-frontend.azurewebsites.net`
- [ ] Kliknout "Přihlásit se" → přesměrování na Azure AD
- [ ] Po přihlášení → dashboard se zobrazí

### 9.2 Základní funkce
- [ ] Vytvořit projekt
- [ ] Přidat credentials k projektu
- [ ] Vygenerovat testy (AI generování)
- [ ] Spustit test (browser-use integrace)
- [ ] Ověřit, že test výsledek obsahuje `evaluation_details` a `final_score`

### 9.3 Batch run
- [ ] Vybrat více testů → spustit batch na pozadí
- [ ] Ověřit, že batch progres se aktualizuje (polling)

### 9.4 Verifikace dokumentace
- [ ] Zadat URL dokumentace
- [ ] Spustit verifikaci → kroky se provádějí

---

## Souhrnná tabulka komponent

| # | Komponenta | Soubor/Zdroj | Stav |
|---|---|---|---|
| 1 | Express backend (6 routes) | `deployment/backend/` | ⬜ |
| 2 | CRUD routery (12 tabulek) | `deployment/backend/src/routes/crud/` | ⬜ |
| 3 | Azure AD middleware | `deployment/backend/src/middleware/auth.ts` | ⬜ |
| 4 | Azure OpenAI helper | `deployment/backend/src/utils/ai.ts` | ⬜ |
| 5 | DB init skript (13 tabulek) | `deployment/database/init.sql` | ⬜ |
| 6 | Frontend auth (MSAL) | `deployment/frontend/src/hooks/useAuth.tsx` | ⬜ |
| 7 | API client | `deployment/frontend/src/api/client.ts` | ⬜ |
| 8 | Nginx config | `deployment/frontend/nginx.conf` | ⬜ |
| 9 | CI/CD pipeline | `deployment/infra/azure-pipelines.yml` | ⬜ |
| 10 | Dokumentace | `deployment/docs/` | ⬜ |

---

*Poslední aktualizace: 2026-03-12*
*Verze balíčku: 2.0 (Evidence-Based QA Engine)*
