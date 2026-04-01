import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Video, Square, Loader2, Play, ExternalLink } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  base_url: string | null;
}

interface SessionListItem {
  id: string;
  title: string;
  status: string;
  created_at: string;
  generated_test_ids: string[] | null;
  task_id: string | null;
  browser_use_task_id: string | null;
  task?: {
    status: string;
    completed_at: string | null;
  } | null;
}

export default function RecordSession() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [sessionTitle, setSessionTitle] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  
  // Recording state
  const [recording, setRecording] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [browserUseTaskId, setBrowserUseTaskId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Past sessions
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const getEffectiveSessionStatus = (session: SessionListItem) => {
    if (session.status === 'completed' || session.status === 'failed' || session.status === 'processing') {
      return session.status;
    }

    if (session.task?.status === 'completed' || (session.generated_test_ids?.length ?? 0) > 0) {
      return 'completed';
    }

    if (session.task?.status === 'failed' || session.task?.status === 'cancelled') {
      return 'failed';
    }

    return session.status;
  };

  useEffect(() => {
    if (user) {
      // Fetch projects and sessions in parallel
      Promise.all([fetchProjects(), fetchSessions(true)]);
    }
  }, [user]);

  // Poll sessions status every 5s when any session is still recording/processing
  useEffect(() => {
    const hasActive = sessions.some(s => {
      const status = getEffectiveSessionStatus(s);
      return status === 'recording' || status === 'processing';
    });
    if (!hasActive) return;
    const interval = setInterval(() => fetchSessions(false), 5000);
    return () => clearInterval(interval);
  }, [sessions]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    const { data } = await supabase.from('projects').select('id, name, base_url').order('name');
    if (data) setProjects(data);
    setLoadingProjects(false);
  };

  const fetchSessions = async (showLoading = true) => {
    if (showLoading) setLoadingSessions(true);
    const { data } = await supabase
      .from('recorded_sessions')
      .select('id, title, status, created_at, generated_test_ids, task_id, browser_use_task_id')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (data) {
      // Fetch task statuses only for sessions that need it (recording/processing)
      const needsTaskCheck = data.filter(s => 
        s.task_id && s.status !== 'completed' && s.status !== 'failed'
      );
      
      if (needsTaskCheck.length > 0) {
        const taskIds = needsTaskCheck.map(s => s.task_id!);
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, status, completed_at')
          .in('id', taskIds);
        
        const taskMap = new Map(tasks?.map(t => [t.id, t]) || []);
        const enriched = data.map(s => ({
          ...s,
          task: s.task_id ? (taskMap.get(s.task_id) || null) : null,
        }));
        setSessions(enriched as SessionListItem[]);
      } else {
        setSessions(data.map(s => ({ ...s, task: null })) as SessionListItem[]);
      }
    }
    if (showLoading) setLoadingSessions(false);
  };

  useEffect(() => {
    const project = projects.find(p => p.id === selectedProject);
    if (project?.base_url) setBaseUrl(project.base_url);
  }, [selectedProject, projects]);

  const startRecording = async () => {
    if (!baseUrl) {
      toast.error(t('recorder.enterBaseUrl'));
      return;
    }

    setRecording(true);
    try {
      const observePrompt = `IMPORTANT: You are in OBSERVATION MODE. Do NOT perform any autonomous actions. 

Your ONLY job is to:
1. Navigate to ${baseUrl}
2. Wait and observe what the user does
3. Record every user action (clicks, navigation, form inputs, selections)
4. Do NOT click anything yourself after the initial navigation
5. Do NOT fill any forms yourself
6. Just watch and log each action the user performs

Start by navigating to: ${baseUrl}
Then STOP and WAIT for the user to interact.`;

      const title = sessionTitle || `Recording ${new Date().toLocaleString()}`;

      // Create Browser-Use task
      const { data, error } = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'create_task',
          prompt: observePrompt,
          title,
          projectId: selectedProject || undefined,
          keepBrowserOpen: true,
        },
      });

      if (error) throw error;

      const buTaskId = data?.browserUseTaskId || data?.task?.browser_use_task_id;
      const dbTaskId = data?.task?.id || data?.dbTaskId;
      let live = data?.task?.live_url || data?.liveUrl || null;

      if (buTaskId && (!live || live.includes('sessionId=') || !live.includes('wss='))) {
        const { data: probeData } = await supabase.functions.invoke('browser-use', {
          body: { action: 'probe_live_url', taskId: buTaskId },
        });

        if (probeData?.bestUrl) {
          live = probeData.bestUrl;
        }
      }

      setBrowserUseTaskId(buTaskId);
      setLiveUrl(live);
      setTaskId(dbTaskId);

      // Create recorded_session record
      const { data: session, error: sessionError } = await supabase
        .from('recorded_sessions')
        .insert({
          user_id: user!.id,
          project_id: selectedProject || null,
          title,
          browser_use_task_id: buTaskId || null,
          task_id: dbTaskId || null,
          status: 'recording',
        })
        .select()
        .single();

      if (sessionError) console.error('Failed to create session record:', sessionError);
      else if (session) setSessionId(session.id);

      toast.success(t('recorder.recordingStarted'));
    } catch (err: any) {
      console.error('Start recording error:', err);
      toast.error(t('recorder.startFailed'));
      setRecording(false);
    }
  };

  const stopAndGenerate = async () => {
    if (!browserUseTaskId) return;
    setStopping(true);

    try {
      // Stop the task and get steps
      const { data: stopData } = await supabase.functions.invoke('browser-use', {
        body: { action: 'stop_task', taskId: browserUseTaskId },
      });

      // Fetch task details to get steps
      await new Promise(r => setTimeout(r, 3000));
      
      const { data: detailsData } = await supabase.functions.invoke('browser-use', {
        body: { action: 'get_task_details', taskId: browserUseTaskId },
      });

      const steps = detailsData?.steps || stopData?.steps || [];

      // Also try to get steps from DB task
      let dbSteps = steps;
      if (taskId) {
        const { data: taskData } = await supabase
          .from('tasks')
          .select('steps')
          .eq('id', taskId)
          .single();
        if (taskData?.steps && Array.isArray(taskData.steps) && taskData.steps.length > 0) {
          dbSteps = taskData.steps as any[];
        }
      }

      const recordedSteps = dbSteps.length > 0 ? dbSteps : steps;

      // Update session with steps
      if (sessionId) {
        await supabase
          .from('recorded_sessions')
          .update({
            recorded_steps: recordedSteps as any,
            status: 'processing',
          })
          .eq('id', sessionId);
      }

      // Generate test cases from steps
      const project = projects.find(p => p.id === selectedProject);
      const { data: genData, error: genError } = await supabase.functions.invoke('generate-tests-from-recording', {
        body: {
          recorded_steps: recordedSteps,
          project_id: selectedProject || null,
          base_url: baseUrl,
          session_title: sessionTitle,
        },
      });

      if (genError) throw genError;

      const testCases = genData?.testCases || [];

      // Save generated tests to DB
      const savedTestIds: string[] = [];
      for (const tc of testCases) {
        const { data: saved } = await supabase
          .from('generated_tests')
          .insert({
            user_id: user!.id,
            project_id: selectedProject || null,
            title: tc.title,
            prompt: tc.prompt,
            expected_result: tc.expectedResult,
            priority: tc.priority || 'medium',
            status: 'pending',
            source_type: 'recording',
          })
          .select('id')
          .single();
        if (saved) savedTestIds.push(saved.id);
      }

      // Update session with generated test IDs
      if (sessionId) {
        await supabase
          .from('recorded_sessions')
          .update({
            generated_test_ids: savedTestIds,
            status: 'completed',
            completed_at: new Date().toISOString(),
          } as any)
          .eq('id', sessionId);
      }

      toast.success(t('recorder.testsGenerated', { count: testCases.length }));

      // Navigate to detail
      if (sessionId) {
        navigate(`/dashboard/recorder/${sessionId}`);
      } else {
        // Reset state
        setRecording(false);
        setLiveUrl(null);
        setBrowserUseTaskId(null);
        fetchSessions();
      }
    } catch (err: any) {
      console.error('Stop & generate error:', err);
      toast.error(t('recorder.generateFailed'));
      if (sessionId) {
        await supabase
          .from('recorded_sessions')
          .update({ status: 'failed' } as any)
          .eq('id', sessionId);
      }
    } finally {
      setStopping(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'recording': return <Badge variant="default" className="bg-red-500">{t('recorder.statusRecording')}</Badge>;
      case 'processing': return <Badge variant="secondary">{t('recorder.statusProcessing')}</Badge>;
      case 'completed': return <Badge className="bg-green-600">{t('status.completed')}</Badge>;
      case 'failed': return <Badge variant="destructive">{t('status.failed')}</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Start Recording Card */}
      {!recording && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-red-500" />
              {t('recorder.title')}
            </CardTitle>
            <CardDescription>{t('recorder.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('recorder.sessionName')}</Label>
                <Input
                  value={sessionTitle}
                  onChange={e => setSessionTitle(e.target.value)}
                  placeholder={t('recorder.sessionNamePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('newTask.project')}</Label>
                <Select value={selectedProject} onValueChange={setSelectedProject} disabled={loadingProjects}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingProjects ? t('common.loading') || 'Načítám...' : t('newTask.selectProject')} />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('recorder.baseUrl')}</Label>
              <Input
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <Button onClick={startRecording} className="w-full bg-red-600 hover:bg-red-700">
              <Play className="h-4 w-4 mr-2" />
              {t('recorder.startRecording')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Live Recording View */}
      {recording && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                <CardTitle>{t('recorder.recording')}</CardTitle>
              </div>
              <Button
                onClick={stopAndGenerate}
                disabled={stopping}
                variant="destructive"
              >
                {stopping ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('recorder.stopping')}</>
                ) : (
                  <><Square className="h-4 w-4 mr-2" />{t('recorder.stopAndGenerate')}</>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {liveUrl ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{t('recorder.performActions')}</span>
                  <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" />
                    {t('taskDetail.openNewWindow')}
                  </a>
                </div>
                <div className="rounded-lg border overflow-hidden bg-muted" style={{ height: '600px' }}>
                  <iframe
                    src={liveUrl}
                    className="w-full h-full"
                    title="Live browser"
                    allow="clipboard-read; clipboard-write"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Past Sessions */}
      <Card>
        <CardHeader>
          <CardTitle>{t('recorder.pastSessions')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSessions ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{t('recorder.noSessions')}</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => {
                const effectiveStatus = getEffectiveSessionStatus(s);

                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => effectiveStatus === 'completed' && navigate(`/dashboard/recorder/${s.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <Video className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{s.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.created_at).toLocaleString()}
                          {s.generated_test_ids?.length > 0 && ` · ${s.generated_test_ids.length} ${t('recorder.testCases')}`}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(effectiveStatus)}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
