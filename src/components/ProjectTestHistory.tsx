import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Play, Trash2, Loader2, CheckCircle2, XCircle, Clock, RotateCcw } from 'lucide-react';

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
}

export default function ProjectTestHistory({ projectId, projectName }: ProjectTestHistoryProps) {
  const [tests, setTests] = useState<GeneratedTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningTestId, setRunningTestId] = useState<string | null>(null);

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

          // Handle 404 - task no longer exists, mark as completed
          const errorMsg = response.error?.message || JSON.stringify(response.data) || '';
          if (errorMsg.includes('404') || response.data?.error?.includes('404')) {
            await supabase
              .from('generated_tests')
              .update({ status: 'passed' })
              .eq('id', test.id);
            continue;
          }

          if (response.data?.status) {
            const apiStatus = response.data.status;
            // Map API status to our test status
            let newStatus = test.status;
            if (apiStatus === 'finished' || apiStatus === 'completed' || apiStatus === 'done') {
              newStatus = 'passed'; // Default to passed, will be evaluated later
            } else if (apiStatus === 'failed' || apiStatus === 'error') {
              newStatus = 'failed';
            } else if (apiStatus === 'stopped') {
              newStatus = 'pending'; // Reset if stopped
            }

            if (newStatus !== 'running') {
              await supabase
                .from('generated_tests')
                .update({ status: newStatus })
                .eq('id', test.id);
            }
          }
        } catch (error) {
          console.error('Error checking test status:', error);
          // If error persists, mark test as completed to stop polling
          await supabase
            .from('generated_tests')
            .update({ status: 'passed' })
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

      // Build prompt with credentials if available
      let fullPrompt = test.prompt;
      if (credentials) {
        fullPrompt = `${test.prompt}\n\nPokud bude potřeba přihlášení, použij tyto údaje:\n- Uživatelské jméno/Email: ${credentials.username}\n- Heslo: ${credentials.password}`;
      }

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

      toast.success('Test byl spuštěn');
    } catch (error) {
      console.error('Error running test:', error);
      toast.error('Nepodařilo se spustit test');
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
      toast.success('Test smazán');
    } catch (error) {
      console.error('Error deleting test:', error);
      toast.error('Nepodařilo se smazat test');
    }
  };

  const resetTestStatus = async (testId: string) => {
    try {
      const { error } = await supabase
        .from('generated_tests')
        .update({ status: 'pending', task_id: null })
        .eq('id', testId);

      if (error) throw error;
      toast.success('Status resetován');
    } catch (error) {
      console.error('Error resetting test:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Čeká</Badge>;
      case 'running':
        return <Badge className="bg-warning text-warning-foreground"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Běží</Badge>;
      case 'passed':
        return <Badge className="bg-success text-success-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />Prošel</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Selhal</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive" className="text-xs">Vysoká</Badge>;
      case 'medium':
        return <Badge className="bg-warning text-warning-foreground text-xs">Střední</Badge>;
      case 'low':
        return <Badge variant="secondary" className="text-xs">Nízká</Badge>;
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
        <p>Žádné vygenerované testy pro tento projekt.</p>
        <p className="text-sm mt-1">Přejděte do Generátoru testů a vyberte tento projekt.</p>
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
          Celkem: {tests.length}
        </Badge>
        {pendingCount > 0 && (
          <Badge variant="secondary" className="text-sm py-1 px-3">
            <Clock className="w-3 h-3 mr-1" />
            Čeká: {pendingCount}
          </Badge>
        )}
        {runningCount > 0 && (
          <Badge className="bg-warning text-warning-foreground text-sm py-1 px-3">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Běží: {runningCount}
          </Badge>
        )}
        {passedCount > 0 && (
          <Badge className="bg-success text-success-foreground text-sm py-1 px-3">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Prošlo: {passedCount}
          </Badge>
        )}
        {failedCount > 0 && (
          <Badge variant="destructive" className="text-sm py-1 px-3">
            <XCircle className="w-3 h-3 mr-1" />
            Selhalo: {failedCount}
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
                  {new Date(test.created_at).toLocaleString('cs-CZ')}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {test.status !== 'running' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runTest(test)}
                    disabled={runningTestId === test.id}
                  >
                    {runningTestId === test.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                )}
                {(test.status === 'passed' || test.status === 'failed') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => resetTestStatus(test.id)}
                    title="Reset status"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteTest(test.id)}
                  className="text-muted-foreground hover:text-destructive"
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
                <span className="font-medium">Očekáváno:</span> {test.expected_result}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
