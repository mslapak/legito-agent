import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Play, History, TestTube, ArrowRight, Sparkles, ClipboardList, FileCheck2, FolderKanban, LucideIcon } from 'lucide-react';
import pwcLogo from '@/assets/pwc-logo.png';

interface Feature {
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
  detailsKey: string;
}

export default function Index() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);

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

  const features: Feature[] = [
    { 
      icon: TestTube, 
      titleKey: 'landing.features.aiGenerator.title',
      descriptionKey: 'landing.features.aiGenerator.description',
      detailsKey: 'landing.features.aiGenerator.details',
    },
    { 
      icon: ClipboardList, 
      titleKey: 'landing.features.import.title',
      descriptionKey: 'landing.features.import.description',
      detailsKey: 'landing.features.import.details',
    },
    { 
      icon: Play, 
      titleKey: 'landing.features.browserAutomation.title',
      descriptionKey: 'landing.features.browserAutomation.description',
      detailsKey: 'landing.features.browserAutomation.details',
    },
    { 
      icon: FileCheck2, 
      titleKey: 'landing.features.docVerification.title',
      descriptionKey: 'landing.features.docVerification.description',
      detailsKey: 'landing.features.docVerification.details',
    },
    { 
      icon: History, 
      titleKey: 'landing.features.history.title',
      descriptionKey: 'landing.features.history.description',
      detailsKey: 'landing.features.history.details',
    },
    { 
      icon: FolderKanban, 
      titleKey: 'landing.features.projectManagement.title',
      descriptionKey: 'landing.features.projectManagement.description',
      detailsKey: 'landing.features.projectManagement.details',
    },
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
              {t('landing.signIn')} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </nav>

          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-8">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">{t('landing.tagline')}</span>
            </div>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
              <span className="text-primary">{t('landing.title1')}</span>
              <br /><span className="text-foreground">{t('landing.title2')}</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              {t('landing.description')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" onClick={() => navigate('/auth')} className="gradient-primary glow text-lg px-8">
                {t('landing.getStarted')} <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <section className="py-24 bg-secondary/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('landing.completeQA')}</h2>
            <p className="text-muted-foreground text-lg">{t('landing.completeQADescription')}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div 
                key={feature.titleKey} 
                onClick={() => setSelectedFeature(feature)}
                className="p-6 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all hover:shadow-lg cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t(feature.titleKey)}</h3>
                <p className="text-muted-foreground text-sm">{t(feature.descriptionKey)}</p>
                <p className="text-primary text-xs mt-3 opacity-0 group-hover:opacity-100 transition-opacity">{t('landing.clickForMore')}</p>
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

      <Dialog open={!!selectedFeature} onOpenChange={() => setSelectedFeature(null)}>
        <DialogContent className="sm:max-w-md">
          {selectedFeature && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                    <selectedFeature.icon className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <DialogTitle>{t(selectedFeature.titleKey)}</DialogTitle>
                </div>
                <DialogDescription>{t(selectedFeature.descriptionKey)}</DialogDescription>
              </DialogHeader>
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-3">{t('landing.keyFeatures')}</h4>
                <ul className="space-y-2">
                  {(t(selectedFeature.detailsKey, { returnObjects: true }) as string[]).map((detail, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-primary mt-1">•</span>
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
              <Button onClick={() => navigate('/auth')} className="mt-4 w-full gradient-primary">
                {t('landing.tryFeature')} {t(selectedFeature.titleKey)}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
