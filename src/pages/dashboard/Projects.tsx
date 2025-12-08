import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  FolderOpen,
  Plus,
  Loader2,
  ExternalLink,
  Pencil,
  Trash2,
  Globe,
  Calendar,
  ChevronDown,
  TestTube,
} from 'lucide-react';
import ProjectTestHistory from '@/components/ProjectTestHistory';

interface Project {
  id: string;
  name: string;
  description: string | null;
  base_url: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectWithTestCount extends Project {
  testCount: number;
}

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectWithTestCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    base_url: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user]);

  const fetchProjects = async () => {
    try {
      // Fetch projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (projectsError) throw projectsError;

      // Fetch test counts for each project
      const projectsWithCounts: ProjectWithTestCount[] = await Promise.all(
        (projectsData || []).map(async (project) => {
          const { count } = await supabase
            .from('generated_tests')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', project.id);
          
          return {
            ...project,
            testCount: count || 0,
          };
        })
      );

      setProjects(projectsWithCounts);
    } catch (error) {
      console.error('Error fetching projects:', error);
      toast.error('Nepodařilo se načíst projekty');
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingProject(null);
    setFormData({ name: '', description: '', base_url: '' });
    setIsDialogOpen(true);
  };

  const openEditDialog = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description || '',
      base_url: project.base_url || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Zadejte název projektu');
      return;
    }

    setIsSaving(true);
    try {
      if (editingProject) {
        const { error } = await supabase
          .from('projects')
          .update({
            name: formData.name,
            description: formData.description || null,
            base_url: formData.base_url || null,
          })
          .eq('id', editingProject.id);

        if (error) throw error;
        toast.success('Projekt aktualizován');
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Uživatel není přihlášen');

        const { error } = await supabase
          .from('projects')
          .insert({
            user_id: user.id,
            name: formData.name,
            description: formData.description || null,
            base_url: formData.base_url || null,
          });

        if (error) throw error;
        toast.success('Projekt vytvořen');
      }

      setIsDialogOpen(false);
      fetchProjects();
    } catch (error) {
      console.error('Error saving project:', error);
      toast.error('Nepodařilo se uložit projekt');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (projectId: string) => {
    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);

      if (error) throw error;
      toast.success('Projekt smazán');
      fetchProjects();
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error('Nepodařilo se smazat projekt');
    }
  };

  const toggleProjectExpand = (projectId: string) => {
    setExpandedProjectId(prev => prev === projectId ? null : projectId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
            <FolderOpen className="w-6 h-6 text-secondary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Projekty</h1>
            <p className="text-muted-foreground">
              Spravujte testované webové aplikace
            </p>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} className="gradient-primary">
              <Plus className="mr-2 h-4 w-4" />
              Nový projekt
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingProject ? 'Upravit projekt' : 'Nový projekt'}
                </DialogTitle>
                <DialogDescription>
                  {editingProject 
                    ? 'Upravte údaje o projektu'
                    : 'Vytvořte nový projekt pro organizaci testů'
                  }
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Název projektu *</Label>
                  <Input
                    id="name"
                    placeholder="Můj e-shop"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="base_url">URL aplikace</Label>
                  <Input
                    id="base_url"
                    type="url"
                    placeholder="https://example.com"
                    value={formData.base_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, base_url: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Popis</Label>
                  <Textarea
                    id="description"
                    placeholder="Krátký popis projektu..."
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Zrušit
                </Button>
                <Button type="submit" disabled={isSaving} className="gradient-primary">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Ukládám...
                    </>
                  ) : (
                    editingProject ? 'Uložit změny' : 'Vytvořit projekt'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Projects List */}
      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-2">Zatím žádné projekty</h3>
            <p className="text-muted-foreground mb-4">
              Vytvořte svůj první projekt pro organizaci testů
            </p>
            <Button onClick={openCreateDialog} className="gradient-primary">
              <Plus className="mr-2 h-4 w-4" />
              Vytvořit projekt
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <Collapsible
              key={project.id}
              open={expandedProjectId === project.id}
              onOpenChange={() => toggleProjectExpand(project.id)}
            >
              <Card className="overflow-hidden">
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <CardTitle className="text-lg">{project.name}</CardTitle>
                            {project.testCount > 0 && (
                              <Badge variant="secondary" className="flex items-center gap-1">
                                <TestTube className="w-3 h-3" />
                                {project.testCount} testů
                              </Badge>
                            )}
                          </div>
                          {project.description && (
                            <CardDescription className="mt-1">
                              {project.description}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(project);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Smazat projekt?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tato akce je nevratná. Projekt "{project.name}" a všechny jeho testy budou permanentně smazány.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Zrušit</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(project.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Smazat
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <ChevronDown 
                          className={`h-5 w-5 text-muted-foreground transition-transform ${
                            expandedProjectId === project.id ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      {project.base_url && (
                        <a
                          href={project.base_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:text-primary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Globe className="h-4 w-4" />
                          <span className="truncate max-w-[200px]">{project.base_url}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {new Date(project.created_at).toLocaleDateString('cs-CZ')}
                      </span>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0 border-t">
                    <div className="pt-4">
                      <h4 className="font-medium mb-4 flex items-center gap-2">
                        <TestTube className="w-4 h-4 text-primary" />
                        Historie vygenerovaných testů
                      </h4>
                      <ProjectTestHistory 
                        projectId={project.id} 
                        projectName={project.name} 
                      />
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}
