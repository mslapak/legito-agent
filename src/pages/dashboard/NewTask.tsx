import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Play, Loader2, Sparkles } from 'lucide-react';

interface Project {
  id: string;
  name: string;
}

export default function NewTask() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!prompt.trim()) {
      toast.error('Zadejte popis úkolu');
      return;
    }

    setIsLoading(true);
    try {
      const response = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'create_task',
          prompt: prompt,
          title: title || prompt.substring(0, 50),
          projectId: projectId || null,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success('Úkol byl vytvořen a spuštěn');
      navigate('/dashboard/history');
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error(error instanceof Error ? error.message : 'Nepodařilo se vytvořit úkol');
    } finally {
      setIsLoading(false);
    }
  };

  const examplePrompts = [
    'Navigate to example.com and take a screenshot of the homepage',
    'Go to github.com, search for "browser automation" and list the top 5 repositories',
    'Open the login page, fill in test credentials and verify the error message',
    'Navigate to the pricing page and extract all plan names and prices',
  ];

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
              <Play className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <CardTitle>Nový úkol</CardTitle>
              <CardDescription>
                Zadejte prompt pro Browser-Use agenta
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Název úkolu (volitelný)</Label>
              <Input
                id="title"
                placeholder="Např. Test přihlášení"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project">Projekt (volitelný)</Label>
              <Select value={projectId} onValueChange={(val) => setProjectId(val === "none" ? "" : val)} disabled={loadingProjects}>
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte projekt" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bez projektu</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">Popis úkolu *</Label>
              <Textarea
                id="prompt"
                placeholder="Popište, co má agent udělat..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
                rows={6}
                className="resize-none"
              />
              <p className="text-sm text-muted-foreground">
                Popište úkol přirozeným jazykem. Agent automaticky naviguje prohlížeč a provede požadované akce.
              </p>
            </div>

            {/* Example prompts */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Příklady promptů
              </Label>
              <div className="grid gap-2">
                {examplePrompts.map((example, index) => (
                  <button
                    key={index}
                    type="button"
                    className="text-left p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors text-sm"
                    onClick={() => setPrompt(example)}
                    disabled={isLoading}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <Button type="submit" className="w-full gradient-primary" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Spouštím úkol...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Spustit úkol
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
