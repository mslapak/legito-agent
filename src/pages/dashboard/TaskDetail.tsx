import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import StructuredResult from '@/components/StructuredResult';
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
  Monitor,
  ExternalLink,
  Video,
  Send,
  Download,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Task {
  id: string;
  title: string;
  prompt: string;
  status: string;
  browser_use_task_id: string | null;
  result: unknown;
  error_message: string | null;
  screenshots: string[] | null;
  recordings: string[] | null;
  steps: unknown;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  live_url: string | null;
}

export default function TaskDetail() {
  const { t, i18n } = useTranslation();
  const { taskId } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [followUpPrompt, setFollowUpPrompt] = useState('');
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const [liveViewError, setLiveViewError] = useState(false);

  const dateLocale = i18n.language === 'cs' ? 'cs-CZ' : 'en-US';

  useEffect(() => {
    if (taskId) {
      fetchTask();
      const unsubscribe = subscribeToTask();
      return unsubscribe;
    }
  }, [taskId]);

  // Auto-refresh for running tasks - immediately and every 5 seconds
  useEffect(() => {
    if (task?.status === 'running' && task?.browser_use_task_id) {
      // Immediate refresh to get live_url
      refreshStatus();
      const interval = setInterval(() => {
        refreshStatus();
      }, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [task?.status, task?.browser_use_task_id]);

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
      toast.error(t('toast.loadFailed'));
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
      // First get task details
      const detailsResponse = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'get_task_details',
          taskId: task.browser_use_task_id,
        },
      });

      if (detailsResponse.error) throw detailsResponse.error;
      
      const browserUseData = detailsResponse.data;
      
      // Get all media (screenshots + recordings)
      const mediaResponse = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'get_all_media',
          taskId: task.browser_use_task_id,
        },
      });
      
      const mediaData = mediaResponse.data;
      console.log('Media data:', mediaData);
      
      const screenshots = mediaData?.screenshots || [];
      const recordings = mediaData?.recordings || [];
      
      console.log('Browser-Use API response:', { 
        status: browserUseData.status, 
        hasOutput: !!browserUseData.output,
        finishedAt: browserUseData.finished_at || browserUseData.finishedAt,
        sessionId: browserUseData.sessionId,
        liveUrl: browserUseData.live_url
      });
      
      let newStatus: string;
      if (browserUseData.status === 'finished') {
        newStatus = 'completed';
      } else if (browserUseData.status === 'failed') {
        newStatus = 'failed';
      } else if (browserUseData.status === 'stopped') {
        // Stopped může znamenat dokončeno NEBO manuálně zrušeno
        if (browserUseData.output || browserUseData.finished_at || browserUseData.finishedAt) {
          newStatus = 'completed';
        } else {
          newStatus = 'cancelled';
        }
      } else if (browserUseData.status === 'running' || browserUseData.status === 'started' || browserUseData.status === 'created') {
        // V2 API: 'started' a 'created' jsou také running stavy
        newStatus = 'running';
      } else {
        newStatus = task.status;
      }

      // Update task with all data including live_url
      await supabase
        .from('tasks')
        .update({
          status: newStatus as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
          result: browserUseData.output,
          steps: browserUseData.steps,
          screenshots: screenshots.length > 0 ? screenshots : task.screenshots,
          recordings: recordings.length > 0 ? recordings : task.recordings,
          live_url: browserUseData.live_url || task.live_url,
          completed_at: browserUseData.status === 'finished' || browserUseData.status === 'failed' 
            ? new Date().toISOString() 
            : null,
        })
        .eq('id', task.id);

      toast.success(t('taskDetail.statusUpdated'));
      fetchTask();
    } catch (error) {
      console.error('Error refreshing status:', error);
      toast.error(t('taskDetail.updateFailed'));
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
      toast.success(action === 'stop_task' ? t('taskDetail.taskStopped') : 
                   action === 'pause_task' ? t('taskDetail.taskPaused') : t('taskDetail.taskResumed'));
      fetchTask();
    } catch (error) {
      console.error(`Error ${action}:`, error);
      toast.error(t('taskDetail.actionFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const sendFollowUpPrompt = async () => {
    if (!task?.browser_use_task_id || !followUpPrompt.trim()) return;
    
    setSendingFollowUp(true);
    try {
      const response = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'continue_task',
          taskId: task.browser_use_task_id,
          followUpPrompt: followUpPrompt.trim(),
        },
      });

      if (response.error) throw response.error;
      
      toast.success(t('taskDetail.instructionSent'));
      setFollowUpPrompt('');
      
      // Refresh task status
      setTimeout(() => refreshStatus(), 1000);
    } catch (error) {
      console.error('Error sending follow-up:', error);
      toast.error(t('taskDetail.instructionFailed'));
    } finally {
      setSendingFollowUp(false);
    }
  };

  const stopAndDownloadMedia = async () => {
    if (!task?.browser_use_task_id) return;
    
    setActionLoading(true);
    try {
      toast.info(t('taskDetail.downloadingMedia'));
      
      // Use the improved stop_task which handles media sync with retries
      const stopResponse = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'stop_task',
          taskId: task.browser_use_task_id,
        },
      });
      
      if (stopResponse.error) {
        console.error('Stop task error:', stopResponse.error);
        throw stopResponse.error;
      }
      
      const { screenshots = [], recordings = [] } = stopResponse.data || {};
      console.log('Stop response media:', { screenshots, recordings });
      
      const totalMedia = screenshots.length + recordings.length;
      if (totalMedia > 0) {
        toast.success(t('taskDetail.downloadedMedia', { screenshots: screenshots.length, videos: recordings.length }));
      } else {
        toast.warning(t('taskDetail.noMediaFound'));
      }
      
      fetchTask();
    } catch (error) {
      console.error('Error stopping and downloading:', error);
      toast.error(t('taskDetail.downloadFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-warning text-warning-foreground"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{t('status.running')}</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />{t('status.pending')}</Badge>;
      case 'completed':
        return <Badge className="bg-success text-success-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />{t('status.completed')}</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />{t('status.failed')}</Badge>;
      case 'cancelled':
        return <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" />{t('status.cancelled')}</Badge>;
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
        <p className="text-muted-foreground">{t('taskDetail.taskNotFound')}</p>
        <Button variant="link" onClick={() => navigate('/dashboard/history')}>
          {t('taskDetail.backToHistory')}
        </Button>
      </div>
    );
  }

  const screenshotCount = task.screenshots?.length || 0;
  const recordingCount = task.recordings?.length || 0;

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
            {t('taskHistory.created')}: {new Date(task.created_at).toLocaleString(dateLocale)}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refreshStatus} disabled={actionLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${actionLoading ? 'animate-spin' : ''}`} />
            {t('taskDetail.refresh')}
          </Button>
          
          {task.status === 'running' && (
            <>
              <Button variant="outline" onClick={() => handleAction('pause_task')} disabled={actionLoading}>
                <Pause className="h-4 w-4 mr-2" />
                {t('taskDetail.pause')}
              </Button>
              <Button 
                variant="default" 
                onClick={stopAndDownloadMedia} 
                disabled={actionLoading}
                className="bg-primary"
              >
                <Download className="h-4 w-4 mr-2" />
                {t('taskDetail.stopAndDownload')}
              </Button>
            </>
          )}
          
          {task.status !== 'running' && task.status !== 'completed' && task.browser_use_task_id && (
            <Button variant="outline" onClick={stopAndDownloadMedia} disabled={actionLoading}>
              <Download className="h-4 w-4 mr-2" />
              {t('taskDetail.downloadMedia')}
            </Button>
          )}
        </div>
      </div>

      {/* Live Browser View with Human-in-the-Loop - only show for running tasks */}
      {task.live_url && task.status === 'running' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">{t('taskDetail.liveView')}</CardTitle>
              <Badge className="bg-success text-success-foreground animate-pulse">LIVE</Badge>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={task.live_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                {t('taskDetail.openNewWindow')}
              </a>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border bg-muted">
              {liveViewError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                  <Monitor className="h-12 w-12 mb-2 opacity-50" />
                  <p className="text-sm">{t('taskDetail.liveViewUnavailable')}</p>
                  <p className="text-xs mt-1">{t('taskDetail.tryNewWindow')}</p>
                </div>
              ) : (
                <iframe
                  src={task.live_url}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  onError={() => setLiveViewError(true)}
                />
              )}
            </div>
            
            {/* Human-in-the-Loop Input */}
            <div className="flex gap-2">
              <Input
                placeholder={t('taskDetail.followUpPlaceholder')}
                value={followUpPrompt}
                onChange={(e) => setFollowUpPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !sendingFollowUp && sendFollowUpPrompt()}
                disabled={sendingFollowUp}
                className="flex-1"
              />
              <Button 
                onClick={sendFollowUpPrompt} 
                disabled={sendingFollowUp || !followUpPrompt.trim()}
              >
                {sendingFollowUp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    {t('taskDetail.continue')}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{t('taskDetail.overview')}</TabsTrigger>
          <TabsTrigger value="steps">{t('taskDetail.steps')}</TabsTrigger>
          <TabsTrigger value="screenshots">
            {t('taskDetail.screenshots')} {screenshotCount > 0 && <Badge variant="secondary" className="ml-2">{screenshotCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="recordings">
            {t('taskDetail.videos')} {recordingCount > 0 && <Badge variant="secondary" className="ml-2">{recordingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="result">{t('taskDetail.result')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('taskDetail.assignment')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{task.prompt}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('taskDetail.information')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('tests.status')}</span>
                  {getStatusBadge(task.status)}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('taskDetail.browserUseId')}</span>
                  <span className="font-mono text-sm">{task.browser_use_task_id || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('taskDetail.started')}</span>
                  <span>{task.started_at ? new Date(task.started_at).toLocaleString(dateLocale) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('taskDetail.finishedAt')}</span>
                  <span>{task.completed_at ? new Date(task.completed_at).toLocaleString(dateLocale) : '-'}</span>
                </div>
              </CardContent>
            </Card>

            {task.error_message && (
              <Card className="md:col-span-2 border-destructive">
                <CardHeader>
                  <CardTitle className="text-lg text-destructive">{t('taskDetail.error')}</CardTitle>
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
                {t('taskDetail.stepsPerformed')}
              </CardTitle>
              <CardDescription>
                {t('taskDetail.stepsPerformed')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {Array.isArray(task.steps) && task.steps.length > 0 ? (
                <div className="space-y-4">
                  {(task.steps as Array<{ 
                    step?: number; 
                    url?: string; 
                    next_goal?: string; 
                    evaluation_previous_goal?: string;
                    action?: string; 
                    type?: string; 
                    description?: string; 
                    details?: string 
                  }>).map((step, index) => (
                    <div key={index} className="flex gap-4 p-4 rounded-lg border border-border">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                        {step.step ?? index + 1}
                      </div>
                      <div className="flex-1 space-y-2">
                        {step.url && (
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {step.url}
                          </p>
                        )}
                        {step.next_goal && (
                          <div>
                            <span className="text-xs font-semibold text-primary">{t('taskDetail.step')}:</span>
                            <p className="text-sm">{step.next_goal}</p>
                          </div>
                        )}
                        {step.evaluation_previous_goal && (
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground">{t('taskDetail.result')}:</span>
                            <p className="text-sm text-muted-foreground">{step.evaluation_previous_goal}</p>
                          </div>
                        )}
                        {!step.next_goal && !step.evaluation_previous_goal && (
                          <p className="text-sm text-muted-foreground">
                            {step.action || step.type || step.description || step.details || JSON.stringify(step)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('taskDetail.noSteps')}</p>
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
                {t('taskDetail.screenshots')}
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
                  <p>{t('taskDetail.noScreenshots')}</p>
                  <p className="text-sm mt-2">{t('taskDetail.screenshotsAppear')}</p>
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
                {t('taskDetail.videos')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {task.recordings && task.recordings.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {task.recordings.map((url, index) => (
                    <div key={index} className="rounded-lg border border-border overflow-hidden">
                      <video
                        src={url}
                        controls
                        className="w-full"
                        preload="metadata"
                      />
                      <div className="p-2 bg-muted flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Video {index + 1}</span>
                        <Button variant="ghost" size="sm" asChild>
                          <a href={url} target="_blank" rel="noopener noreferrer" download>
                            <Download className="h-4 w-4 mr-2" />
                            {t('common.export')}
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Video className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('taskDetail.noVideos')}</p>
                  <p className="text-sm mt-2">{t('taskDetail.videosAppear')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="result">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('taskDetail.result')}</CardTitle>
            </CardHeader>
            <CardContent>
              <StructuredResult result={task.result} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
