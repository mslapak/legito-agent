# Environment Variables

## Frontend (.env)

| Proměnná | Popis | Příklad |
|---|---|---|
| `VITE_API_URL` | URL backendu | `https://legito-backend.azurewebsites.net` |
| `VITE_AUTH_CLIENT_ID` | Azure AD Application (client) ID | `12345678-1234-1234-1234-123456789012` |
| `VITE_AUTH_TENANT_ID` | Azure AD Directory (tenant) ID | `87654321-4321-4321-4321-210987654321` |
| `VITE_AUTH_REDIRECT_URI` | OAuth redirect URI | `https://legito-frontend.azurewebsites.net/auth` |

## Backend (.env)

| Proměnná | Popis | Příklad |
|---|---|---|
| `PORT` | Port serveru | `3001` |
| `NODE_ENV` | Prostředí | `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `AZURE_AD_TENANT_ID` | Azure AD tenant ID | `87654321-...` |
| `AZURE_AD_CLIENT_ID` | Azure AD client ID | `12345678-...` |
| `AZURE_AD_ISSUER` | Token issuer URL | `https://login.microsoftonline.com/{tenant}/v2.0` |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint | `https://my-openai.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API klíč | `sk-...` |
| `AZURE_OPENAI_DEPLOYMENT` | Název deployment modelu | `gpt-4o-mini` |
| `AZURE_OPENAI_API_VERSION` | API verze | `2024-08-01-preview` |
| `BROWSER_USE_API_KEY` | Browser-Use Cloud API klíč | `bu_...` |
| `CORS_ORIGIN` | Povolený origin pro CORS | `https://legito-frontend.azurewebsites.net` |
| `SELF_URL` | URL backendu pro self-invoke (batch) | `https://legito-backend.azurewebsites.net` |

## Azure DevOps Pipeline Variables

Nastavte v Library → Variable Groups → `legito-agent-vars`:

| Proměnná | Typ | Popis |
|---|---|---|
| `DB_HOST` | Secret | PostgreSQL host |
| `DB_USER` | Secret | PostgreSQL user |
| `DB_PASSWORD` | Secret | PostgreSQL password |
| `DB_NAME` | Plain | Název databáze |
| `deployDatabase` | Plain | `true` pro první nasazení, pak `false` |

## Azure AD App Registration

1. Přejděte do **Azure Portal → Entra ID → App registrations → New registration**
2. Name: `Legito Agent`
3. Redirect URI: `https://<frontend-url>/auth` (Single-page application)
4. API permissions: `User.Read` (Microsoft Graph)
5. Zapište si: **Application (client) ID** a **Directory (tenant) ID**
