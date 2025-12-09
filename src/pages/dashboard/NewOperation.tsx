import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Play, Loader2, ChevronDown, Copy, Eye, EyeOff } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

interface Step {
  step: number;
  action: string;
  result?: string;
}

interface DuplicateTask {
  id: string;
  title: string;
  prompt: string;
  steps: Step[] | null;
}

export default function NewOperation() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const duplicateFromId = searchParams.get('duplicate_from');

  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepBrowserOpen, setKeepBrowserOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [duplicateTask, setDuplicateTask] = useState<DuplicateTask | null>(null);
  const [stepsOpen, setStepsOpen] = useState(true);

  useEffect(() => {
    if (duplicateFromId) {
      fetchDuplicateTask(duplicateFromId);
    }
  }, [duplicateFromId]);

  const fetchDuplicateTask = async (taskId: string) => {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, prompt, steps')
      .eq('id', taskId)
      .single();

    if (error) {
      toast.error('Nepodařilo se načíst původní operaci');
      return;
    }

    setDuplicateTask({
      id: data.id,
      title: data.title,
      prompt: data.prompt,
      steps: Array.isArray(data.steps) ? (data.steps as unknown as Step[]) : null,
    });
    setPrompt(data.prompt);
    setTitle(`${data.title} (kopie)`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prompt.trim()) {
      toast.error('Zadejte instrukce pro operaci');
      return;
    }

    if (!user) {
      toast.error('Musíte být přihlášeni');
      return;
    }

    setLoading(true);

    try {
      // Build prompt with credentials if provided
      let fullPrompt = prompt;
      if (username && password) {
        fullPrompt = `Credentials for login:\nUsername: ${username}\nPassword: ${password}\n\nInstructions:\n${prompt}`;
      }

      const { data, error } = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'create_task',
          prompt: fullPrompt,
          title: title || 'Operace v Legito',
          userId: user.id,
          keepBrowserOpen,
          taskType: 'operation',
        },
      });

      if (error) throw error;

      toast.success('Operace spuštěna');
      navigate(`/dashboard/operations/${data.taskId}`);
    } catch (error: any) {
      console.error('Error creating operation:', error);
      toast.error(error.message || 'Nepodařilo se spustit operaci');
    } finally {
      setLoading(false);
    }
  };

  const parseSteps = (steps: Step[] | null): Step[] => {
    if (!steps || !Array.isArray(steps)) return [];
    return steps;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {duplicateTask && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Copy className="h-4 w-4" />
                Duplikace z: {duplicateTask.title}
              </CardTitle>
            </div>
            <CardDescription>
              Upravte prompt nebo přidejte pokyny pro pokračování
            </CardDescription>
          </CardHeader>
          {duplicateTask.steps && duplicateTask.steps.length > 0 && (
            <CardContent className="pt-0">
              <Collapsible open={stepsOpen} onOpenChange={setStepsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between">
                    Původní kroky ({duplicateTask.steps.length})
                    <ChevronDown className={`h-4 w-4 transition-transform ${stepsOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                    {parseSteps(duplicateTask.steps).map((step, index) => (
                      <div key={index} className="text-sm p-2 rounded bg-muted/50">
                        <span className="font-medium">Krok {step.step}:</span> {step.action}
                        {step.result && (
                          <p className="text-muted-foreground mt-1 text-xs">{step.result}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nová operace</CardTitle>
          <CardDescription>
            Zadejte instrukce pro Browser-Use AI agenta. Např. "Přihlaš se do Legito, otevři dashboard, vytvoř nový template..."
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Název operace (volitelné)</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Např. Vytvoření nového template"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">Instrukce *</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Přihlaš se do Legito na adrese https://..., otevři dashboard, klikni na Templates, vytvoř nový template s názvem..."
                rows={6}
                className="resize-none"
              />
            </div>

            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="w-full justify-between">
                  Přihlašovací údaje (volitelné)
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Uživatelské jméno / Email</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Heslo</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="keepBrowserOpen"
                checked={keepBrowserOpen}
                onCheckedChange={(checked) => setKeepBrowserOpen(checked as boolean)}
              />
              <Label htmlFor="keepBrowserOpen" className="text-sm font-normal cursor-pointer">
                Nechat prohlížeč otevřený (pro interaktivní práci)
              </Label>
            </div>

            <Button type="submit" className="w-full" disabled={loading || !prompt.trim()}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Spouštím...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Spustit operaci
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
