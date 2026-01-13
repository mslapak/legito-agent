import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Loader2, ArrowLeft, Copy, RefreshCw, Send, Pause, Play, Square,
  CheckCircle, XCircle, Clock, Ban, Image as ImageIcon, Video, FileText,
  Monitor, ExternalLink, Download,
} from 'lucide-react';
import { format } from 'date-fns';
import { cs, enUS } from 'date-fns/locale';
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
  const { t, i18n } = useTranslation();
  const { operationId } = useParams<{ operationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [operation, setOperation] = useState<Operation | null>(null);
  const [loading, setLoading] = useState(true);
  const [followUpPrompt, setFollowUpPrompt] = useState('');
  const [sendingPrompt, setSendingPrompt] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [liveViewError, setLiveViewError] = useState(false);

  const dateLocale = i18n.language === 'cs' ? cs : enUS;

  useEffect(() => {
    if (operationId && user) {
      fetchOperation();
      const channel = supabase.channel(`operation-${operationId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `id=eq.${operationId}` }, () => fetchOperation())
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [operationId, user]);

  useEffect(() => {
    if (operation?.status === 'running' && operation?.browser_use_task_id) {
      refreshStatus();
      const interval = setInterval(() => refreshStatus(), 5000);
      return () => clearInterval(interval);
    }
  }, [operation?.status, operation?.browser_use_task_id]);

  const fetchOperation = async () => {
    const { data, error } = await supabase.from('tasks').select('*').eq('id', operationId).eq('user_id', user!.id).maybeSingle();
    if (error) { toast.error(t('operations.loadFailed')); console.error(error); }
    else { setOperation(data as Operation); }
    setLoading(false);
  };

  const refreshStatus = async (showToast = false) => {
    if (!operation?.browser_use_task_id) return;
    setRefreshing(true);
    try {
      const { data: detailsData, error: detailsError } = await supabase.functions.invoke('browser-use', { body: { action: 'get_task_details', taskId: operation.browser_use_task_id } });
      if (detailsError) throw detailsError;
      const { data: mediaData } = await supabase.functions.invoke('browser-use', { body: { action: 'get_all_media', taskId: operation.browser_use_task_id } });

      const browserStatus = detailsData?.status;
      let newStatus: string;
      if (browserStatus === 'finished') newStatus = 'completed';
      else if (browserStatus === 'failed') newStatus = 'failed';
      else if (browserStatus === 'stopped') newStatus = detailsData?.output || detailsData?.finished_at ? 'completed' : 'cancelled';
      else if (['running', 'started', 'created'].includes(browserStatus)) newStatus = 'running';
      else newStatus = operation.status;

      const updateData: Record<string, unknown> = { status: newStatus, steps: detailsData?.steps || operation.steps, live_url: detailsData?.live_url || operation.live_url };
      if (detailsData?.output) updateData.result = detailsData.output;
      if (mediaData?.screenshots?.length) updateData.screenshots = mediaData.screenshots;
      if (mediaData?.recordings?.length) updateData.recordings = mediaData.recordings;
      if (['completed', 'failed', 'cancelled'].includes(newStatus)) updateData.completed_at = new Date().toISOString();

      await supabase.from('tasks').update(updateData).eq('id', operation.id).eq('user_id', user!.id);
      await fetchOperation();
      if (showToast) toast.success(t('operations.statusUpdated'));
    } catch (error) {
      console.error('Error refreshing status:', error);
      if (showToast) toast.error(t('operations.updateFailed'));
    } finally { setRefreshing(false); }
  };

  const handleAction = async (action: 'pause_task' | 'resume_task' | 'stop_task') => {
    if (!operation?.browser_use_task_id) return;
    setActionLoading(action);
    try {
      const { error } = await supabase.functions.invoke('browser-use', { body: { action, taskId: operation.browser_use_task_id } });
      if (error) throw error;
      toast.success(action === 'pause_task' ? t('operations.paused') : action === 'resume_task' ? t('operations.resumed') : t('operations.stopped'));
      await fetchOperation();
    } catch { toast.error(t('operations.actionFailed')); }
    finally { setActionLoading(null); }
  };

  const sendFollowUp = async () => {
    if (!followUpPrompt.trim() || !operation?.browser_use_task_id) return;
    setSendingPrompt(true);
    try {
      const { error } = await supabase.functions.invoke('browser-use', { body: { action: 'continue_task', taskId: operation.browser_use_task_id, followUpPrompt: followUpPrompt.trim() } });
      if (error) throw error;
      toast.success(t('operations.instructionSent'));
      setFollowUpPrompt('');
      await fetchOperation();
    } catch { toast.error(t('operations.instructionFailed')); }
    finally { setSendingPrompt(false); }
  };

  const stopAndDownloadMedia = async () => {
    if (!operation?.browser_use_task_id) return;
    setActionLoading('stop_download');
    try {
      toast.info(t('operations.downloadingMedia'));
      const stopResponse = await supabase.functions.invoke('browser-use', { body: { action: 'stop_task', taskId: operation.browser_use_task_id } });
      if (stopResponse.error) throw stopResponse.error;
      const { screenshots = [], recordings = [] } = stopResponse.data || {};
      if (screenshots.length + recordings.length > 0) toast.success(t('operations.downloadedMedia', { screenshots: screenshots.length, videos: recordings.length }));
      else toast.warning(t('operations.noMediaFound'));
      await fetchOperation();
    } catch { toast.error(t('operations.downloadFailed')); }
    finally { setActionLoading(null); }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge className="bg-success text-success-foreground"><CheckCircle className="w-3 h-3 mr-1" />{t('status.completed')}</Badge>;
      case 'failed': return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />{t('operations.error')}</Badge>;
      case 'running': return <Badge className="bg-warning text-warning-foreground"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{t('status.running')}</Badge>;
      case 'cancelled': return <Badge variant="secondary"><Ban className="w-3 h-3 mr-1" />{t('status.cancelled')}</Badge>;
      default: return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />{t('status.pending')}</Badge>;
    }
  };

  const parseSteps = (steps: Json | null): Step[] => (!steps || !Array.isArray(steps)) ? [] : steps as unknown as Step[];

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!operation) return <div className="text-center py-12"><p className="text-muted-foreground">{t('operations.operationNotFound')}</p><Button variant="link" onClick={() => navigate('/dashboard/operations/history')}>{t('operations.backToHistory')}</Button></div>;

  const isRunning = operation.status === 'running';
  const steps = parseSteps(operation.steps);
  const screenshotCount = operation.screenshots?.length || 0;
  const recordingCount = operation.recordings?.length || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate('/dashboard/operations/history')}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3"><h1 className="text-2xl font-bold">{operation.title}</h1>{getStatusBadge(operation.status)}</div>
          <p className="text-sm text-muted-foreground mt-1">{t('operations.created')}: {format(new Date(operation.created_at), 'PPp', { locale: dateLocale })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/dashboard/operations/new?duplicate_from=${operation.id}`)}><Copy className="h-4 w-4 mr-1" />{t('operations.duplicate')}</Button>
          <Button variant="outline" size="sm" onClick={() => refreshStatus(true)} disabled={refreshing}><RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />{t('operations.refresh')}</Button>
          {isRunning && (<><Button variant="outline" size="sm" onClick={() => handleAction('pause_task')} disabled={!!actionLoading}>{actionLoading === 'pause_task' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4 mr-1" />}{t('operations.pause')}</Button><Button variant="default" size="sm" onClick={stopAndDownloadMedia} disabled={!!actionLoading} className="bg-primary">{actionLoading === 'stop_download' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}{t('operations.stopAndDownload')}</Button></>)}
          {!isRunning && operation.status !== 'completed' && operation.browser_use_task_id && (<Button variant="outline" size="sm" onClick={stopAndDownloadMedia} disabled={!!actionLoading}><Download className="h-4 w-4 mr-1" />{t('operations.downloadMedia')}</Button>)}
        </div>
      </div>

      {isRunning && operation.live_url && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2"><Monitor className="h-5 w-5 text-primary" /><CardTitle className="text-lg">{t('operations.liveView')}</CardTitle><Badge className="bg-success text-success-foreground animate-pulse">LIVE</Badge></div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild><a href={operation.live_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-2" />{t('operations.openNewWindow')}</a></Button>
              <Button variant="outline" size="sm" onClick={() => handleAction('pause_task')} disabled={!!actionLoading}>{actionLoading === 'pause_task' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}</Button>
              <Button variant="outline" size="sm" onClick={() => handleAction('resume_task')} disabled={!!actionLoading}>{actionLoading === 'resume_task' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}</Button>
              <Button variant="destructive" size="sm" onClick={() => handleAction('stop_task')} disabled={!!actionLoading}>{actionLoading === 'stop_task' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border bg-muted">
              {liveViewError ? (<div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground"><Monitor className="h-12 w-12 mb-2 opacity-50" /><p className="text-sm">{t('operations.liveViewUnavailable')}</p><p className="text-xs mt-1">{t('operations.tryNewWindow')}</p></div>) : (<iframe src={operation.live_url} className="absolute inset-0 w-full h-full" title="Live Browser View" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen onError={() => setLiveViewError(true)} />)}
            </div>
            <div className="flex gap-2">
              <Input value={followUpPrompt} onChange={(e) => setFollowUpPrompt(e.target.value)} placeholder={t('operations.followUpPlaceholder')} onKeyDown={(e) => e.key === 'Enter' && !sendingPrompt && sendFollowUp()} disabled={sendingPrompt} className="flex-1" />
              <Button onClick={sendFollowUp} disabled={sendingPrompt || !followUpPrompt.trim()}>{sendingPrompt ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-2" />{t('operations.continue')}</>}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{t('operations.overview')}</TabsTrigger>
          <TabsTrigger value="steps">{t('taskDetail.steps')}</TabsTrigger>
          <TabsTrigger value="screenshots">{t('operations.screenshots')} {screenshotCount > 0 && <Badge variant="secondary" className="ml-2">{screenshotCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="recordings">{t('operations.videos')} {recordingCount > 0 && <Badge variant="secondary" className="ml-2">{recordingCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="result">{t('operations.result')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-lg">{t('operations.assignment')}</CardTitle></CardHeader><CardContent><p className="text-muted-foreground whitespace-pre-wrap">{operation.prompt}</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-lg">{t('operations.information')}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex justify-between"><span className="text-muted-foreground">{t('tests.status')}</span>{getStatusBadge(operation.status)}</div><div className="flex justify-between"><span className="text-muted-foreground">{t('operations.browserUseId')}</span><span className="font-mono text-sm">{operation.browser_use_task_id || '-'}</span></div><div className="flex justify-between"><span className="text-muted-foreground">{t('operations.started')}</span><span>{operation.started_at ? format(new Date(operation.started_at), 'PPp', { locale: dateLocale }) : '-'}</span></div><div className="flex justify-between"><span className="text-muted-foreground">{t('operations.finishedAt')}</span><span>{operation.completed_at ? format(new Date(operation.completed_at), 'PPp', { locale: dateLocale }) : '-'}</span></div></CardContent></Card>
            {operation.error_message && (<Card className="md:col-span-2 border-destructive"><CardHeader><CardTitle className="text-lg text-destructive">{t('operations.error')}</CardTitle></CardHeader><CardContent><p className="text-destructive font-mono text-sm">{operation.error_message}</p></CardContent></Card>)}
          </div>
        </TabsContent>

        <TabsContent value="steps">
          <Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileText className="h-5 w-5" />{t('operations.agentSteps')}</CardTitle><CardDescription>{t('operations.agentStepsDescription')}</CardDescription></CardHeader><CardContent>{steps.length === 0 ? <p className="text-muted-foreground text-center py-4">{t('operations.noStepsYet')}</p> : <div className="space-y-3">{steps.map((step, index) => (<div key={index} className="p-3 rounded-lg bg-muted/50 border"><div className="flex items-start gap-3"><span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">{step.step || index + 1}</span><div className="flex-1 space-y-1">{step.next_goal && <p className="text-sm font-medium">{step.next_goal}</p>}{step.action && <p className="text-sm font-medium">{step.action}</p>}{step.evaluation_previous_goal && <p className="text-xs text-muted-foreground">{step.evaluation_previous_goal}</p>}{step.result && <p className="text-xs text-muted-foreground">{step.result}</p>}{step.url && <p className="text-xs text-primary/70 font-mono truncate">{step.url}</p>}</div></div></div>))}</div>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="screenshots">
          <Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><ImageIcon className="h-5 w-5" />{t('operations.screenshots')} ({screenshotCount})</CardTitle></CardHeader><CardContent>{!operation.screenshots?.length ? <p className="text-muted-foreground text-center py-4">{t('operations.noScreenshots')}</p> : <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{operation.screenshots.map((url, index) => (<a key={index} href={url} target="_blank" rel="noopener noreferrer" className="group"><img src={url} alt={`Screenshot ${index + 1}`} className="rounded-lg border hover:border-primary transition-colors" /></a>))}</div>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="recordings">
          <Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><Video className="h-5 w-5" />{t('operations.recordings')} ({recordingCount})</CardTitle></CardHeader><CardContent>{!operation.recordings?.length ? <p className="text-muted-foreground text-center py-4">{t('operations.noRecordings')}</p> : <div className="space-y-4">{operation.recordings.map((url, index) => (<video key={index} src={url} controls className="w-full rounded-lg" />))}</div>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="result">
          <Card><CardHeader><CardTitle className="text-lg">{t('operations.operationResult')}</CardTitle></CardHeader><CardContent className="space-y-4"><div><h4 className="text-sm font-medium mb-2">{t('operations.originalPrompt')}</h4><p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded-lg">{operation.prompt}</p></div>{operation.error_message && <div><h4 className="text-sm font-medium mb-2 text-destructive">{t('operations.errorMessage')}</h4><p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">{operation.error_message}</p></div>}{operation.result && <div><h4 className="text-sm font-medium mb-2">{t('operations.output')}</h4><pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-60">{JSON.stringify(operation.result, null, 2)}</pre></div>}</CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
