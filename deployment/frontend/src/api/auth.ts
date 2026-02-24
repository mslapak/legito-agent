/**
 * MSAL Authentication for Azure AD (Entra ID)
 * Replaces Supabase Auth
 *
 * Required env vars:
 *   VITE_AUTH_CLIENT_ID   - Azure AD Application (client) ID
 *   VITE_AUTH_TENANT_ID   - Azure AD Directory (tenant) ID
 *   VITE_AUTH_REDIRECT_URI - OAuth redirect URI
 *
 * Install: npm install @azure/msal-browser @azure/msal-react
 */

import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
  type Configuration,
  type SilentRequest,
} from '@azure/msal-browser';

// ─── MSAL Config ────────────────────────────────────────────────────────────

const clientId = import.meta.env.VITE_AUTH_CLIENT_ID || '';
const tenantId = import.meta.env.VITE_AUTH_TENANT_ID || '';
const redirectUri = import.meta.env.VITE_AUTH_REDIRECT_URI || window.location.origin + '/auth';

const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
};

const loginScopes = ['openid', 'profile', 'email', 'User.Read'];

// ─── MSAL Instance ─────────────────────────────────────────────────────────

let msalInstance: PublicClientApplication | null = null;
let initPromise: Promise<void> | null = null;

export async function getMsalInstance(): Promise<PublicClientApplication> {
  if (msalInstance) return msalInstance;

  if (!initPromise) {
    msalInstance = new PublicClientApplication(msalConfig);
    initPromise = msalInstance.initialize().then(() => {
      return msalInstance!.handleRedirectPromise().then(() => {});
    });
  }

  await initPromise;
  return msalInstance!;
}

// ─── Auth Functions ─────────────────────────────────────────────────────────

export async function signIn(): Promise<void> {
  const msal = await getMsalInstance();
  await msal.loginRedirect({ scopes: loginScopes });
}

export async function signOut(): Promise<void> {
  const msal = await getMsalInstance();
  await msal.logoutRedirect();
}

export async function getAccount(): Promise<AccountInfo | null> {
  const msal = await getMsalInstance();
  const accounts = msal.getAllAccounts();
  return accounts[0] || null;
}

export async function getAccessToken(): Promise<string | null> {
  const msal = await getMsalInstance();
  const account = await getAccount();

  if (!account) return null;

  const request: SilentRequest = {
    scopes: [`api://${clientId}/access_as_user`],
    account,
  };

  try {
    const result = await msal.acquireTokenSilent(request);
    return result.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      await msal.acquireTokenRedirect(request);
      return null;
    }
    console.error('Token acquisition failed:', err);
    return null;
  }
}

// ─── User type (compatible with existing useAuth interface) ─────────────────

export interface AzureUser {
  id: string;
  email: string;
  user_metadata: {
    full_name: string;
    avatar_url?: string;
  };
}

export async function getCurrentUser(): Promise<AzureUser | null> {
  const account = await getAccount();
  if (!account) return null;

  return {
    id: account.localAccountId,
    email: account.username,
    user_metadata: {
      full_name: account.name || '',
    },
  };
}
