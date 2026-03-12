# Frontend Deployment Package

This directory contains everything needed to deploy the frontend on Azure.

## Quick Start

### Option A: Automated Migration (Recommended)

Run the migration script from the project root:

```bash
bash deployment/frontend/build-migrated-frontend.sh
```

This will:
1. Copy `src/` from the main project
2. Overwrite `useAuth.tsx` and `Auth.tsx` with Azure AD versions
3. Apply all `supabase` → `api` replacements automatically
4. Keep the `api/` directory with `client.ts` and `auth.ts`

### Option B: Manual Migration

Follow `MIGRATION-GUIDE.md` step by step.

## Pre-prepared Files

| File | Purpose |
|---|---|
| `src/api/client.ts` | API client replacing Supabase JS (mimics `.from().select()` syntax) |
| `src/api/auth.ts` | MSAL authentication for Azure AD (Entra ID) |
| `src/hooks/useAuth.tsx` | Auth hook using MSAL instead of Supabase Auth |
| `src/pages/Auth.tsx` | Login page with Azure AD redirect |
| `build-migrated-frontend.sh` | Automated migration script |

## After Migration

1. Install dependencies: `npm install @azure/msal-browser @azure/msal-react`
2. Remove Supabase: `npm uninstall @supabase/supabase-js`
3. Configure `.env`:
   ```
   VITE_API_URL=https://your-backend.azurewebsites.net
   VITE_AUTH_CLIENT_ID=your-azure-ad-client-id
   VITE_AUTH_TENANT_ID=your-azure-ad-tenant-id
   VITE_AUTH_REDIRECT_URI=https://your-frontend.azurewebsites.net/auth
   ```
4. Build: `npm run build`
5. Deploy `dist/` to Azure App Service

## Docker

```bash
docker build -f deployment/frontend/Dockerfile -t qa-frontend .
docker run -p 80:80 qa-frontend
```

## Notes

- Realtime subscriptions (`supabase.channel()`) are stubbed — they log a warning and do nothing. Replace with `setInterval` polling where needed.
- The `Json` type from Supabase types is replaced with `type Json = any` locally in files that need it.
- The `api.auth.getUser()` call is available via the API client for backward compatibility in components that create records with `user_id`.
