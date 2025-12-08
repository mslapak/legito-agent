import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Play,
  Pause,
  Square,
  Image as ImageIcon,
  FileText,
  RefreshCw,
} from 'lucide-react';

interface Task {
  id: string;
  title: string;
  prompt: string;
  status: string;
  browser_use_task_id: string | null;
  result: unknown;
  error_message: string | null;
  screenshots: string[] | null;
  steps: unknown;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export default function TaskDetail() {
  const { taskId } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (taskId) {
      fetchTask();
      subscribeToTask();
    }
  }, [taskId]);

  const fetchTask = async () => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .maybeSingle();

      if (error) throw error;
      setTask(data);
    } catch (error) {
      console.error('Error fetching task:', error);
      toast.error('Nepodařilo se načíst úkol');
    } finally {
      setLoading(false);
    }
  };

  const subscribeToTask = () => {
    const channel = supabase
      .channel(`task-${taskId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `id=eq.${taskId}` },
        () => {
          fetchTask();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const refreshStatus = async () => {
    if (!task?.browser_use_task_id) return;
    
    setActionLoading(true);
    try {
      const response = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'get_task_details',
          taskId: task.browser_use_task_id,
        },
      });

      if (response.error) throw response.error;
      
      // Update local state and database
      const browserUseData = response.data;
      
      const newStatus = browserUseData.status === 'finished' ? 'completed' :
                    browserUseData.status === 'failed' ? 'failed' :
                    browserUseData.status === 'running' ? 'running' : task.status;

      await supabase
        .from('tasks')
        .update({
          status: newStatus as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
          result: browserUseData.output,
          steps: browserUseData.steps,
          completed_at: browserUseData.status === 'finished' || browserUseData.status === 'failed' 
            ? new Date().toISOString() 
            : null,
        })
        .eq('id', task.id);

      toast.success('Stav aktualizován');
      fetchTask();
    } catch (error) {
      console.error('Error refreshing status:', error);
      toast.error('Nepodařilo se aktualizovat stav');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAction = async (action: 'pause_task' | 'resume_task' | 'stop_task') => {
    if (!task?.browser_use_task_id) return;
    
    setActionLoading(true);
    try {
      const response = await supabase.functions.invoke('browser-use', {
        body: {
          action: action,
          taskId: task.browser_use_task_id,
        },
      });

      if (response.error) throw response.error;
      toast.success(action === 'stop_task' ? 'Úkol zastaven' : 
                   action === 'pause_task' ? 'Úkol pozastaven' : 'Úkol obnoven');
      fetchTask();
    } catch (error) {
      console.error(`Error ${action}:`, error);
      toast.error('Akce se nezdařila');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-warning text-warning-foreground"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Běží</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Čeká</Badge>;
      case 'completed':
        return <Badge className="bg-success text-success-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />Dokončeno</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Selhalo</Badge>;
      case 'cancelled':
        return <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" />Zrušeno</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Úkol nebyl nalezen</p>
        <Button variant="link" onClick={() => navigate('/dashboard/history')}>
          Zpět na historii
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate('/dashboard/history')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{task.title}</h1>
            {getStatusBadge(task.status)}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Vytvořeno: {new Date(task.created_at).toLocaleString('cs-CZ')}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refreshStatus} disabled={actionLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${actionLoading ? 'animate-spin' : ''}`} />
            Obnovit
          </Button>
          
          {task.status === 'running' && (
            <>
              <Button variant="outline" onClick={() => handleAction('pause_task')} disabled={actionLoading}>
                <Pause className="h-4 w-4 mr-2" />
                Pozastavit
              </Button>
              <Button variant="destructive" onClick={() => handleAction('stop_task')} disabled={actionLoading}>
                <Square className="h-4 w-4 mr-2" />
                Zastavit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Přehled</TabsTrigger>
          <TabsTrigger value="steps">Kroky</TabsTrigger>
          <TabsTrigger value="screenshots">Screenshoty</TabsTrigger>
          <TabsTrigger value="result">Výsledek</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Zadání</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{task.prompt}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Informace</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  {getStatusBadge(task.status)}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Browser-Use ID</span>
                  <span className="font-mono text-sm">{task.browser_use_task_id || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Spuštěno</span>
                  <span>{task.started_at ? new Date(task.started_at).toLocaleString('cs-CZ') : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dokončeno</span>
                  <span>{task.completed_at ? new Date(task.completed_at).toLocaleString('cs-CZ') : '-'}</span>
                </div>
              </CardContent>
            </Card>

            {task.error_message && (
              <Card className="md:col-span-2 border-destructive">
                <CardHeader>
                  <CardTitle className="text-lg text-destructive">Chyba</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-destructive font-mono text-sm">{task.error_message}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="steps">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Kroky agenta
              </CardTitle>
              <CardDescription>
                Detailní přehled akcí provedených agentem
              </CardDescription>
            </CardHeader>
            <CardContent>
              {task.steps && task.steps.length > 0 ? (
                <div className="space-y-4">
                  {task.steps.map((step: any, index: number) => (
                    <div key={index} className="flex gap-4 p-4 rounded-lg border border-border">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{step.action || step.type || 'Krok'}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {step.description || step.details || JSON.stringify(step)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Zatím žádné kroky</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="screenshots">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Screenshoty
              </CardTitle>
            </CardHeader>
            <CardContent>
              {task.screenshots && task.screenshots.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {task.screenshots.map((url, index) => (
                    <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={url}
                        alt={`Screenshot ${index + 1}`}
                        className="rounded-lg border border-border hover:border-primary/50 transition-colors"
                      />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Žádné screenshoty</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="result">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Výsledek</CardTitle>
            </CardHeader>
            <CardContent>
              {task.result ? (
                <pre className="p-4 rounded-lg bg-muted overflow-x-auto text-sm font-mono">
                  {JSON.stringify(task.result, null, 2)}
                </pre>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Zatím žádný výsledek</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
