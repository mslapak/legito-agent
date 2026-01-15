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
  Settings2,
  Save,
  Info,
  Play,
  User,
  RotateCcw,
} from 'lucide-react';
import ProjectTestHistory from '@/components/ProjectTestHistory';
import ProjectCredentials from '@/components/ProjectCredentials';
import DocumentationVerification from '@/components/DocumentationVerification';
import { useTranslation } from 'react-i18next';

interface Project {
  id: string;
  name: string;
  description: string | null;
  base_url: string | null;
  setup_prompt: string | null;
  browser_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectWithTestCount extends Project {
  testCount: number;
}

export default function Projects() {
  const { t, i18n } = useTranslation();
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
  const [setupPrompts, setSetupPrompts] = useState<Record<string, string>>({});
  const [savingSetupPrompt, setSavingSetupPrompt] = useState<string | null>(null);
  const [testingSetup, setTestingSetup] = useState<string | null>(null);
  const [settingUpSession, setSettingUpSession] = useState<string | null>(null);
  const [resettingSession, setResettingSession] = useState<string | null>(null);

  const dateLocale = i18n.language === 'cs' ? 'cs-CZ' : 'en-US';

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
      toast.error(t('projects.loadFailed'));
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
      toast.error(i18n.language === 'cs' ? 'Zadejte název projektu' : 'Enter project name');
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
        toast.success(t('projects.projectUpdated'));
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error(i18n.language === 'cs' ? 'Uživatel není přihlášen' : 'User not logged in');

        const { error } = await supabase
          .from('projects')
          .insert({
            user_id: user.id,
            name: formData.name,
            description: formData.description || null,
            base_url: formData.base_url || null,
          });

        if (error) throw error;
        toast.success(t('projects.projectCreated'));
      }

      setIsDialogOpen(false);
      fetchProjects();
    } catch (error) {
      console.error('Error saving project:', error);
      toast.error(t('projects.saveFailed'));
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
      toast.success(t('projects.projectDeleted'));
      fetchProjects();
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error(t('projects.deleteFailed'));
    }
  };

  const toggleProjectExpand = (projectId: string) => {
    setExpandedProjectId(prev => prev === projectId ? null : projectId);
  };

  const handleSetupPromptChange = (projectId: string, value: string) => {
    setSetupPrompts(prev => ({ ...prev, [projectId]: value }));
  };

  const saveSetupPrompt = async (project: Project) => {
    setSavingSetupPrompt(project.id);
    try {
      const newValue = setupPrompts[project.id] ?? project.setup_prompt ?? '';
      const { error } = await supabase
        .from('projects')
        .update({ setup_prompt: newValue || null })
        .eq('id', project.id);

      if (error) throw error;
      toast.success(t('projects.setupSaved'));
      fetchProjects();
    } catch (error) {
      console.error('Error saving setup prompt:', error);
      toast.error(t('projects.setupSaveFailed'));
    } finally {
      setSavingSetupPrompt(null);
    }
  };

  const testSetupPrompt = async (project: Project) => {
    const currentSetupPrompt = setupPrompts[project.id] ?? project.setup_prompt;
    
    if (!currentSetupPrompt?.trim()) {
      toast.error(t('projects.fillSetupFirst'));
      return;
    }

    if (!project.base_url) {
      toast.error(t('projects.projectNoUrl'));
      return;
    }

    setTestingSetup(project.id);
    try {
      // Fetch credentials for this project
      const { data: credentials } = await supabase
        .from('project_credentials')
        .select('username, password')
        .eq('project_id', project.id)
        .limit(1)
        .single();

      // Build setup-only prompt
      let promptParts: string[] = [];
      promptParts.push(i18n.language === 'cs' 
        ? `Otevři stránku: ${project.base_url}`
        : `Open page: ${project.base_url}`);
      promptParts.push(i18n.language === 'cs'
        ? `Proveď tyto přípravné kroky:\n${currentSetupPrompt}`
        : `Perform these setup steps:\n${currentSetupPrompt}`);
      promptParts.push(i18n.language === 'cs'
        ? `Po dokončení přípravných kroků potvrď, že setup proběhl úspěšně.`
        : `After completing setup steps, confirm that setup was successful.`);

      if (credentials) {
        promptParts.push(i18n.language === 'cs'
          ? `Přihlašovací údaje (použij když je potřeba):\n- Email/Username: ${credentials.username}\n- Heslo: ${credentials.password}`
          : `Credentials (use when needed):\n- Email/Username: ${credentials.username}\n- Password: ${credentials.password}`);
      }

      const fullPrompt = promptParts.join('\n\n');

      const response = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'create_task',
          prompt: fullPrompt,
          title: `[Setup Test] ${project.name}`,
          projectId: project.id,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success(t('projects.setupTestStarted'));
    } catch (error) {
      console.error('Error testing setup:', error);
      toast.error(t('projects.setupTestFailed'));
    } finally {
      setTestingSetup(null);
    }
  };

  const setupBrowserSession = async (project: Project) => {
    if (!project.base_url) {
      toast.error(t('projects.projectNoUrl'));
      return;
    }

    setSettingUpSession(project.id);
    try {
      // 1. Create browser profile
      const profileResponse = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'create_profile',
          profileName: `${project.name} - Session`,
        },
      });

      if (profileResponse.error) {
        throw new Error(profileResponse.error.message);
      }

      const { profileId } = profileResponse.data;
      console.log('Created profile:', profileId);

      // 2. Save profile ID to project
      const { error: updateError } = await supabase
        .from('projects')
        .update({ browser_profile_id: profileId })
        .eq('id', project.id);

      if (updateError) throw updateError;

      // 3. Fetch credentials
      const { data: credentials } = await supabase
        .from('project_credentials')
        .select('username, password')
        .eq('project_id', project.id)
        .limit(1)
        .maybeSingle();

      // 4. Start a browser session for manual login
      const loginPrompt = i18n.language === 'cs'
        ? `Otevři stránku: ${project.base_url}

Uživatel se nyní ručně přihlásí do aplikace (včetně případného 2FA).
Počkej a umožni uživateli provést přihlášení.
${credentials ? `\nPokud je potřeba, zde jsou přihlašovací údaje:\n- Email/Username: ${credentials.username}\n- Heslo: ${credentials.password}` : ''}`
        : `Open page: ${project.base_url}

The user will now manually log in to the application (including any 2FA).
Wait and allow the user to complete the login.
${credentials ? `\nIf needed, here are the credentials:\n- Email/Username: ${credentials.username}\n- Password: ${credentials.password}` : ''}`;

      const taskResponse = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'create_task',
          prompt: loginPrompt,
          title: `[Session Setup] ${project.name}`,
          projectId: project.id,
          keepBrowserOpen: true,
          profileId: profileId,
        },
      });

      if (taskResponse.error) {
        throw new Error(taskResponse.error.message);
      }

      toast.success(i18n.language === 'cs' 
        ? 'Browser session spuštěna. Přihlaste se v prohlížeči a pak session zavřete.'
        : 'Browser session started. Log in using the browser and then close the session.');
      fetchProjects();
    } catch (error) {
      console.error('Error setting up browser session:', error);
      toast.error(i18n.language === 'cs' ? 'Nepodařilo se nastavit session' : 'Failed to setup session');
    } finally {
      setSettingUpSession(null);
    }
  };

  const resetBrowserSession = async (project: Project) => {
    if (!project.browser_profile_id) return;

    setResettingSession(project.id);
    try {
      // 1. Delete profile from Browser-Use
      await supabase.functions.invoke('browser-use', {
        body: {
          action: 'delete_profile',
          profileId: project.browser_profile_id,
        },
      });

      // 2. Clear profile ID from project
      const { error: updateError } = await supabase
        .from('projects')
        .update({ browser_profile_id: null })
        .eq('id', project.id);

      if (updateError) throw updateError;

      toast.success(i18n.language === 'cs' 
        ? 'Browser session resetována'
        : 'Browser session reset');
      fetchProjects();
    } catch (error) {
      console.error('Error resetting browser session:', error);
      toast.error(i18n.language === 'cs' ? 'Nepodařilo se resetovat session' : 'Failed to reset session');
    } finally {
      setResettingSession(null);
    }
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
            <h1 className="text-2xl font-bold">{t('projects.title')}</h1>
            <p className="text-muted-foreground">
              {t('projects.subtitle')}
            </p>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} className="gradient-primary">
              <Plus className="mr-2 h-4 w-4" />
              {t('projects.newProject')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingProject ? t('projects.editProject') : t('projects.newProject')}
                </DialogTitle>
                <DialogDescription>
                  {editingProject 
                    ? t('projects.editProjectDescription')
                    : t('projects.createProjectDescription')
                  }
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('projects.projectName')} *</Label>
                  <Input
                    id="name"
                    placeholder={t('projects.projectNamePlaceholder')}
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="base_url">{t('projects.appUrl')}</Label>
                  <Input
                    id="base_url"
                    type="url"
                    placeholder={t('projects.appUrlPlaceholder')}
                    value={formData.base_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, base_url: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t('projects.description')}</Label>
                  <Textarea
                    id="description"
                    placeholder={t('projects.descriptionPlaceholder')}
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={isSaving} className="gradient-primary">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('projects.saving')}
                    </>
                  ) : (
                    editingProject ? t('projects.saveChanges') : t('projects.createProject')
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
            <h3 className="text-lg font-medium mb-2">{t('projects.noProjects')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('projects.noProjectsDescription')}
            </p>
            <Button onClick={openCreateDialog} className="gradient-primary">
              <Plus className="mr-2 h-4 w-4" />
              {t('projects.createProject')}
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
                                {project.testCount} {t('projects.tests')}
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
                              <AlertDialogTitle>{t('projects.deleteProject')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('projects.deleteProjectConfirm', { name: project.name })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(project.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {t('common.delete')}
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
                        {new Date(project.created_at).toLocaleDateString(dateLocale)}
                      </span>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0 border-t">
                    <div className="pt-4 space-y-6">
                      {/* Credentials Section */}
                      <ProjectCredentials projectId={project.id} />
                      
                      {/* Browser Session Section */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium flex items-center gap-2">
                            <User className="w-4 h-4 text-primary" />
                            {i18n.language === 'cs' ? 'Browser Session (2FA)' : 'Browser Session (2FA)'}
                          </h4>
                          <div className="flex items-center gap-2">
                            {project.browser_profile_id ? (
                              <>
                                <Badge variant="default" className="bg-green-600 text-white">
                                  {i18n.language === 'cs' ? 'Session aktivní' : 'Session active'}
                                </Badge>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => resetBrowserSession(project)}
                                  disabled={resettingSession === project.id}
                                >
                                  {resettingSession === project.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <RotateCcw className="h-4 w-4 mr-1" />
                                      {i18n.language === 'cs' ? 'Resetovat' : 'Reset'}
                                    </>
                                  )}
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setupBrowserSession(project)}
                                disabled={settingUpSession === project.id || !project.base_url}
                                title={!project.base_url ? t('projects.projectNoUrl') : undefined}
                              >
                                {settingUpSession === project.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Play className="h-4 w-4 mr-1" />
                                    {i18n.language === 'cs' ? 'Nastavit přihlášení' : 'Setup login'}
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="rounded-lg border border-border p-3 bg-muted/30">
                          <div className="flex items-start gap-2 text-sm text-muted-foreground">
                            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <p>
                              {i18n.language === 'cs' 
                                ? 'Pro aplikace s dvoufázovým ověřením (2FA). Přihlaste se jednou ručně a prohlížeč si přihlášení zapamatuje pro všechny další testy.'
                                : 'For apps with two-factor authentication (2FA). Log in once manually and the browser will remember your login for all future tests.'}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Setup Prompt Section */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium flex items-center gap-2">
                            <Settings2 className="w-4 h-4 text-primary" />
                            {t('projects.setupPrompt')}
                          </h4>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => testSetupPrompt(project)}
                              disabled={testingSetup === project.id || !project.base_url}
                              title={!project.base_url ? t('projects.projectNoUrl') : t('projects.testSetup')}
                            >
                              {testingSetup === project.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Play className="h-4 w-4 mr-1" />
                                  {t('projects.testSetup')}
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => saveSetupPrompt(project)}
                              disabled={savingSetupPrompt === project.id}
                            >
                              {savingSetupPrompt === project.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Save className="h-4 w-4 mr-1" />
                                  {t('projects.saveSetup')}
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                        <div className="rounded-lg border border-border p-3 bg-muted/30">
                          <div className="flex items-start gap-2 text-sm text-muted-foreground mb-3">
                            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <p>
                              {t('projects.setupPromptHelp')}
                            </p>
                          </div>
                          <Textarea
                            placeholder={t('projects.setupPromptPlaceholder')}
                            value={setupPrompts[project.id] ?? project.setup_prompt ?? ''}
                            onChange={(e) => handleSetupPromptChange(project.id, e.target.value)}
                            rows={5}
                            className="font-mono text-sm"
                          />
                        </div>
                      </div>
                      
                      {/* Documentation Verification Section */}
                      <DocumentationVerification
                        projectId={project.id}
                        projectName={project.name}
                        baseUrl={project.base_url}
                      />
                      
                      {/* Test History Section */}
                      <div>
                        <h4 className="font-medium mb-4 flex items-center gap-2">
                          <TestTube className="w-4 h-4 text-primary" />
                          {t('projects.testHistory')}
                        </h4>
                        <ProjectTestHistory 
                          projectId={project.id} 
                          projectName={project.name}
                          setupPrompt={project.setup_prompt}
                          baseUrl={project.base_url}
                        />
                      </div>
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
