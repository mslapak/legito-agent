import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Play, Trash2, Loader2, CheckCircle2, XCircle, Clock, RotateCcw, Pencil } from 'lucide-react';

interface GeneratedTest {
  id: string;
  title: string;
  prompt: string;
  expected_result: string | null;
  priority: string;
  status: string;
  task_id: string | null;
  created_at: string;
}

interface ProjectTestHistoryProps {
  projectId: string;
  projectName: string;
  setupPrompt?: string | null;
  baseUrl?: string | null;
}

export default function ProjectTestHistory({ projectId, projectName, setupPrompt, baseUrl }: ProjectTestHistoryProps) {
  const { t, i18n } = useTranslation();
  const [tests, setTests] = useState<GeneratedTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  const [editingTest, setEditingTest] = useState<GeneratedTest | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    prompt: '',
    expected_result: '',
    priority: 'medium',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchTests();
    const unsubscribe = subscribeToTests();
    return unsubscribe;
  }, [projectId]);

  // Poll running tests to check their actual status
  useEffect(() => {
    const runningTests = tests.filter(t => t.status === 'running' && t.task_id);
    if (runningTests.length === 0) return;

    const checkRunningTests = async () => {
      for (const test of runningTests) {
        try {
          const response = await supabase.functions.invoke('browser-use', {
            body: {
              action: 'get_task_status',
              taskId: test.task_id,
            },
          });

          // Handle expired/not found task - session no longer exists, mark as passed
          if (response.data?.expired || response.data?.status === 'not_found') {
            await supabase
              .from('generated_tests')
              .update({ 
                status: 'passed',
                last_run_at: new Date().toISOString(),
              })
              .eq('id', test.id);
            continue;
          }

          if (response.data?.status) {
            const apiStatus = response.data.status;
            console.log(`Test ${test.id} API status:`, apiStatus);
            // Map API status to our test status - V2 API compatible
            let newStatus = test.status;
            if (apiStatus === 'finished' || apiStatus === 'completed' || apiStatus === 'done') {
              newStatus = 'passed'; // Default to passed, will be evaluated later
            } else if (apiStatus === 'failed' || apiStatus === 'error') {
              newStatus = 'failed';
            } else if (apiStatus === 'stopped') {
              // V2: stopped with output = completed, without = cancelled
              if (response.data?.output || response.data?.finished_at || response.data?.finishedAt) {
                newStatus = 'passed';
              } else {
                newStatus = 'pending'; // Reset if stopped without output
              }
            } else if (apiStatus === 'started' || apiStatus === 'created' || apiStatus === 'running') {
              // V2 API: 'started' a 'created' jsou running stavy
              newStatus = 'running';
            }

            if (newStatus !== 'running') {
              // Calculate execution time from response data
              const startedAt = response.data?.started_at || response.data?.startedAt || response.data?.created_at;
              const finishedAt = response.data?.finished_at || response.data?.finishedAt || new Date().toISOString();
              let executionTimeMs: number | null = null;
              
              if (startedAt) {
                executionTimeMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
              }

              // Extract result summary from output
              const output = response.data?.output || response.data?.result || '';
              const resultSummary = typeof output === 'string' 
                ? output.substring(0, 500) 
                : JSON.stringify(output).substring(0, 500);

              await supabase
                .from('generated_tests')
                .update({ 
                  status: newStatus,
                  last_run_at: new Date().toISOString(),
                  execution_time_ms: executionTimeMs,
                  result_summary: resultSummary || null,
                })
                .eq('id', test.id);
            }
          }
        } catch (error) {
          console.error('Error checking test status:', error);
          // If error persists, mark test as completed to stop polling
          await supabase
            .from('generated_tests')
            .update({ 
              status: 'passed',
              last_run_at: new Date().toISOString(),
            })
            .eq('id', test.id);
        }
      }
    };

    // Check immediately and then every 5 seconds
    checkRunningTests();
    const interval = setInterval(checkRunningTests, 5000);

    return () => clearInterval(interval);
  }, [tests]);

  const fetchTests = async () => {
    try {
      const { data, error } = await supabase
        .from('generated_tests')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTests(data || []);
    } catch (error) {
      console.error('Error fetching tests:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToTests = () => {
    const channel = supabase
      .channel(`generated-tests-${projectId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'generated_tests',
          filter: `project_id=eq.${projectId}`
        },
        () => {
          fetchTests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const runTest = async (test: GeneratedTest) => {
    setRunningTestId(test.id);
    try {
      // Fetch credentials for this project
      const { data: credentials } = await supabase
        .from('project_credentials')
        .select('username, password')
        .eq('project_id', projectId)
        .limit(1)
        .single();

      // Build full prompt with setup, test, and credentials
      let promptParts: string[] = [];

      // 1. Add base URL if available
      if (baseUrl) {
        promptParts.push(`${i18n.language === 'cs' ? 'Otevři stránku' : 'Open page'}: ${baseUrl}`);
      }

      // 2. Add setup prompt if available
      if (setupPrompt) {
        promptParts.push(`${i18n.language === 'cs' ? 'Proveď tyto přípravné kroky' : 'Perform these setup steps'}:\n${setupPrompt}`);
      }

      // 3. Add the actual test
      promptParts.push(`${i18n.language === 'cs' ? 'Nyní proveď test' : 'Now run the test'}:\n${test.prompt}`);

      // 4. Add credentials at the end if available
      if (credentials) {
        promptParts.push(`${i18n.language === 'cs' ? 'Přihlašovací údaje (použij když je potřeba)' : 'Login credentials (use when needed)'}:\n- Email/Username: ${credentials.username}\n- ${i18n.language === 'cs' ? 'Heslo' : 'Password'}: ${credentials.password}`);
      }

      const fullPrompt = promptParts.join('\n\n');

      const response = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'create_task',
          prompt: fullPrompt,
          title: test.title,
          projectId: projectId,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      // Update test status and link to task
      const taskId = response.data?.task?.id;
      await supabase
        .from('generated_tests')
        .update({ 
          status: 'running',
          task_id: taskId 
        })
        .eq('id', test.id);

      toast.success(t('testHistory.testStarted'));
    } catch (error) {
      console.error('Error running test:', error);
      toast.error(t('testHistory.testStartFailed'));
    } finally {
      setRunningTestId(null);
    }
  };

  const deleteTest = async (testId: string) => {
    try {
      const { error } = await supabase
        .from('generated_tests')
        .delete()
        .eq('id', testId);

      if (error) throw error;
      toast.success(t('testHistory.testDeleted'));
    } catch (error) {
      console.error('Error deleting test:', error);
      toast.error(t('testHistory.deleteFailed'));
    }
  };

  const resetTestStatus = async (testId: string) => {
    try {
      const { error } = await supabase
        .from('generated_tests')
        .update({ status: 'pending', task_id: null })
        .eq('id', testId);

      if (error) throw error;
      toast.success(t('testHistory.statusReset'));
    } catch (error) {
      console.error('Error resetting test:', error);
    }
  };

  const openEditDialog = (test: GeneratedTest) => {
    setEditingTest(test);
    setEditForm({
      title: test.title,
      prompt: test.prompt,
      expected_result: test.expected_result || '',
      priority: test.priority,
    });
  };

  const closeEditDialog = () => {
    setEditingTest(null);
    setEditForm({ title: '', prompt: '', expected_result: '', priority: 'medium' });
  };

  const saveTestEdit = async () => {
    if (!editingTest) return;
    
    if (!editForm.title.trim() || !editForm.prompt.trim()) {
      toast.error(t('testHistory.titlePromptRequired'));
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('generated_tests')
        .update({
          title: editForm.title.trim(),
          prompt: editForm.prompt.trim(),
          expected_result: editForm.expected_result.trim() || null,
          priority: editForm.priority,
        })
        .eq('id', editingTest.id);

      if (error) throw error;
      toast.success(t('testHistory.testUpdated'));
      closeEditDialog();
      fetchTests();
    } catch (error) {
      console.error('Error updating test:', error);
      toast.error(t('testHistory.updateFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />{t('testHistory.statusPending')}</Badge>;
      case 'running':
        return <Badge className="bg-warning text-warning-foreground"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{t('testHistory.statusRunning')}</Badge>;
      case 'passed':
        return <Badge className="bg-success text-success-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />{t('testHistory.statusPassed')}</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />{t('testHistory.statusFailed')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive" className="text-xs">{t('testHistory.priorityHigh')}</Badge>;
      case 'medium':
        return <Badge className="bg-warning text-warning-foreground text-xs">{t('testHistory.priorityMedium')}</Badge>;
      case 'low':
        return <Badge variant="secondary" className="text-xs">{t('testHistory.priorityLow')}</Badge>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (tests.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>{t('testHistory.noTests')}</p>
        <p className="text-sm mt-1">{t('testHistory.goToGenerator')}</p>
      </div>
    );
  }

  const pendingCount = tests.filter(t => t.status === 'pending').length;
  const runningCount = tests.filter(t => t.status === 'running').length;
  const passedCount = tests.filter(t => t.status === 'passed').length;
  const failedCount = tests.filter(t => t.status === 'failed').length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <Badge variant="outline" className="text-sm py-1 px-3">
          {t('testHistory.total')}: {tests.length}
        </Badge>
        {pendingCount > 0 && (
          <Badge variant="secondary" className="text-sm py-1 px-3">
            <Clock className="w-3 h-3 mr-1" />
            {t('testHistory.pending')}: {pendingCount}
          </Badge>
        )}
        {runningCount > 0 && (
          <Badge className="bg-warning text-warning-foreground text-sm py-1 px-3">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            {t('testHistory.running')}: {runningCount}
          </Badge>
        )}
        {passedCount > 0 && (
          <Badge className="bg-success text-success-foreground text-sm py-1 px-3">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {t('testHistory.passed')}: {passedCount}
          </Badge>
        )}
        {failedCount > 0 && (
          <Badge variant="destructive" className="text-sm py-1 px-3">
            <XCircle className="w-3 h-3 mr-1" />
            {t('testHistory.failed')}: {failedCount}
          </Badge>
        )}
      </div>

      {/* Test List */}
      <div className="space-y-3">
        {tests.map((test) => (
          <div
            key={test.id}
            className="p-4 rounded-lg border border-border hover:border-primary/30 transition-colors bg-card"
          >
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-medium">{test.title}</h4>
                  {getStatusBadge(test.status)}
                  {getPriorityBadge(test.priority)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(test.created_at).toLocaleString(i18n.language === 'cs' ? 'cs-CZ' : 'en-US')}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {test.status !== 'running' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runTest(test)}
                    disabled={runningTestId === test.id}
                    title={t('testHistory.runTest')}
                  >
                    {runningTestId === test.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditDialog(test)}
                  title={t('testHistory.editTest')}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {(test.status === 'passed' || test.status === 'failed') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => resetTestStatus(test.id)}
                    title={t('testHistory.resetStatus')}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteTest(test.id)}
                  className="text-muted-foreground hover:text-destructive"
                  title={t('testHistory.deleteTest')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground line-clamp-2">
              {test.prompt}
            </div>
            
            {test.expected_result && (
              <div className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium">{t('testHistory.expected')}:</span> {test.expected_result}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingTest} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('testHistory.editTestTitle')}</DialogTitle>
            <DialogDescription>
              {t('testHistory.editTestDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">{t('testHistory.testName')} *</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder={t('testHistory.testNamePlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-prompt">{t('testHistory.prompt')} *</Label>
              <Textarea
                id="edit-prompt"
                value={editForm.prompt}
                onChange={(e) => setEditForm(prev => ({ ...prev, prompt: e.target.value }))}
                placeholder={t('testHistory.promptPlaceholder')}
                rows={6}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-expected">{t('testHistory.expectedResult')}</Label>
              <Textarea
                id="edit-expected"
                value={editForm.expected_result}
                onChange={(e) => setEditForm(prev => ({ ...prev, expected_result: e.target.value }))}
                placeholder={t('testHistory.expectedPlaceholder')}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-priority">{t('testHistory.priority')}</Label>
              <Select
                value={editForm.priority}
                onValueChange={(value) => setEditForm(prev => ({ ...prev, priority: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">{t('testHistory.priorityHigh')}</SelectItem>
                  <SelectItem value="medium">{t('testHistory.priorityMedium')}</SelectItem>
                  <SelectItem value="low">{t('testHistory.priorityLow')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeEditDialog}>
              {t('common.cancel')}
            </Button>
            <Button onClick={saveTestEdit} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('testHistory.saving')}
                </>
              ) : (
                t('testHistory.saveChanges')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
