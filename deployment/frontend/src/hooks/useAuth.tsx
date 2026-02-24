/**
 * useAuth hook for Azure AD (Entra ID)
 * Drop-in replacement for the Supabase-based useAuth hook
 *
 * Changes from Supabase version:
 *   - signIn()  → MSAL redirect (no email/password form)
 *   - signUp()  → not applicable (users managed in Azure AD)
 *   - signOut() → MSAL logout redirect
 *   - user      → mapped from MSAL AccountInfo
 *   - session   → contains accessToken
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  signIn as msalSignIn,
  signOut as msalSignOut,
  getCurrentUser,
  getAccessToken,
  getMsalInstance,
  type AzureUser,
} from '@/api/auth';

interface Session {
  access_token: string;
}

interface AuthContextType {
  user: AzureUser | null;
  session: Session | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AzureUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        // Initialize MSAL and handle redirect
        await getMsalInstance();

        const currentUser = await getCurrentUser();
        setUser(currentUser);

        if (currentUser) {
          const token = await getAccessToken();
          if (token) setSession({ access_token: token });
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  const signIn = async () => {
    await msalSignIn();
  };

  const signOut = async () => {
    await msalSignOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
