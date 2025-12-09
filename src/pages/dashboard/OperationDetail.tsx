import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  FileText,
  Monitor,
  ExternalLink,
  Download,
} from 'lucide-react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import type { Json } from '@/integrations/supabase/types';

interface Step {
  step?: number;
  next_goal?: string;
  evaluation_previous_goal?: string;
  url?: string;
  action?: string;
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

  // Auto-refresh for running operations - immediately and every 5 seconds
  useEffect(() => {
    if (operation?.status === 'running' && operation?.browser_use_task_id) {
      refreshStatus();
      const interval = setInterval(() => {
        refreshStatus();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [operation?.status, operation?.browser_use_task_id]);

  const fetchOperation = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', operationId)
      .eq('user_id', user!.id)
      .maybeSingle();

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

  const refreshStatus = async (showToast = false) => {
    if (!operation?.browser_use_task_id) return;
    setRefreshing(true);

    try {
      // Get task details from Browser-Use
      const { data: detailsData, error: detailsError } = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'get_task_details',
          taskId: operation.browser_use_task_id,
        },
      });

      if (detailsError) throw detailsError;

      // Get media
      const { data: mediaData } = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'get_all_media',
          taskId: operation.browser_use_task_id,
        },
      });

      // Map Browser-Use status to our status
      const browserStatus = detailsData?.status;
      console.log('Browser-Use API response:', { 
        status: browserStatus, 
        hasOutput: !!detailsData?.output,
        finishedAt: detailsData?.finished_at 
      });
      
      let newStatus: string;
      if (browserStatus === 'finished') {
        newStatus = 'completed';
      } else if (browserStatus === 'failed') {
        newStatus = 'failed';
      } else if (browserStatus === 'stopped') {
        // Stopped může znamenat dokončeno NEBO manuálně zrušeno
        // Pokud máme output nebo finished_at, považujeme za dokončeno
        if (detailsData?.output || detailsData?.finished_at) {
          newStatus = 'completed';
        } else {
          newStatus = 'cancelled';
        }
      } else if (browserStatus === 'running') {
        newStatus = 'running';
      } else {
        newStatus = operation.status;
      }

      // Update database with new status and media
      const updateData: Record<string, unknown> = {
        status: newStatus,
        steps: detailsData?.steps || operation.steps,
        live_url: detailsData?.live_url || operation.live_url,
      };

      if (detailsData?.output) {
        updateData.result = detailsData.output;
      }

      if (mediaData?.screenshots?.length) {
        updateData.screenshots = mediaData.screenshots;
      }

      if (mediaData?.recordings?.length) {
        updateData.recordings = mediaData.recordings;
      }

      if (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'cancelled') {
        updateData.completed_at = new Date().toISOString();
      }

      await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', operation.id)
        .eq('user_id', user!.id);

      await fetchOperation();
      
      if (showToast) {
        toast.success('Status aktualizován');
      }
    } catch (error: unknown) {
      console.error('Error refreshing status:', error);
      if (showToast) {
        toast.error('Nepodařilo se aktualizovat status');
      }
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      toast.error('Nepodařilo se odeslat pokyn');
    } finally {
      setSendingPrompt(false);
    }
  };

  const stopAndDownloadMedia = async () => {
    if (!operation?.browser_use_task_id) return;
    setActionLoading('stop_download');

    try {
      // Stop the task first if running
      if (operation.status === 'running') {
        toast.info('Ukončuji browser session...');
        const stopResponse = await supabase.functions.invoke('browser-use', {
          body: {
            action: 'stop_task',
            taskId: operation.browser_use_task_id,
          },
        });

        if (stopResponse.error) {
          console.error('Stop task error:', stopResponse.error);
        }

        // Wait longer for video processing (5 seconds)
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      toast.info('Stahuji média...');

      // Retry mechanism for fetching recordings
      let screenshots: string[] = [];
      let recordings: string[] = [];
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        const mediaResponse = await supabase.functions.invoke('browser-use', {
          body: {
            action: 'get_all_media',
            taskId: operation.browser_use_task_id,
          },
        });

        const mediaData = mediaResponse.data;
        console.log(`Media fetch attempt ${attempts + 1}:`, mediaData);

        screenshots = mediaData?.screenshots || [];
        recordings = mediaData?.recordings || [];

        // If we have recordings, stop retrying
        if (recordings.length > 0) {
          break;
        }

        attempts++;
        if (attempts < maxAttempts) {
          toast.info(`Video se zpracovává, zkouším znovu (${attempts}/${maxAttempts})...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      // Update task in database
      await supabase
        .from('tasks')
        .update({
          status: 'completed' as const,
          screenshots: screenshots.length > 0 ? screenshots : operation.screenshots,
          recordings: recordings.length > 0 ? recordings : operation.recordings,
          completed_at: new Date().toISOString(),
        })
        .eq('id', operation.id)
        .eq('user_id', user!.id);

      const totalMedia = screenshots.length + recordings.length;
      if (totalMedia > 0) {
        toast.success(`Staženo ${screenshots.length} screenshotů a ${recordings.length} videí`);
      } else {
        toast.warning('Žádná média nebyla nalezena');
      }

      await fetchOperation();
    } catch (error) {
      console.error('Error stopping and downloading:', error);
      toast.error('Nepodařilo se stáhnout média');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-success text-success-foreground">
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
          <Badge className="bg-warning text-warning-foreground">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
  const screenshotCount = operation.screenshots?.length || 0;
  const recordingCount = operation.recordings?.length || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate('/dashboard/operations/history')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{operation.title}</h1>
            {getStatusBadge(operation.status)}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Vytvořeno: {format(new Date(operation.created_at), 'PPp', { locale: cs })}
          </p>
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
          <Button variant="outline" size="sm" onClick={() => refreshStatus(true)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Obnovit
          </Button>
          
          {isRunning && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleAction('pause_task')} disabled={!!actionLoading}>
                {actionLoading === 'pause_task' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4 mr-1" />}
                Pozastavit
              </Button>
              <Button 
                variant="default" 
                size="sm"
                onClick={stopAndDownloadMedia} 
                disabled={!!actionLoading}
                className="bg-primary"
              >
                {actionLoading === 'stop_download' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
                Ukončit a stáhnout
              </Button>
            </>
          )}
          
          {!isRunning && operation.status !== 'completed' && operation.browser_use_task_id && (
            <Button variant="outline" size="sm" onClick={stopAndDownloadMedia} disabled={!!actionLoading}>
              <Download className="h-4 w-4 mr-1" />
              Stáhnout média
            </Button>
          )}
        </div>
      </div>

      {/* Live Browser View with Human-in-the-Loop */}
      {isRunning && operation.live_url && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Živý náhled prohlížeče</CardTitle>
              <Badge className="bg-success text-success-foreground animate-pulse">LIVE</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={operation.live_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Otevřít v novém okně
                </a>
              </Button>
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
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border bg-muted">
              <iframe
                src={operation.live_url}
                className="absolute inset-0 w-full h-full"
                title="Live Browser View"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            
            {/* Human-in-the-Loop Input */}
            <div className="flex gap-2">
              <Input
                value={followUpPrompt}
                onChange={(e) => setFollowUpPrompt(e.target.value)}
                placeholder="Zadejte další pokyn pro agenta..."
                onKeyDown={(e) => e.key === 'Enter' && !sendingPrompt && sendFollowUp()}
                disabled={sendingPrompt}
                className="flex-1"
              />
              <Button onClick={sendFollowUp} disabled={sendingPrompt || !followUpPrompt.trim()}>
                {sendingPrompt ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Pokračovat
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Přehled</TabsTrigger>
          <TabsTrigger value="steps">Kroky</TabsTrigger>
          <TabsTrigger value="screenshots">
            Screenshoty {screenshotCount > 0 && <Badge variant="secondary" className="ml-2">{screenshotCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="recordings">
            Videa {recordingCount > 0 && <Badge variant="secondary" className="ml-2">{recordingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="result">Výsledek</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Zadání</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{operation.prompt}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Informace</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  {getStatusBadge(operation.status)}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Browser-Use ID</span>
                  <span className="font-mono text-sm">{operation.browser_use_task_id || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Spuštěno</span>
                  <span>{operation.started_at ? format(new Date(operation.started_at), 'PPp', { locale: cs }) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dokončeno</span>
                  <span>{operation.completed_at ? format(new Date(operation.completed_at), 'PPp', { locale: cs }) : '-'}</span>
                </div>
              </CardContent>
            </Card>

            {operation.error_message && (
              <Card className="md:col-span-2 border-destructive">
                <CardHeader>
                  <CardTitle className="text-lg text-destructive">Chyba</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-destructive font-mono text-sm">{operation.error_message}</p>
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
              {steps.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">Zatím žádné kroky</p>
              ) : (
                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <div key={index} className="p-3 rounded-lg bg-muted/50 border">
                      <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                          {step.step || index + 1}
                        </span>
                        <div className="flex-1 space-y-1">
                          {step.next_goal && (
                            <p className="text-sm font-medium">{step.next_goal}</p>
                          )}
                          {step.action && (
                            <p className="text-sm font-medium">{step.action}</p>
                          )}
                          {step.evaluation_previous_goal && (
                            <p className="text-xs text-muted-foreground">{step.evaluation_previous_goal}</p>
                          )}
                          {step.result && (
                            <p className="text-xs text-muted-foreground">{step.result}</p>
                          )}
                          {step.url && (
                            <p className="text-xs text-primary/70 font-mono truncate">{step.url}</p>
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

        <TabsContent value="screenshots">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Screenshoty ({screenshotCount})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!operation.screenshots?.length ? (
                <p className="text-muted-foreground text-center py-4">Žádné screenshoty</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {operation.screenshots.map((url, index) => (
                    <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="group">
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

        <TabsContent value="recordings">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Video className="h-5 w-5" />
                Nahrávky ({recordingCount})
              </CardTitle>
            </CardHeader>
            <CardContent>
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

        <TabsContent value="result">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Výsledek operace</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Původní prompt</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded-lg">{operation.prompt}</p>
              </div>
              {operation.error_message && (
                <div>
                  <h4 className="text-sm font-medium mb-2 text-destructive">Chybová zpráva</h4>
                  <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">{operation.error_message}</p>
                </div>
              )}
              {operation.result && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Výstup</h4>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-60">
                    {JSON.stringify(operation.result, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
