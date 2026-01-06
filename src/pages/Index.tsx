import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Play, History, TestTube, Settings, ArrowRight, Sparkles, ClipboardList, FileCheck2, FolderKanban } from 'lucide-react';
import pwcLogo from '@/assets/pwc-logo.png';

export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
      </div>
    );
  }

  const features = [
    { icon: TestTube, title: 'AI Generátor testů', description: 'Generujte testovací scénáře z popisu aplikace nebo dokumentace pomocí AI' },
    { icon: ClipboardList, title: 'Import testů', description: 'Importujte testy z Azure DevOps, CSV souborů nebo libovolného textu' },
    { icon: Play, title: 'Browser Automation', description: 'Spouštějte AI agenty pro automatické testování webových aplikací' },
    { icon: FileCheck2, title: 'Verifikace dokumentace', description: 'Ověřte, že vaše aplikace odpovídá technické dokumentaci' },
    { icon: History, title: 'Historie & Reporting', description: 'Kompletní přehled všech testů s detailními výsledky a screenshoty' },
    { icon: FolderKanban, title: 'Správa projektů', description: 'Organizujte testy do projektů s vlastními credentials a nastavením' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24">
          <nav className="flex items-center justify-between mb-16">
            <div className="flex items-center gap-3">
              <img src={pwcLogo} alt="PwC" className="h-14 w-auto rounded" />
            </div>
            <Button onClick={() => navigate('/auth')} className="gradient-primary glow">
              Přihlásit se <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </nav>

          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-8">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">AI-Powered QA Automation Platform</span>
            </div>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
              <span className="text-primary">Automatizované</span>
              <br /><span className="text-foreground">testování s AI</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Generujte testy pomocí AI, importujte z Azure DevOps nebo CSV, 
              spouštějte automatizované browser testy a ověřujte aplikace proti dokumentaci.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" onClick={() => navigate('/auth')} className="gradient-primary glow text-lg px-8">
                Začít používat <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <section className="py-24 bg-secondary/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Kompletní QA platforma</h2>
            <p className="text-muted-foreground text-lg">Vše pro efektivní testování webových aplikací na jednom místě</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="p-6 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all hover:shadow-lg">
                <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-8 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <img src={pwcLogo} alt="PwC" className="h-10 w-auto rounded" />
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} PwC. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
