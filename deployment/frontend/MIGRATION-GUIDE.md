# Frontend Migration Guide

## Soubory k nahrazení

Při migraci na Azure nahraďte tyto soubory:

### 1. Autentizace

| Původní soubor | Nahradit za |
|---|---|
| `src/hooks/useAuth.tsx` | `deployment/frontend/src/hooks/useAuth.tsx` |
| `src/pages/Auth.tsx` | `deployment/frontend/src/pages/Auth.tsx` |

### 2. API klient

| Akce | Soubor |
|---|---|
| Přidat nový | `deployment/frontend/src/api/client.ts` |
| Přidat nový | `deployment/frontend/src/api/auth.ts` |

### 3. Nahrazení importů v celém projektu

Proveďte find & replace ve všech `.tsx` a `.ts` souborech:

```bash
# 1. Import Supabase → API client
# Najdi:
import { supabase } from '@/integrations/supabase/client';
# Nahraď za:
import { api } from '@/api/client';

# 2. Supabase volání → API volání
# Najdi:
supabase.from(
# Nahraď za:
api.from(

# Najdi:
supabase.functions.invoke(
# Nahraď za:
api.functions.invoke(

# Najdi:
supabase.channel(
# Nahraď za:
api.channel(

# Najdi:
supabase.removeChannel(
# Nahraď za:
api.removeChannel(
```

### 4. Změny v autentizaci

Původní `useAuth` hook měl `signIn(email, password)` a `signUp(email, password, name)`.
Nový hook má pouze `signIn()` (Azure AD redirect) a `signOut()`.

Odstraňte:
- Formuláře pro email/heslo na Auth stránce
- Registrační formuláře (uživatele spravuje Azure AD)
- Veškerá volání `signUp()`

### 5. User objekt

Původní `user` objekt (Supabase):
```typescript
user.id               // UUID
user.email             // string
user.user_metadata.full_name  // string
```

Nový `user` objekt (Azure AD) — **stejná struktura**:
```typescript
user.id                // localAccountId z MSAL
user.email             // username z MSAL
user.user_metadata.full_name  // name z MSAL
```

### 6. Realtime

Supabase Realtime kanály (`supabase.channel(...)`) nejsou v Azure verzi dostupné.
API klient obsahuje stub, který loguje upozornění.

**Doporučení:** Nahraďte realtime subscription za polling s `setInterval`:

```typescript
// Před (Supabase Realtime):
const channel = supabase.channel('changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, callback)
  .subscribe();

// Po (Polling):
const interval = setInterval(() => fetchTasks(), 5000);
return () => clearInterval(interval);
```

### 7. Instalace závislostí

```bash
npm install @azure/msal-browser @azure/msal-react
npm uninstall @supabase/supabase-js
```

### 8. Environment variables

Odstraňte z `.env`:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Přidejte do `.env`:
```
VITE_API_URL=https://your-backend.azurewebsites.net
VITE_AUTH_CLIENT_ID=your-azure-ad-client-id
VITE_AUTH_TENANT_ID=your-azure-ad-tenant-id
VITE_AUTH_REDIRECT_URI=https://your-frontend.azurewebsites.net/auth
```
