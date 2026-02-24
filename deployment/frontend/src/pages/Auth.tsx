/**
 * Auth page for Azure AD (Entra ID)
 * Replaces email/password form with Azure AD redirect login
 *
 * This page:
 * 1. Shows a "Sign in with Azure AD" button
 * 2. Handles the redirect callback after Azure AD login
 * 3. Redirects to /dashboard once authenticated
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, LogIn } from 'lucide-react';
import pwcLogo from '@/assets/pwc-logo.png';

export default function Auth() {
  const { t } = useTranslation();
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={pwcLogo} alt="Logo" className="h-12" />
          </div>
          <CardTitle className="text-2xl">{t('auth.login')}</CardTitle>
          <CardDescription>
            {t('auth.loginDescription', 'Přihlaste se pomocí firemního účtu')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full"
            size="lg"
            onClick={() => signIn()}
          >
            <LogIn className="mr-2 h-4 w-4" />
            {t('auth.signInWithAzureAD', 'Přihlásit se přes Azure AD')}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            {t('auth.azureAdNote', 'Budete přesměrováni na přihlašovací stránku Microsoft.')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
