# Návod k migraci na Azure

## Předpoklady

- Azure subscription
- Azure DevOps organizace
- Azure CLI nainstalováno
- Node.js 22 LTS
- PostgreSQL klient (psql)

## Krok 1: Azure Resources

### 1.1 Resource Group
```bash
az group create --name rg-legito-agent --location westeurope
```

### 1.2 PostgreSQL Flexible Server
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

# Firewall pravidlo (Azure services)
az postgres flexible-server firewall-rule create \
  --resource-group rg-legito-agent \
  --name legito-db \
  --rule-name AllowAzure \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

# Vytvořit databázi
az postgres flexible-server db create \
  --resource-group rg-legito-agent \
  --server-name legito-db \
  --database-name legito_agent
```

### 1.3 Inicializace databáze
```bash
psql "host=legito-db.postgres.database.azure.com \
      dbname=legito_agent \
      user=legito_admin \
      password=<HESLO> \
      sslmode=require" \
  -f database/init.sql
```

### 1.4 Vytvoření prvního uživatele
```sql
INSERT INTO public.users (email, password_hash, email_confirmed_at, raw_user_meta_data)
VALUES (
  'admin@vase-firma.cz',
  crypt('silne-heslo-123', gen_salt('bf')),
  now(),
  '{"full_name": "Admin User"}'::jsonb
);
```

### 1.5 App Services
```bash
# App Service Plan
az appservice plan create \
  --resource-group rg-legito-agent \
  --name asp-legito \
  --sku B1 \
  --is-linux

# Backend
az webapp create \
  --resource-group rg-legito-agent \
  --plan asp-legito \
  --name legito-backend \
  --runtime "NODE:22-lts"

# Frontend
az webapp create \
  --resource-group rg-legito-agent \
  --plan asp-legito \
  --name legito-frontend \
  --runtime "NODE:22-lts"
```

## Krok 2: Azure AD (Entra ID)

1. Přejděte do **Azure Portal → Entra ID → App registrations**
2. Klikněte **New registration**
3. Name: `Legito Agent`
4. Supported account types: Single tenant
5. Redirect URI: `https://legito-frontend.azurewebsites.net/auth` (SPA)
6. Zapiště si **Application (client) ID** a **Directory (tenant) ID**
7. API permissions → Add → Microsoft Graph → `User.Read`

## Krok 3: Azure OpenAI

1. Vytvořte Azure OpenAI resource
2. Deploy model `gpt-4o-mini` (nebo `gpt-4o`)
3. Zapište si endpoint a API key

## Krok 4: Environment Variables

### Backend App Service
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
    BROWSER_USE_API_KEY="<BU_KEY>" \
    CORS_ORIGIN="https://legito-frontend.azurewebsites.net" \
    SELF_URL="https://legito-backend.azurewebsites.net" \
    NODE_ENV="production"
```

### Frontend App Service
Nastavte při buildu ve Vite:
```bash
VITE_API_URL=https://legito-backend.azurewebsites.net
VITE_AUTH_CLIENT_ID=<CLIENT_ID>
VITE_AUTH_TENANT_ID=<TENANT_ID>
```

## Krok 5: Azure DevOps Pipeline

1. Vytvořte nový projekt v Azure DevOps
2. Importujte kód z tohoto repozitáře
3. Vytvořte Variable Group `legito-agent-vars` s DB credentials
4. Vytvořte Service Connection k Azure subscription
5. Upravte `azure-pipelines.yml` — doplňte názvy resources
6. Spusťte pipeline

## Krok 6: Frontend úpravy

Frontend v tomto balíčku stále používá Supabase klienta. Pro plnou migraci je potřeba:

1. Nahradit `supabase.functions.invoke()` za `fetch(VITE_API_URL + '/api/...')`
2. Nahradit `supabase.from('table')` za API volání na backend
3. Nahradit `supabase.auth` za MSAL (Azure AD)

### Příklad nahrazení:

**Před (Supabase):**
```typescript
const { data } = await supabase
  .from('projects')
  .select('*')
  .eq('user_id', user.id);
```

**Po (Express API):**
```typescript
const response = await fetch(`${API_URL}/api/projects`, {
  headers: { Authorization: `Bearer ${token}` },
});
const data = await response.json();
```

> **Poznámka:** Backend endpointy pro CRUD operace nad tabulkami (`/api/projects`, `/api/tasks`, atd.) je potřeba doimplementovat v Express backendu. Tento balíček obsahuje konverzi 5 hlavních edge functions. Pro CRUD operace doporučujeme vytvořit generické REST endpointy.

## Firewall pravidla

Outbound z App Service:
- `api.browser-use.com:443`
- `live.browser-use.com:443`
- `cdn.browser-use.com:443`
- `*.openai.azure.com:443`
- `r.jina.ai:443`

Inbound:
- Port `443` z interní sítě / VPN
