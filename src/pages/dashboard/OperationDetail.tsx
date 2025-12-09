import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Loader2,
  ArrowLeft,
  Copy,
  RefreshCw,
  Send,
  Pause,
  Play,
  Square,
  CheckCircle,
  XCircle,
  Clock,
  Ban,
  Image as ImageIcon,
  Video,
  ListOrdered,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import type { Json } from '@/integrations/supabase/types';

interface Step {
  step: number;
  action: string;
  result?: string;
}

interface Operation {
  id: string;
  title: string;
  prompt: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  started_at: string | null;
  live_url: string | null;
  browser_use_task_id: string | null;
  steps: Json | null;
  result: Json | null;
  screenshots: string[] | null;
  recordings: string[] | null;
  error_message: string | null;
}

export default function OperationDetail() {
  const { operationId } = useParams<{ operationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [operation, setOperation] = useState<Operation | null>(null);
  const [loading, setLoading] = useState(true);
  const [followUpPrompt, setFollowUpPrompt] = useState('');
  const [sendingPrompt, setSendingPrompt] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (operationId && user) {
      fetchOperation();
      const channel = subscribeToOperation();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [operationId, user]);

  const fetchOperation = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', operationId)
      .single();

    if (error) {
      toast.error('Nepodařilo se načíst operaci');
      console.error(error);
    } else {
      setOperation(data as Operation);
    }
    setLoading(false);
  };

  const subscribeToOperation = () => {
    return supabase
      .channel(`operation-${operationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${operationId}`,
        },
        () => {
          fetchOperation();
        }
      )
      .subscribe();
  };

  const refreshStatus = async () => {
    if (!operation?.browser_use_task_id) return;
    setRefreshing(true);

    try {
      const { data, error } = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'get_task_status',
          taskId: operation.browser_use_task_id,
        },
      });

      if (error) throw error;
      await fetchOperation();
      toast.success('Status aktualizován');
    } catch (error: any) {
      toast.error('Nepodařilo se aktualizovat status');
    } finally {
      setRefreshing(false);
    }
  };

  const handleAction = async (action: 'pause_task' | 'resume_task' | 'stop_task') => {
    if (!operation?.browser_use_task_id) return;
    setActionLoading(action);

    try {
      const { error } = await supabase.functions.invoke('browser-use', {
        body: {
          action,
          taskId: operation.browser_use_task_id,
        },
      });

      if (error) throw error;
      toast.success(action === 'pause_task' ? 'Pozastaveno' : action === 'resume_task' ? 'Obnoveno' : 'Zastaveno');
      await fetchOperation();
    } catch (error: any) {
      toast.error('Akce se nezdařila');
    } finally {
      setActionLoading(null);
    }
  };

  const sendFollowUp = async () => {
    if (!followUpPrompt.trim() || !operation?.browser_use_task_id) return;
    setSendingPrompt(true);

    try {
      const { error } = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'continue_task',
          taskId: operation.browser_use_task_id,
          prompt: followUpPrompt,
        },
      });

      if (error) throw error;
      toast.success('Pokyn odeslán');
      setFollowUpPrompt('');
      await fetchOperation();
    } catch (error: any) {
      toast.error('Nepodařilo se odeslat pokyn');
    } finally {
      setSendingPrompt(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
            <CheckCircle className="w-3 h-3 mr-1" />
            Dokončeno
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Chyba
          </Badge>
        );
      case 'running':
        return (
          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">
            <Play className="w-3 h-3 mr-1" />
            Běží
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge variant="secondary">
            <Ban className="w-3 h-3 mr-1" />
            Zrušeno
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Clock className="w-3 h-3 mr-1" />
            Čeká
          </Badge>
        );
    }
  };

  const parseSteps = (steps: Json | null): Step[] => {
    if (!steps || !Array.isArray(steps)) return [];
    return steps as unknown as Step[];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!operation) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Operace nenalezena</p>
        <Button variant="link" onClick={() => navigate('/dashboard/operations/history')}>
          Zpět na historii
        </Button>
      </div>
    );
  }

  const isRunning = operation.status === 'running';
  const steps = parseSteps(operation.steps);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/operations/history')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{operation.title}</h1>
            <p className="text-sm text-muted-foreground">
              {format(new Date(operation.created_at), 'PPp', { locale: cs })}
            </p>
          </div>
          {getStatusBadge(operation.status)}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/dashboard/operations/new?duplicate_from=${operation.id}`)}
          >
            <Copy className="h-4 w-4 mr-1" />
            Duplikovat
          </Button>
          <Button variant="outline" size="sm" onClick={refreshStatus} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Obnovit
          </Button>
        </div>
      </div>

      {/* Live Browser View */}
      {isRunning && operation.live_url && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Live náhled</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAction('pause_task')}
                  disabled={!!actionLoading}
                >
                  {actionLoading === 'pause_task' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Pause className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAction('resume_task')}
                  disabled={!!actionLoading}
                >
                  {actionLoading === 'resume_task' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleAction('stop_task')}
                  disabled={!!actionLoading}
                >
                  {actionLoading === 'stop_task' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="aspect-video bg-muted rounded-lg overflow-hidden">
              <iframe
                src={operation.live_url}
                className="w-full h-full border-0"
                title="Live Browser View"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <Input
                value={followUpPrompt}
                onChange={(e) => setFollowUpPrompt(e.target.value)}
                placeholder="Zadejte další pokyn..."
                onKeyDown={(e) => e.key === 'Enter' && sendFollowUp()}
              />
              <Button onClick={sendFollowUp} disabled={sendingPrompt || !followUpPrompt.trim()}>
                {sendingPrompt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="steps">
        <TabsList>
          <TabsTrigger value="steps">
            <ListOrdered className="h-4 w-4 mr-1" />
            Kroky ({steps.length})
          </TabsTrigger>
          <TabsTrigger value="screenshots">
            <ImageIcon className="h-4 w-4 mr-1" />
            Screenshoty ({operation.screenshots?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="recordings">
            <Video className="h-4 w-4 mr-1" />
            Nahrávky ({operation.recordings?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="result">
            <FileText className="h-4 w-4 mr-1" />
            Výsledek
          </TabsTrigger>
        </TabsList>

        <TabsContent value="steps" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {steps.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">Zatím žádné kroky</p>
              ) : (
                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <div key={index} className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                          {step.step}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm">{step.action}</p>
                          {step.result && (
                            <p className="text-xs text-muted-foreground mt-1">{step.result}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="screenshots" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {!operation.screenshots?.length ? (
                <p className="text-muted-foreground text-center py-4">Žádné screenshoty</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {operation.screenshots.map((url, index) => (
                    <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={url}
                        alt={`Screenshot ${index + 1}`}
                        className="rounded-lg border hover:border-primary transition-colors"
                      />
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recordings" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {!operation.recordings?.length ? (
                <p className="text-muted-foreground text-center py-4">Žádné nahrávky</p>
              ) : (
                <div className="space-y-4">
                  {operation.recordings.map((url, index) => (
                    <video key={index} src={url} controls className="w-full rounded-lg" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="result" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Prompt</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{operation.prompt}</p>
                </div>
                {operation.error_message && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 text-destructive">Chyba</h4>
                    <p className="text-sm text-destructive">{operation.error_message}</p>
                  </div>
                )}
                {operation.result && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Výsledek</h4>
                    <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-60">
                      {JSON.stringify(operation.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
