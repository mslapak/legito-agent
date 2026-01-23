import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Download,
  Filter,
  X,
  Search,
  TestTube,
  TrendingUp,
  ArrowUpDown,
  Play,
  CloudOff,
  Cloud,
  Camera,
  Film,
  ExternalLink,
  Pause,
  Square,
  Trash2,
  FolderX,
  FileText,
  Calendar,
  Timer,
  Hash,
  AlertTriangle,
  DollarSign,
  Layers,
  Clock as ClockIcon,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Video,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import StructuredResult from '@/components/StructuredResult';
import { ImageGalleryLightbox, ImageGalleryGrid } from '@/components/ImageGallery';

interface GeneratedTest {
  id: string;
  title: string;
  prompt: string;
  expected_result: string | null;
  priority: string;
  status: string;
  azure_devops_id: string | null;
  project_id: string | null;
  task_id: string | null;
  test_suite_id: string | null;
  created_at: string;
  last_run_at: string | null;
  execution_time_ms: number | null;
  result_summary: string | null;
  result_reasoning: string | null;
  step_count: number | null;
  estimated_cost: number | null;
}

interface Project {
  id: string;
  name: string;
}

interface TestSuite {
  id: string;
  name: string;
  project_id: string | null;
  description: string | null;
}

interface Stats {
  total: number;
  pending: number;
  running: number;
  passed: number;
  failed: number;  // functional failure (test ran but didn't meet expectations)
  error: number;   // technical error (API, timeout, etc.)
  successRate: number;
  totalCost: number;
  avgCost: number;
}

interface BatchRun {
  id: string;
  status: string;
  total_tests: number;
  completed_tests: number;
  passed_tests: number;
  failed_tests: number;
  current_test_id: string | null;
  started_at: string | null;
  created_at: string;
  paused: boolean | null;
  batch_size: number | null;
}

type SortField = 'title' | 'status' | 'priority' | 'last_run_at' | 'created_at';
type SortOrder = 'asc' | 'desc';

export default function TestsDashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tests, setTests] = useState<GeneratedTest[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Bulk selection
  const [selectedTests, setSelectedTests] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [currentBulkIndex, setCurrentBulkIndex] = useState<number | null>(null);
  
  // Background mode
  const [backgroundMode, setBackgroundMode] = useState(false);
  const [activeBatches, setActiveBatches] = useState<BatchRun[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [suiteFilter, setSuiteFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  
  // Batch size and delay for execution
  const [batchSize, setBatchSize] = useState(50);
  const [batchDelay, setBatchDelay] = useState(10);

  // Test detail modal
  const [selectedTest, setSelectedTest] = useState<GeneratedTest | null>(null);
  const [linkedTask, setLinkedTask] = useState<{
    result: unknown;
    screenshots: string[] | null;
    recordings: string[] | null;
    steps: unknown;
    error_message: string | null;
    started_at: string | null;
    completed_at: string | null;
    step_count: number | null;
  } | null>(null);
  const [linkedTaskLoading, setLinkedTaskLoading] = useState(false);
  const [stepsExpanded, setStepsExpanded] = useState(false);

  const dateLocale = i18n.language === 'cs' ? 'cs-CZ' : 'en-US';

  const looksLikeSessionExpired = (val: string) => {
    const s = val.toLowerCase();
    return (
      s.includes('session expired') ||
      s.includes('session vypršela') ||
      s.includes('task not found') ||
      s.includes('task nebyl nalezen')
    );
  };

  // Fetch linked task when selectedTest changes
  useEffect(() => {
    const fetchLinkedTask = async () => {
      if (!selectedTest?.task_id) {
        setLinkedTask(null);
        return;
      }
      
      setLinkedTaskLoading(true);
      try {
        const { data, error } = await supabase
          .from('tasks')
          .select('result, screenshots, recordings, steps, error_message, started_at, completed_at, step_count')
          .eq('id', selectedTest.task_id)
          .single();
        
        if (error) throw error;
        setLinkedTask(data as typeof linkedTask);
      } catch (error) {
        console.error('Error fetching linked task:', error);
        setLinkedTask(null);
      } finally {
        setLinkedTaskLoading(false);
      }
    };

    fetchLinkedTask();
    setStepsExpanded(false);
  }, [selectedTest?.task_id]);

  useEffect(() => {
    if (user) {
      fetchData();
      fetchActiveBatches();
    }
  }, [user]);

  // Backup polling for active batches (fallback for realtime disconnects)
  useEffect(() => {
    if (!user) return;
    
    // Poll every 15 seconds as backup
    const backupInterval = setInterval(() => {
      fetchActiveBatches();
    }, 15000);
    
    return () => clearInterval(backupInterval);
  }, [user]);

  // Real-time subscription for batch runs with reconnect logic
  useEffect(() => {
    if (!user) return;

    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const batchChannel = supabase
      .channel('batch-runs-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'test_batch_runs',
        },
        (payload) => {
          console.log('Batch run update:', payload);
          // Refresh batches on any change
          fetchActiveBatches();
        }
      )
      .subscribe((status) => {
        console.log('Batch channel status:', status);
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          // Reconnect after 3 seconds
          reconnectTimeout = setTimeout(() => {
            console.log('Reconnecting batch channel...');
            batchChannel.subscribe();
          }, 3000);
        }
      });

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      supabase.removeChannel(batchChannel);
    };
  }, [user]);

  // Real-time subscription for test updates
  useEffect(() => {
    if (!user) return;

    const testsChannel = supabase
      .channel('tests-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'generated_tests',
        },
        (payload) => {
          console.log('Test update:', payload);
          // Update single test in state without full refetch
          const updatedTest = payload.new as GeneratedTest;
          setTests(prev => prev.map(t => 
            t.id === updatedTest.id ? updatedTest : t
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(testsChannel);
    };
  }, [user]);

  // Poll running tests to check their actual status
  useEffect(() => {
    const runningTests = tests.filter(t => t.status === 'running');
    if (runningTests.length === 0) return;

    // Helper to map DB task status to test status
    const mapDbTaskToTestStatus = (taskStatus: string | null | undefined): 'passed' | 'failed' | 'error' | 'pending' => {
      if (taskStatus === 'completed') return 'passed';
      if (taskStatus === 'failed') return 'error';
      if (taskStatus === 'cancelled') return 'pending';
      return 'pending';
    };

    const deriveResultSummaryFromTask = async (dbTask: { result: unknown; browser_use_task_id: string | null }) => {
      const raw = dbTask.result
        ? (typeof dbTask.result === 'string' ? dbTask.result : JSON.stringify(dbTask.result))
        : '';

      // If DB has a known "session expired" placeholder, try provider details via browser_use_task_id.
      if (typeof raw === 'string' && raw && looksLikeSessionExpired(raw) && dbTask.browser_use_task_id) {
        try {
          const details = await supabase.functions.invoke('browser-use', {
            body: { action: 'get_task_details', taskId: dbTask.browser_use_task_id },
          });
          const output = details.data?.output || details.data?.result;
          if (typeof output === 'string' && output.trim()) return output.substring(0, 500);
          if (output) return JSON.stringify(output).substring(0, 500);
        } catch {
          // ignore, fall back to DB
        }
      }

      if (!raw) return null;
      return typeof raw === 'string' ? raw.substring(0, 500) : JSON.stringify(raw).substring(0, 500);
    };

    const checkRunningTests = async () => {
      for (const test of runningTests) {
        try {
          // Always fetch task from DB first to get browser_use_task_id and current status
          const { data: testData } = await supabase
            .from('generated_tests')
            .select('task_id')
            .eq('id', test.id)
            .single();

          if (!testData?.task_id) {
            // No task_id means test was never started properly, reset to pending
            await supabase
              .from('generated_tests')
              .update({ status: 'pending' })
              .eq('id', test.id);
            continue;
          }

          // Always prefer DB task state first (provider tasks can expire while DB already has results)
          const { data: dbTask } = await supabase
            .from('tasks')
            .select('status, browser_use_task_id, started_at, completed_at, updated_at, result')
            .eq('id', testData.task_id)
            .maybeSingle();

          // If DB task is already finalized, finalize the test without calling provider
          if (dbTask?.status && ['completed', 'failed', 'cancelled'].includes(dbTask.status)) {
            const finalStatus = mapDbTaskToTestStatus(dbTask.status);
            let executionTimeMs: number | null = null;
            
            if (dbTask.started_at && dbTask.completed_at) {
              executionTimeMs = new Date(dbTask.completed_at).getTime() - new Date(dbTask.started_at).getTime();
            }

            const resultSummary = await deriveResultSummaryFromTask({
              result: dbTask.result,
              browser_use_task_id: dbTask.browser_use_task_id ?? null,
            });

            await supabase
              .from('generated_tests')
              .update({ 
                status: finalStatus,
                last_run_at: dbTask.completed_at || new Date().toISOString(),
                execution_time_ms: executionTimeMs,
                result_summary: resultSummary,
              })
              .eq('id', test.id);
            continue;
          }

          // Use browser_use_task_id for provider calls (not task_id)
          const providerTaskId = dbTask?.browser_use_task_id;
          if (!providerTaskId) {
            // Can't check provider; keep running until DB updates
            continue;
          }

          const response = await supabase.functions.invoke('browser-use', {
            body: {
              action: 'get_task_status',
              taskId: providerTaskId,
            },
          });

          // Handle expired/not found task - re-check DB before giving up
          if (response.data?.expired || response.data?.status === 'not_found') {
            // Re-fetch DB task status in case it was updated
            const { data: recheckTask } = await supabase
              .from('tasks')
              .select('status, started_at, completed_at, result')
              .eq('id', testData.task_id)
              .maybeSingle();

            if (recheckTask?.status && ['completed', 'failed', 'cancelled'].includes(recheckTask.status)) {
              const finalStatus = mapDbTaskToTestStatus(recheckTask.status);
              let executionTimeMs: number | null = null;
              
              if (recheckTask.started_at && recheckTask.completed_at) {
                executionTimeMs = new Date(recheckTask.completed_at).getTime() - new Date(recheckTask.started_at).getTime();
              }

              const resultSummary = recheckTask.result 
                ? (typeof recheckTask.result === 'string' ? recheckTask.result.substring(0, 500) : JSON.stringify(recheckTask.result).substring(0, 500))
                : null;

              await supabase
                .from('generated_tests')
                .update({ 
                  status: finalStatus,
                  last_run_at: recheckTask.completed_at || new Date().toISOString(),
                  execution_time_ms: executionTimeMs,
                  // If DB has a placeholder "session expired" result, avoid overwriting with it.
                  result_summary: (resultSummary && looksLikeSessionExpired(resultSummary)) ? null : resultSummary,
                })
                .eq('id', test.id);
            }
            // If DB also has no finalized status, leave as running (don't mark as expired)
            continue;
          }

          if (response.data?.status) {
            const apiStatus = response.data.status;
            let newStatus = test.status;
            
            if (apiStatus === 'finished' || apiStatus === 'completed' || apiStatus === 'done') {
              newStatus = 'passed';
            } else if (apiStatus === 'failed' || apiStatus === 'error') {
              newStatus = 'failed';
            } else if (apiStatus === 'stopped') {
              if (response.data?.output || response.data?.finished_at || response.data?.finishedAt) {
                newStatus = 'passed';
              } else {
                newStatus = 'pending';
              }
            }

            if (newStatus !== 'running') {
              const startedAt = response.data?.started_at || response.data?.startedAt || response.data?.created_at;
              const finishedAt = response.data?.finished_at || response.data?.finishedAt || new Date().toISOString();
              let executionTimeMs: number | null = null;
              
              if (startedAt) {
                executionTimeMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
              }

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
          // On error, don't blindly mark as passed - check DB first
          try {
            const { data: testData } = await supabase
              .from('generated_tests')
              .select('task_id')
              .eq('id', test.id)
              .single();

            if (testData?.task_id) {
              const { data: dbTask } = await supabase
                .from('tasks')
                .select('status, started_at, completed_at, result')
                .eq('id', testData.task_id)
                .maybeSingle();

              if (dbTask?.status && ['completed', 'failed', 'cancelled'].includes(dbTask.status)) {
                const finalStatus = mapDbTaskToTestStatus(dbTask.status);
                await supabase
                  .from('generated_tests')
                  .update({ 
                    status: finalStatus,
                    last_run_at: dbTask.completed_at || new Date().toISOString(),
                  })
                  .eq('id', test.id);
              }
            }
          } catch {
            // Fallback: keep running
          }
        }
      }
      // Refresh data after checking
      fetchData();
    };

    checkRunningTests();
    const interval = setInterval(checkRunningTests, 5000);

    return () => clearInterval(interval);
  }, [tests]);

  const fetchActiveBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('test_batch_runs')
        .select('*')
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setActiveBatches((data || []) as BatchRun[]);
    } catch (error) {
      console.error('Error fetching active batches:', error);
    }
  };

  const fetchData = async () => {
    try {
      const [testsResult, projectsResult, suitesResult] = await Promise.all([
        supabase
          .from('generated_tests')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('projects')
          .select('id, name')
          .order('name'),
        supabase
          .from('test_suites')
          .select('id, name, project_id, description')
          .order('created_at', { ascending: false }),
      ]);

      if (testsResult.error) throw testsResult.error;
      if (projectsResult.error) throw projectsResult.error;
      if (suitesResult.error) throw suitesResult.error;

      setTests(testsResult.data || []);
      setProjects(projectsResult.data || []);
      setTestSuites(suitesResult.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(t('tests.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const stats: Stats = useMemo(() => {
    const total = tests.length;
    const pending = tests.filter(t => t.status === 'pending').length;
    const running = tests.filter(t => t.status === 'running').length;
    const passed = tests.filter(t => t.status === 'passed').length;
    const failed = tests.filter(t => t.status === 'failed').length; // functional failure
    const error = tests.filter(t => t.status === 'error').length; // technical error
    const executed = passed + failed + error;
    const successRate = executed > 0 ? Math.round((passed / executed) * 100) : 0;
    
    // Calculate costs
    const testsWithCost = tests.filter(t => t.estimated_cost !== null && t.estimated_cost > 0);
    const totalCost = testsWithCost.reduce((sum, t) => sum + (t.estimated_cost || 0), 0);
    const avgCost = testsWithCost.length > 0 ? totalCost / testsWithCost.length : 0;

    return { total, pending, running, passed, failed, error, successRate, totalCost, avgCost };
  }, [tests]);

  const filteredTests = useMemo(() => {
    return tests.filter(test => {
      const matchesSearch = !search || 
        test.title.toLowerCase().includes(search.toLowerCase()) ||
        test.prompt.toLowerCase().includes(search.toLowerCase()) ||
        (test.azure_devops_id && test.azure_devops_id.toLowerCase().includes(search.toLowerCase()));
      
      const matchesProject = projectFilter === 'all' || test.project_id === projectFilter;
      const matchesSuite = suiteFilter === 'all' || 
        (suiteFilter === 'none' ? test.test_suite_id === null : test.test_suite_id === suiteFilter);
      const matchesStatus = statusFilter === 'all' || test.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || test.priority === priorityFilter;

      return matchesSearch && matchesProject && matchesSuite && matchesStatus && matchesPriority;
    });
  }, [tests, search, projectFilter, suiteFilter, statusFilter, priorityFilter]);

  // Get suites filtered by selected project
  const filteredSuites = useMemo(() => {
    if (projectFilter === 'all') return testSuites;
    return testSuites.filter(s => s.project_id === projectFilter);
  }, [testSuites, projectFilter]);

  // Helper to get suite name
  const getSuiteName = (suiteId: string | null) => {
    if (!suiteId) return null;
    const suite = testSuites.find(s => s.id === suiteId);
    return suite?.name || null;
  };

  const sortedTests = useMemo(() => {
    return [...filteredTests].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'priority':
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          comparison = (priorityOrder[a.priority as keyof typeof priorityOrder] || 1) - 
                       (priorityOrder[b.priority as keyof typeof priorityOrder] || 1);
          break;
        case 'last_run_at':
          const aDate = a.last_run_at ? new Date(a.last_run_at).getTime() : 0;
          const bDate = b.last_run_at ? new Date(b.last_run_at).getTime() : 0;
          comparison = aDate - bDate;
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredTests, sortField, sortOrder]);

  const paginatedTests = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedTests.slice(start, start + pageSize);
  }, [sortedTests, page, pageSize]);

  const totalPages = Math.ceil(sortedTests.length / pageSize);

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return t('tests.noProject');
    return projects.find(p => p.id === projectId)?.name || t('tests.unknownProject');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />{t('tests.pending')}</Badge>;
      case 'running':
        return <Badge className="bg-warning text-warning-foreground"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{t('tests.running')}</Badge>;
      case 'passed':
        return <Badge className="bg-success text-success-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />{t('tests.passed')}</Badge>;
      case 'failed':
        return <Badge className="bg-orange-500 text-white"><AlertTriangle className="w-3 h-3 mr-1" />{t('tests.failed')}</Badge>;
      case 'error':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />{t('tests.error')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive">{t('priority.high')}</Badge>;
      case 'medium':
        return <Badge variant="secondary">{t('priority.medium')}</Badge>;
      case 'low':
        return <Badge variant="outline">{t('priority.low')}</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const formatCost = (cost: number | null) => {
    if (!cost) return '-';
    return `$${cost.toFixed(4)}`;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const resetFilters = () => {
    setSearch('');
    setProjectFilter('all');
    setSuiteFilter('all');
    setStatusFilter('all');
    setPriorityFilter('all');
    setPage(1);
  };

  const hasActiveFilters = search || projectFilter !== 'all' || suiteFilter !== 'all' || statusFilter !== 'all' || priorityFilter !== 'all';

  // Navigate to task detail
  const handleTestClick = (test: GeneratedTest) => {
    if (test.task_id) {
      navigate(`/dashboard/tasks/${test.task_id}`);
    } else {
      toast.info(t('tests.notYetRun'));
    }
  };

  // Bulk selection handlers
  const toggleSelectAll = () => {
    if (selectedTests.size === paginatedTests.length) {
      setSelectedTests(new Set());
    } else {
      setSelectedTests(new Set(paginatedTests.map(t => t.id)));
    }
  };

  const selectAllFiltered = () => {
    if (selectedTests.size === sortedTests.length) {
      setSelectedTests(new Set());
    } else {
      setSelectedTests(new Set(sortedTests.map(t => t.id)));
    }
  };

  const toggleSelectTest = (testId: string) => {
    const newSelected = new Set(selectedTests);
    if (newSelected.has(testId)) {
      newSelected.delete(testId);
    } else {
      newSelected.add(testId);
    }
    setSelectedTests(newSelected);
  };

  // Estimated run time calculation (5 min per test average)
  const estimatedMinutes = Math.ceil((selectedTests.size * 5));

  const runSelectedTests = async () => {
    const testIds = Array.from(selectedTests);
    if (testIds.length === 0) {
      toast.error(t('tests.selectAtLeastOne'));
      return;
    }

    // Background mode - create batch and let edge function handle it
    if (backgroundMode) {
      // Prevent double-clicks - check if we're already starting a batch
      if (bulkRunning) {
        return;
      }
      
      setBulkRunning(true); // Use as "starting batch" flag
      
      try {
        // Check if there's already an active batch (pending OR running)
        const { data: existingActive } = await supabase
          .from('test_batch_runs')
          .select('id, status')
          .eq('user_id', user?.id)
          .in('status', ['pending', 'running'])
          .limit(1);

        if (existingActive && existingActive.length > 0) {
          toast.error(
            i18n.language === 'cs' 
              ? 'Již běží jiný batch run. Počkejte na jeho dokončení nebo ho zrušte.' 
              : 'Another batch run is already running. Wait for it to complete or cancel it.'
          );
          setBulkRunning(false);
          return;
        }

        // Create batch record with batch_size
        const { data: batch, error: batchError } = await supabase
          .from('test_batch_runs')
          .insert({
            user_id: user?.id,
            test_ids: testIds,
            total_tests: testIds.length,
            batch_size: batchSize,
            status: 'pending',
          })
          .select()
          .single();

        if (batchError || !batch) {
          // Check if it's a unique constraint violation (another batch exists)
          if (batchError?.code === '23505') {
            toast.error(
              i18n.language === 'cs' 
                ? 'Již existuje aktivní batch run. Počkejte na jeho dokončení nebo ho zrušte.' 
                : 'An active batch run already exists. Wait for it to complete or cancel it.'
            );
            setBulkRunning(false);
            return;
          }
          throw new Error(batchError?.message || 'Failed to create batch');
        }

        // Call edge function (fire-and-forget)
        const response = await supabase.functions.invoke('run-tests-batch', {
          body: {
            batchId: batch.id,
            testIds: testIds,
            userId: user?.id,
            batchDelaySeconds: batchDelay,
          },
        });

        if (response.error) {
          // Check if it's a 409 conflict (already running batch)
          const errorData = response.data;
          if (errorData?.runningBatchId) {
            toast.error(
              i18n.language === 'cs' 
                ? 'Již běží jiný batch run. Počkejte na jeho dokončení nebo ho zrušte.' 
                : 'Another batch run is already running. Wait for it to complete or cancel it.'
            );
            // Clean up the pending batch we just created
            await supabase.from('test_batch_runs').delete().eq('id', batch.id);
            setBulkRunning(false);
            return;
          }
          throw new Error(response.error.message);
        }

        setSelectedTests(new Set());
        toast.success(t('tests.testsStartedBackground', { count: testIds.length }));
        fetchActiveBatches();
        
      } catch (error) {
        console.error('Error starting background batch:', error);
        toast.error(`${t('common.error')}: ${error instanceof Error ? error.message : t('toast.unknownError')}`);
      } finally {
        setBulkRunning(false);
      }
      return;
    }

    // Foreground mode - run tests sequentially in browser
    setBulkRunning(true);
    toast.info(t('tests.runningSequentially', { count: testIds.length }));

    for (let i = 0; i < testIds.length; i++) {
      setCurrentBulkIndex(i);
      const testId = testIds[i];
      const test = tests.find(t => t.id === testId);
      
      if (!test || test.status === 'running') continue;

      try {
        // Get project info for setup_prompt and credentials
        let setupPrompt = '';
        let credentials = '';
        
        if (test.project_id) {
          const { data: project } = await supabase
            .from('projects')
            .select('setup_prompt, base_url')
            .eq('id', test.project_id)
            .single();
          
          if (project?.setup_prompt) {
            setupPrompt = project.setup_prompt;
          }

          // Get credentials
          const { data: creds } = await supabase
            .from('project_credentials')
            .select('username, password, description')
            .eq('project_id', test.project_id);

          if (creds && creds.length > 0) {
            credentials = creds.map(c => 
              `Credentials${c.description ? ` (${c.description})` : ''}: username="${c.username}", password="${c.password}"`
            ).join('\n');
          }
        }

        // Build full prompt
        let fullPrompt = test.prompt;
        if (setupPrompt) {
          fullPrompt = `${setupPrompt}\n\n${i18n.language === 'cs' ? 'Následně proveď test' : 'Then perform the test'}:\n${test.prompt}`;
        }
        if (credentials) {
          fullPrompt = `${fullPrompt}\n\n${credentials}`;
        }
        if (test.expected_result) {
          fullPrompt = `${fullPrompt}\n\n${i18n.language === 'cs' ? 'Očekávaný výsledek' : 'Expected result'}: ${test.expected_result}`;
        }

        // Update test status to running
        await supabase
          .from('generated_tests')
          .update({ status: 'running' })
          .eq('id', testId);

        // Create browser-use task - pass projectId so edge function can look up browser_profile_id
        const response = await supabase.functions.invoke('browser-use', {
          body: {
            action: 'create_task',
            prompt: fullPrompt,
            title: test.title,
            projectId: test.project_id,
            keepBrowserOpen: false,
          },
        });

        if (response.error || !response.data?.task?.id) {
          throw new Error(response.error?.message || 'Failed to create task');
        }

        // IMPORTANT: response.data.task.id is our DB task id (FK in generated_tests.task_id)
        // while response.data.browserUseTaskId is the provider task id used for status polling.
        const dbTaskId = response.data.task.id;
        const browserUseTaskId: string | undefined =
          response.data.browserUseTaskId ?? response.data.task?.browser_use_task_id;

        if (!browserUseTaskId) {
          throw new Error('Missing browser task id (browserUseTaskId)');
        }

        // Save DB task id (FK) to generated_tests
        await supabase
          .from('generated_tests')
          .update({ task_id: dbTaskId })
          .eq('id', testId);

        // Wait for task to complete (poll every 3 seconds, max 5 minutes)
        let taskCompleted = false;
        let attempts = 0;
        const maxAttempts = 100;

        while (!taskCompleted && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          attempts++;

          const statusResponse = await supabase.functions.invoke('browser-use', {
            body: {
              action: 'get_task_status',
              taskId: browserUseTaskId,
            },
          });

          const apiStatus = statusResponse.data?.status;
          if (['finished', 'completed', 'done', 'failed', 'error', 'stopped', 'not_found', 'expired'].includes(apiStatus)) {
            taskCompleted = true;
            
            // When session expired/not_found, check DB task first – it may have completed successfully
            const isExpiredOrNotFound = apiStatus === 'not_found' || apiStatus === 'expired' || statusResponse.data?.expired;
            
            if (isExpiredOrNotFound) {
              // Verify DB task before marking as error
              const { data: dbTask } = await supabase
                .from('tasks')
                 .select('status, started_at, completed_at, updated_at, result, step_count, steps, project_id, error_message')
                .eq('id', dbTaskId)
                .maybeSingle();

               if (dbTask?.status && ['completed', 'failed'].includes(dbTask.status)) {
                 // Task is finalized in DB – NEVER overwrite with “session expired”.
                 const startedAt = dbTask.started_at;
                 const finishedAt = dbTask.completed_at || dbTask.updated_at;
                 const executionTimeMs = startedAt && finishedAt
                   ? new Date(finishedAt).getTime() - new Date(startedAt).getTime()
                   : null;

                 // Pull summary primarily from DB (it might already contain the real output)
                 const rawResult = dbTask.result ?? (dbTask.error_message ? { error: dbTask.error_message } : null);
                 const output = (rawResult && typeof rawResult === 'object' && 'output' in (rawResult as Record<string, unknown>))
                   ? (rawResult as Record<string, unknown>).output
                   : rawResult;

                 const resultSummary = output
                   ? (typeof output === 'string' ? output.substring(0, 500) : JSON.stringify(output).substring(0, 500))
                   : null;

                 const stepCount =
                   (typeof dbTask.step_count === 'number' ? dbTask.step_count : null) ??
                   (Array.isArray(dbTask.steps) ? dbTask.steps.length : null);

                 // Estimate cost (same formula as batch runner)
                 // If step_count is missing, calculate cost from execution_time only (partial estimate)
                 let estimatedCost: number | null = null;
                 if (typeof executionTimeMs === 'number') {
                   let recordVideo = true;
                   if (test.project_id) {
                     const { data: project } = await supabase
                       .from('projects')
                       .select('record_video')
                       .eq('id', test.project_id)
                       .maybeSingle();
                     if (typeof project?.record_video === 'boolean') recordVideo = project.record_video;
                   }
                   const execMinutes = executionTimeMs / 60000;
                   const proxyRate = recordVideo ? 0.008 : 0.004;
                   // If stepCount is known, use full formula; otherwise estimate with 0 step cost
                   const stepCost = typeof stepCount === 'number' ? (stepCount * 0.01) : 0;
                   estimatedCost = 0.01 + stepCost + (execMinutes * proxyRate);
                 }

                 await supabase
                   .from('generated_tests')
                   .update({
                     status: dbTask.status === 'failed' ? 'error' : 'passed',
                     last_run_at: (dbTask.completed_at || dbTask.updated_at || new Date().toISOString()),
                     execution_time_ms: executionTimeMs,
                     result_summary: resultSummary,
                     step_count: stepCount,
                     estimated_cost: estimatedCost,
                   })
                   .eq('id', testId);
              } else {
                // Session truly expired before completion
                await supabase
                  .from('generated_tests')
                  .update({ 
                    status: 'error',
                    last_run_at: new Date().toISOString(),
                    result_summary: i18n.language === 'cs'
                      ? 'Session vypršela / task nebyl nalezen'
                      : 'Session expired / task not found',
                  })
                  .eq('id', testId);
              }
            } else {
              // Normal completion (finished, failed, etc.)
              let newStatus: 'passed' | 'error' = 'passed';
              if (apiStatus === 'failed' || apiStatus === 'error') {
                newStatus = 'error';
              }

              const startedAt = statusResponse.data?.started_at || statusResponse.data?.startedAt;
              const finishedAt = statusResponse.data?.finished_at || statusResponse.data?.finishedAt || new Date().toISOString();
              let executionTimeMs: number | null = null;
              
              if (startedAt) {
                executionTimeMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
              }

              const output = statusResponse.data?.output || statusResponse.data?.result || '';
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
                .eq('id', testId);
            }
          }
        }

        if (!taskCompleted) {
          // Timeout - before writing a timeout, verify whether the DB task has already completed.
          const { data: dbTask } = await supabase
            .from('tasks')
            .select('status, started_at, completed_at, updated_at, result, step_count, steps, project_id, error_message')
            .eq('id', dbTaskId)
            .maybeSingle();

          if (dbTask?.status && ['completed', 'failed'].includes(dbTask.status)) {
            const startedAt = dbTask.started_at;
            const finishedAt = dbTask.completed_at || dbTask.updated_at;
            const executionTimeMs = startedAt && finishedAt
              ? new Date(finishedAt).getTime() - new Date(startedAt).getTime()
              : null;

            const rawResult = dbTask.result ?? (dbTask.error_message ? { error: dbTask.error_message } : null);
            const output = (rawResult && typeof rawResult === 'object' && 'output' in (rawResult as Record<string, unknown>))
              ? (rawResult as Record<string, unknown>).output
              : rawResult;

            const resultSummary = output
              ? (typeof output === 'string' ? output.substring(0, 500) : JSON.stringify(output).substring(0, 500))
              : null;

            const stepCount =
              (typeof dbTask.step_count === 'number' ? dbTask.step_count : null) ??
              (Array.isArray(dbTask.steps) ? dbTask.steps.length : null);

            // Estimate cost - if step_count is missing, calculate from execution_time only
            let estimatedCost: number | null = null;
            if (typeof executionTimeMs === 'number') {
              let recordVideo = true;
              if (test.project_id) {
                const { data: project } = await supabase
                  .from('projects')
                  .select('record_video')
                  .eq('id', test.project_id)
                  .maybeSingle();
                if (typeof project?.record_video === 'boolean') recordVideo = project.record_video;
              }
              const execMinutes = executionTimeMs / 60000;
              const proxyRate = recordVideo ? 0.008 : 0.004;
              const stepCost = typeof stepCount === 'number' ? (stepCount * 0.01) : 0;
              estimatedCost = 0.01 + stepCost + (execMinutes * proxyRate);
            }

            await supabase
              .from('generated_tests')
              .update({
                status: dbTask.status === 'failed' ? 'error' : 'passed',
                last_run_at: (dbTask.completed_at || dbTask.updated_at || new Date().toISOString()),
                execution_time_ms: executionTimeMs,
                result_summary: resultSummary,
                step_count: stepCount,
                estimated_cost: estimatedCost,
              })
              .eq('id', testId);
          } else {
            // Real timeout
          await supabase
            .from('generated_tests')
            .update({ 
              status: 'error',
              last_run_at: new Date().toISOString(),
              result_summary: i18n.language === 'cs' ? 'Timeout - test nedoběhl do 5 minut' : 'Timeout - test did not complete within 5 minutes',
            })
            .eq('id', testId);
          }
        }

        // Refresh data after each test
        await fetchData();

      } catch (error) {
        console.error('Error running test:', error);
        await supabase
          .from('generated_tests')
          .update({ 
            status: 'failed',
            last_run_at: new Date().toISOString(),
            result_summary: `${t('common.error')}: ${error instanceof Error ? error.message : t('toast.unknownError')}`,
          })
          .eq('id', testId);
        await fetchData();
      }
    }

    setBulkRunning(false);
    setCurrentBulkIndex(null);
    setSelectedTests(new Set());
    toast.success(`${i18n.language === 'cs' ? 'Dokončeno' : 'Completed'} ${testIds.length} ${i18n.language === 'cs' ? 'testů' : 'tests'}`);
  };

  const getTestTitle = (testId: string | null) => {
    if (!testId) return 'N/A';
    const test = tests.find(t => t.id === testId);
    return test?.title || testId.substring(0, 8);
  };

  // Batch control handlers
  const pauseBatch = async (batchId: string) => {
    try {
      const { error } = await supabase
        .from('test_batch_runs')
        .update({ paused: true })
        .eq('id', batchId);

      if (error) throw error;
      toast.success(t('tests.batchPaused'));
      fetchActiveBatches();
    } catch (error) {
      console.error('Error pausing batch:', error);
      toast.error(t('common.error'));
    }
  };

  const resumeBatch = async (batchId: string) => {
    try {
      const { error } = await supabase
        .from('test_batch_runs')
        .update({ paused: false })
        .eq('id', batchId);

      if (error) throw error;
      toast.success(t('tests.batchResumed'));
      fetchActiveBatches();
    } catch (error) {
      console.error('Error resuming batch:', error);
      toast.error(t('common.error'));
    }
  };

  const cancelBatch = async (batchId: string) => {
    try {
      const { error } = await supabase
        .from('test_batch_runs')
        .update({ 
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        })
        .eq('id', batchId);

      if (error) throw error;
      toast.success(t('tests.batchCancelled'));
      fetchActiveBatches();
    } catch (error) {
      console.error('Error cancelling batch:', error);
      toast.error(t('common.error'));
    }
  };

  const exportToExcel = async () => {
    setExporting(true);
    try {
      const data = sortedTests.map(test => ({
        'ID': test.azure_devops_id || test.id.substring(0, 8),
        'Title': test.title,
        'Test Step': '1',
        'Step Action': test.prompt,
        'Step Expected': test.expected_result || '',
        'Priority': test.priority === 'high' ? t('priority.high') : test.priority === 'medium' ? t('priority.medium') : t('priority.low'),
        'Status': test.status === 'passed' ? t('tests.passed') : test.status === 'failed' ? t('tests.failed') : test.status === 'running' ? t('tests.running') : t('tests.pending'),
        'Last Run': test.last_run_at ? new Date(test.last_run_at).toLocaleString(dateLocale) : 'N/A',
        'Duration': formatDuration(test.execution_time_ms),
        'Steps': test.step_count || '',
        'Cost (USD)': test.estimated_cost ? test.estimated_cost.toFixed(4) : '',
        'Result': test.result_summary || '',
        'Reasoning': test.result_reasoning || '',
        'Project': getProjectName(test.project_id),
        'Created': new Date(test.created_at).toLocaleString(dateLocale),
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Test Results');

      // Auto-size columns
      const colWidths = Object.keys(data[0] || {}).map(key => ({
        wch: Math.max(key.length, ...data.map(row => String(row[key as keyof typeof row] || '').length).slice(0, 50)) + 2
      }));
      ws['!cols'] = colWidths;

      XLSX.writeFile(wb, `test-results-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success(i18n.language === 'cs' ? 'Export dokončen' : 'Export completed');
    } catch (error) {
      console.error('Export error:', error);
      toast.error(i18n.language === 'cs' ? 'Export se nezdařil' : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // Delete selected tests
  const deleteSelectedTests = async () => {
    if (selectedTests.size === 0) return;
    
    const confirmMsg = i18n.language === 'cs' 
      ? `Opravdu chcete smazat ${selectedTests.size} vybraných testů?`
      : `Are you sure you want to delete ${selectedTests.size} selected tests?`;
    
    if (!confirm(confirmMsg)) return;

    try {
      const { error } = await supabase
        .from('generated_tests')
        .delete()
        .in('id', Array.from(selectedTests));

      if (error) throw error;

      toast.success(i18n.language === 'cs' 
        ? `Smazáno ${selectedTests.size} testů`
        : `Deleted ${selectedTests.size} tests`);
      setSelectedTests(new Set());
      fetchData();
    } catch (error) {
      console.error('Error deleting tests:', error);
      toast.error(t('common.error'));
    }
  };

  // Delete entire suite with all its tests
  const deleteSuite = async (suiteId: string) => {
    const suite = testSuites.find(s => s.id === suiteId);
    if (!suite) return;

    const testsInSuite = tests.filter(t => t.test_suite_id === suiteId).length;
    const confirmMsg = i18n.language === 'cs' 
      ? `Opravdu chcete smazat suite "${suite.name}" a všech ${testsInSuite} testů v něm?`
      : `Are you sure you want to delete suite "${suite.name}" and all ${testsInSuite} tests in it?`;
    
    if (!confirm(confirmMsg)) return;

    try {
      // First delete all tests in the suite
      const { error: testsError } = await supabase
        .from('generated_tests')
        .delete()
        .eq('test_suite_id', suiteId);

      if (testsError) throw testsError;

      // Then delete the suite itself
      const { error: suiteError } = await supabase
        .from('test_suites')
        .delete()
        .eq('id', suiteId);

      if (suiteError) throw suiteError;

      toast.success(i18n.language === 'cs' 
        ? `Suite "${suite.name}" smazán`
        : `Suite "${suite.name}" deleted`);
      setSuiteFilter('all');
      fetchData();
    } catch (error) {
      console.error('Error deleting suite:', error);
      toast.error(t('common.error'));
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
      {/* Active Background Batches */}
      {activeBatches.length > 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-primary animate-pulse" />
              <CardTitle className="text-base">{t('tests.activeBatches')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeBatches.map((batch) => (
              <div key={batch.id} className="space-y-2 p-3 rounded-lg bg-background/50 border">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {batch.paused ? (
                      <Badge variant="secondary" className="gap-1">
                        <Pause className="h-3 w-3" />
                        {t('tests.paused')}
                      </Badge>
                    ) : (
                      <Badge className="bg-primary gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {t('tests.running')}
                      </Badge>
                    )}
                    <span>
                      {batch.completed_tests}/{batch.total_tests} {i18n.language === 'cs' ? 'testů' : 'tests'}
                    </span>
                    {batch.passed_tests > 0 && (
                      <span className="text-success">✓ {batch.passed_tests}</span>
                    )}
                    {batch.failed_tests > 0 && (
                      <span className="text-destructive">✗ {batch.failed_tests}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {batch.current_test_id && `${i18n.language === 'cs' ? 'Aktuální' : 'Current'}: ${getTestTitle(batch.current_test_id)}`}
                    </span>
                    {/* Batch controls */}
                    <div className="flex gap-1">
                      {batch.paused ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resumeBatch(batch.id)}
                          className="h-7 px-2"
                        >
                          <Play className="h-3 w-3 mr-1" />
                          {t('tests.resume')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => pauseBatch(batch.id)}
                          className="h-7 px-2"
                        >
                          <Pause className="h-3 w-3 mr-1" />
                          {t('tests.pause')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => cancelBatch(batch.id)}
                        className="h-7 px-2"
                      >
                        <Square className="h-3 w-3 mr-1" />
                        {t('tests.cancel')}
                      </Button>
                    </div>
                  </div>
                </div>
                <Progress 
                  value={(batch.completed_tests / batch.total_tests) * 100} 
                  className={`h-2 ${batch.paused ? 'opacity-50' : ''}`}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('tests.total')}</CardTitle>
            <TestTube className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('tests.pending')}</CardTitle>
            <Clock className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('tests.passed')}</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-success">{stats.passed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('tests.failed')}</CardTitle>
            <AlertTriangle className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-500">{stats.failed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('tests.error')}</CardTitle>
            <XCircle className="h-5 w-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{stats.error}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('tests.successRate')}</CardTitle>
            <TrendingUp className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.successRate}%</div>
            <Progress value={stats.successRate} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{i18n.language === 'cs' ? 'Náklady' : 'Cost'}</CardTitle>
            <DollarSign className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {i18n.language === 'cs' ? 'Ø' : 'Avg'} ${stats.avgCost.toFixed(3)}/{i18n.language === 'cs' ? 'test' : 'test'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">{t('common.filter')}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <X className="h-4 w-4 mr-1" />
                  {t('tests.resetFilters')}
                </Button>
              )}
              <Button onClick={exportToExcel} disabled={exporting || sortedTests.length === 0}>
                {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                {t('tests.exportExcel')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('tests.searchPlaceholder')}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={projectFilter} onValueChange={(v) => { setProjectFilter(v); setSuiteFilter('all'); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder={t('tests.allProjects')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('tests.allProjects')}</SelectItem>
                {projects.map(project => (
                  <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={suiteFilter} onValueChange={(v) => { setSuiteFilter(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder={i18n.language === 'cs' ? 'Všechny suites' : 'All suites'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{i18n.language === 'cs' ? 'Všechny suites' : 'All suites'}</SelectItem>
                <SelectItem value="none">{i18n.language === 'cs' ? 'Bez suite' : 'No suite'}</SelectItem>
                {filteredSuites.map(suite => (
                  <SelectItem key={suite.id} value={suite.id}>{suite.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder={t('tests.allStatuses')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('tests.allStatuses')}</SelectItem>
                <SelectItem value="pending">{t('tests.pending')}</SelectItem>
                <SelectItem value="running">{t('tests.running')}</SelectItem>
                <SelectItem value="passed">{t('tests.passed')}</SelectItem>
                <SelectItem value="failed">{t('tests.failed')}</SelectItem>
                <SelectItem value="error">{t('tests.error')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder={t('tests.allPriorities')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('tests.allPriorities')}</SelectItem>
                <SelectItem value="high">{t('priority.high')}</SelectItem>
                <SelectItem value="medium">{t('priority.medium')}</SelectItem>
                <SelectItem value="low">{t('priority.low')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <CardTitle>{t('tests.result')} ({sortedTests.length})</CardTitle>
                {selectedTests.size > 0 && (
                  <>
                    <Badge variant="secondary">{selectedTests.size} {t('tests.selected')}</Badge>
                    {selectedTests.size > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {t('tests.estimatedTimeValue', { minutes: estimatedMinutes })}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Page size selector */}
                <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">/</span>
                <span className="text-sm text-muted-foreground">{i18n.language === 'cs' ? 'stránka' : 'page'}</span>
              </div>
            </div>
            
            {/* Batch controls row */}
            <div className="flex items-center justify-between flex-wrap gap-4 pb-2 border-b">
              <div className="flex items-center gap-4">
                {/* Select all filtered button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllFiltered}
                  disabled={bulkRunning || sortedTests.length === 0}
                >
                  {selectedTests.size === sortedTests.length && sortedTests.length > 0
                    ? t('tests.deselectAll')
                    : t('tests.selectAllFiltered', { count: sortedTests.length })}
                </Button>
                
                {/* Delete selected tests */}
                {selectedTests.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={deleteSelectedTests}
                    disabled={bulkRunning}
                    className="gap-1.5"
                  >
                    <Trash2 className="h-4 w-4" />
                    {i18n.language === 'cs' ? `Smazat (${selectedTests.size})` : `Delete (${selectedTests.size})`}
                  </Button>
                )}
                
                {/* Delete entire suite */}
                {suiteFilter !== 'all' && suiteFilter !== 'none' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteSuite(suiteFilter)}
                    disabled={bulkRunning}
                    className="gap-1.5 text-destructive border-destructive/50 hover:bg-destructive/10"
                  >
                    <FolderX className="h-4 w-4" />
                    {i18n.language === 'cs' ? 'Smazat celý suite' : 'Delete entire suite'}
                  </Button>
                )}
              </div>
              
              <div className="flex items-center gap-4">
                {/* Batch size selector */}
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground whitespace-nowrap">{t('tests.batchSize')}:</Label>
                  <Select value={batchSize.toString()} onValueChange={(v) => setBatchSize(Number(v))}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Batch delay selector */}
                {backgroundMode && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground whitespace-nowrap flex items-center gap-1">
                      <ClockIcon className="h-3 w-3" />
                      {i18n.language === 'cs' ? 'Prodleva:' : 'Delay:'}
                    </Label>
                    <Select value={batchDelay.toString()} onValueChange={(v) => setBatchDelay(Number(v))}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5s</SelectItem>
                        <SelectItem value="10">10s</SelectItem>
                        <SelectItem value="15">15s</SelectItem>
                        <SelectItem value="20">20s</SelectItem>
                        <SelectItem value="30">30s</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {/* Background mode toggle */}
                <div className="flex items-center gap-2">
                  <Switch
                    id="background-mode"
                    checked={backgroundMode}
                    onCheckedChange={setBackgroundMode}
                    disabled={bulkRunning}
                  />
                  <Label 
                    htmlFor="background-mode" 
                    className="flex items-center gap-1.5 cursor-pointer text-sm"
                  >
                    {backgroundMode ? (
                      <Cloud className="h-4 w-4 text-primary" />
                    ) : (
                      <CloudOff className="h-4 w-4 text-muted-foreground" />
                    )}
                    {backgroundMode ? t('tests.backgroundMode') : t('tests.foregroundMode')}
                  </Label>
                </div>
                
                <Button 
                  onClick={runSelectedTests} 
                  disabled={bulkRunning || selectedTests.size === 0}
                  className="gap-2"
                >
                  {bulkRunning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('tests.runningTests')} {currentBulkIndex !== null ? `(${currentBulkIndex + 1}/${selectedTests.size})` : '...'}
                    </>
                  ) : backgroundMode ? (
                    <>
                      <Cloud className="h-4 w-4" />
                      {t('tests.runSelected')} ({selectedTests.size})
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      {t('tests.runSelected')} ({selectedTests.size})
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sortedTests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TestTube className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('tests.noTests')}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="p-3 w-10">
                        <Checkbox 
                          checked={paginatedTests.length > 0 && selectedTests.size === paginatedTests.length}
                          onCheckedChange={toggleSelectAll}
                          disabled={bulkRunning}
                        />
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground">ID</th>
                      <th 
                        className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('title')}
                      >
                        <div className="flex items-center gap-1">
                          {t('tests.testName')}
                          <ArrowUpDown className="h-4 w-4" />
                        </div>
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground">{t('tests.project')}</th>
                      <th 
                        className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('priority')}
                      >
                        <div className="flex items-center gap-1">
                          {t('tests.priority')}
                          <ArrowUpDown className="h-4 w-4" />
                        </div>
                      </th>
                      <th 
                        className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('status')}
                      >
                        <div className="flex items-center gap-1">
                          {t('tests.status')}
                          <ArrowUpDown className="h-4 w-4" />
                        </div>
                      </th>
                      <th 
                        className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('last_run_at')}
                      >
                        <div className="flex items-center gap-1">
                          {t('tests.lastRun')}
                          <ArrowUpDown className="h-4 w-4" />
                        </div>
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground">{t('tests.runTime')}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5" />
                          {i18n.language === 'cs' ? 'Kroky' : 'Steps'}
                        </div>
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5" />
                          {i18n.language === 'cs' ? 'Náklady' : 'Cost'}
                        </div>
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground">{t('tests.result')}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-20">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTests.map((test, index) => (
                      <tr 
                        key={test.id} 
                        className={`border-b hover:bg-muted/50 transition-colors ${
                          bulkRunning && currentBulkIndex === Array.from(selectedTests).indexOf(test.id) 
                            ? 'bg-primary/10' 
                            : ''
                        }`}
                      >
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox 
                            checked={selectedTests.has(test.id)}
                            onCheckedChange={() => toggleSelectTest(test.id)}
                            disabled={bulkRunning}
                          />
                        </td>
                        <td className="p-3 font-mono text-sm cursor-pointer hover:text-primary" onClick={() => setSelectedTest(test)}>
                          {test.azure_devops_id || test.id.substring(0, 8)}
                        </td>
                        <td className="p-3 cursor-pointer hover:text-primary" onClick={() => setSelectedTest(test)}>
                          <div className="max-w-xs truncate font-medium">{test.title}</div>
                          {getSuiteName(test.test_suite_id) && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {getSuiteName(test.test_suite_id)}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground text-sm">
                          {getProjectName(test.project_id)}
                        </td>
                        <td className="p-3">{getPriorityBadge(test.priority)}</td>
                        <td className="p-3">{getStatusBadge(test.status)}</td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {test.last_run_at 
                            ? new Date(test.last_run_at).toLocaleString(dateLocale, { 
                                day: '2-digit', 
                                month: '2-digit', 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })
                            : 'N/A'
                          }
                        </td>
                        <td className="p-3 text-sm">
                          {formatDuration(test.execution_time_ms)}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {test.step_count || '-'}
                        </td>
                        <td className="p-3 text-sm">
                          {test.estimated_cost ? (
                            <span className={`font-medium ${
                              test.estimated_cost < 0.05 ? 'text-success' : 
                              test.estimated_cost < 0.15 ? 'text-warning' : 
                              'text-destructive'
                            }`}>
                              ${test.estimated_cost.toFixed(3)}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="p-3">
                          <div className="max-w-xs truncate text-sm text-muted-foreground">
                            {test.result_summary || '-'}
                          </div>
                        </td>
                        <td className="p-3">
                          {test.task_id ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTestClick(test);
                              }}
                              className="gap-1.5 text-primary hover:text-primary"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Detail
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    {i18n.language === 'cs' ? 'Zobrazeno' : 'Showing'} {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, sortedTests.length)} {i18n.language === 'cs' ? 'z' : 'of'} {sortedTests.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      {t('common.previous')}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {i18n.language === 'cs' ? 'Stránka' : 'Page'} {page} {i18n.language === 'cs' ? 'z' : 'of'} {totalPages}
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      {t('common.next')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Test Detail Modal */}
      <Dialog open={!!selectedTest} onOpenChange={(open) => !open && setSelectedTest(null)}>
        <DialogContent className="max-w-3xl h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-start justify-between gap-4 pr-6">
              <div className="flex-1">
                <DialogTitle className="text-xl font-semibold leading-tight">
                  {selectedTest?.title}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <Hash className="w-3.5 h-3.5" />
                  <span className="font-mono">{selectedTest?.azure_devops_id || selectedTest?.id.substring(0, 8)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {selectedTest && getPriorityBadge(selectedTest.priority)}
                {selectedTest && getStatusBadge(selectedTest.status)}
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
            <div className="space-y-6 pb-4">
              {/* Metadata */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <FileText className="w-3 h-3" />
                    {i18n.language === 'cs' ? 'Projekt' : 'Project'}
                  </p>
                  <p className="text-sm font-medium">{getProjectName(selectedTest?.project_id || null)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <TestTube className="w-3 h-3" />
                    {i18n.language === 'cs' ? 'Test Suite' : 'Test Suite'}
                  </p>
                  <p className="text-sm font-medium">{getSuiteName(selectedTest?.test_suite_id || null) || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {i18n.language === 'cs' ? 'Vytvořeno' : 'Created'}
                  </p>
                  <p className="text-sm font-medium">
                    {selectedTest?.created_at 
                      ? new Date(selectedTest.created_at).toLocaleDateString(dateLocale, {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })
                      : '-'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Timer className="w-3 h-3" />
                    {i18n.language === 'cs' ? 'Poslední běh' : 'Last Run'}
                  </p>
                  <p className="text-sm font-medium">
                    {selectedTest?.last_run_at 
                      ? new Date(selectedTest.last_run_at).toLocaleString(dateLocale, {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : '-'}
                    {selectedTest?.execution_time_ms && (
                      <span className="text-muted-foreground ml-1">
                        ({formatDuration(selectedTest.execution_time_ms)})
                      </span>
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Layers className="w-3 h-3" />
                    {i18n.language === 'cs' ? 'Kroky' : 'Steps'}
                  </p>
                  <p className="text-sm font-medium">{selectedTest?.step_count || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <DollarSign className="w-3 h-3" />
                    {i18n.language === 'cs' ? 'Náklady' : 'Cost'}
                  </p>
                  <p className={`text-sm font-medium ${
                    selectedTest?.estimated_cost 
                      ? selectedTest.estimated_cost < 0.05 ? 'text-success' 
                        : selectedTest.estimated_cost < 0.15 ? 'text-warning' 
                        : 'text-destructive'
                      : ''
                  }`}>
                    {selectedTest?.estimated_cost ? `$${selectedTest.estimated_cost.toFixed(4)}` : '-'}
                  </p>
                </div>
              </div>

              {/* Prompt */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {i18n.language === 'cs' ? 'Testovací prompt' : 'Test Prompt'}
                </h4>
                <div className="p-4 bg-muted/30 rounded-lg border">
                  <p className="text-sm whitespace-pre-wrap">{selectedTest?.prompt}</p>
                </div>
              </div>

              {/* Expected Result */}
              {selectedTest?.expected_result && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {i18n.language === 'cs' ? 'Očekávaný výsledek' : 'Expected Result'}
                  </h4>
                  <div className="p-4 bg-muted/30 rounded-lg border">
                    <p className="text-sm whitespace-pre-wrap">{selectedTest.expected_result}</p>
                  </div>
                </div>
              )}

              {/* Error Alert - show prominently if result contains error */}
              {selectedTest?.result_summary && (
                selectedTest.result_summary.toLowerCase().includes('error') ||
                selectedTest.result_summary.toLowerCase().includes('chyba') ||
                selectedTest.result_summary.toLowerCase().includes('failed') ||
                selectedTest.status === 'failed'
              ) && (
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-destructive mb-1">
                      {i18n.language === 'cs' ? 'Chyba při běhu testu' : 'Test Execution Error'}
                    </h4>
                    <p className="text-sm text-destructive/90 whitespace-pre-wrap">
                      {selectedTest?.result_summary}
                    </p>
                  </div>
                </div>
              )}

              {/* Result Summary - show only if no prominent error */}
              {selectedTest?.result_summary && !(
                selectedTest.result_summary.toLowerCase().includes('error') ||
                selectedTest.result_summary.toLowerCase().includes('chyba') ||
                selectedTest.result_summary.toLowerCase().includes('failed') ||
                selectedTest.status === 'failed'
              ) && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    {i18n.language === 'cs' ? 'Výsledek posledního běhu' : 'Last Run Result'}
                  </h4>
                  <div className="p-4 bg-muted/30 rounded-lg border">
                    <StructuredResult result={selectedTest.result_summary} />
                  </div>
                </div>
              )}

              {/* Result Reasoning */}
              {selectedTest?.result_reasoning && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    {selectedTest.status === 'passed' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : selectedTest.status === 'not_passed' ? (
                      <AlertTriangle className="w-4 h-4 text-orange-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    {i18n.language === 'cs' ? 'Vyhodnocení testu' : 'Test Evaluation'}
                  </h4>
                  <div className={`p-4 rounded-lg border ${
                    selectedTest.status === 'passed' 
                      ? 'bg-green-500/10 border-green-500/30' 
                      : selectedTest.status === 'not_passed'
                      ? 'bg-orange-500/10 border-orange-500/30'
                      : 'bg-red-500/10 border-red-500/30'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{selectedTest.result_reasoning}</p>
                  </div>
                </div>
              )}

              {/* Linked Task Data */}
              {linkedTaskLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    {i18n.language === 'cs' ? 'Načítání detailů tasku...' : 'Loading task details...'}
                  </span>
                </div>
              ) : linkedTask && (
                <>
                  {/* Full Result from Task */}
                  {linkedTask.result && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        {i18n.language === 'cs' ? 'Kompletní výsledek automatizace' : 'Full Automation Result'}
                      </h4>
                      <div className="p-4 bg-muted/30 rounded-lg border max-h-64 overflow-y-auto">
                        <StructuredResult result={linkedTask.result} />
                      </div>
                    </div>
                  )}

                  {/* Error Message from Task */}
                  {linkedTask.error_message && (
                    <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-semibold text-destructive mb-1">
                          {i18n.language === 'cs' ? 'Chybová zpráva' : 'Error Message'}
                        </h4>
                        <p className="text-sm text-destructive/90 whitespace-pre-wrap">
                          {linkedTask.error_message}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Screenshots */}
                  {linkedTask.screenshots && linkedTask.screenshots.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        {i18n.language === 'cs' ? 'Screenshoty' : 'Screenshots'} ({linkedTask.screenshots.length})
                      </h4>
                      <ImageGalleryGrid images={linkedTask.screenshots} />
                    </div>
                  )}

                  {/* Recordings */}
                  {linkedTask.recordings && linkedTask.recordings.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Video className="w-4 h-4" />
                        {i18n.language === 'cs' ? 'Nahrávky' : 'Recordings'} ({linkedTask.recordings.length})
                      </h4>
                      <div className="grid grid-cols-1 gap-3">
                        {linkedTask.recordings.map((url, idx) => (
                          <video 
                            key={idx}
                            src={url} 
                            controls 
                            className="w-full rounded-lg border bg-black max-h-64"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Automation Steps */}
                  {linkedTask.steps && Array.isArray(linkedTask.steps) && linkedTask.steps.length > 0 && (
                    <Collapsible open={stepsExpanded} onOpenChange={setStepsExpanded}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-between p-4 h-auto bg-muted/30 rounded-lg border hover:bg-muted/50">
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4" />
                            <span className="text-sm font-semibold">
                              {i18n.language === 'cs' ? 'Kroky automatizace' : 'Automation Steps'} ({linkedTask.steps.length})
                            </span>
                          </div>
                          {stepsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2">
                        <div className="space-y-2 pl-2 border-l-2 border-muted ml-2">
                          {linkedTask.steps.map((step: unknown, idx: number) => {
                            const s = step as { step?: number; next_goal?: string; evaluation_previous_goal?: string; url?: string };
                            return (
                              <div key={idx} className="p-3 bg-muted/20 rounded-lg border text-sm">
                                <div className="flex items-start gap-2">
                                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium">
                                    {s.step || idx + 1}
                                  </span>
                                  <div className="flex-1 space-y-1">
                                    {s.next_goal && (
                                      <p className="font-medium">{s.next_goal}</p>
                                    )}
                                    {s.evaluation_previous_goal && (
                                      <p className="text-muted-foreground text-xs">{s.evaluation_previous_goal}</p>
                                    )}
                                    {s.url && (
                                      <p className="text-xs text-muted-foreground truncate">{s.url}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Task Timestamps */}
                  {(linkedTask.started_at || linkedTask.completed_at) && (
                    <div className="grid grid-cols-2 gap-4 p-3 bg-muted/20 rounded-lg border">
                      {linkedTask.started_at && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {i18n.language === 'cs' ? 'Zahájeno' : 'Started At'}
                          </p>
                          <p className="text-sm font-medium">
                            {new Date(linkedTask.started_at).toLocaleString(dateLocale)}
                          </p>
                        </div>
                      )}
                      {linkedTask.completed_at && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {i18n.language === 'cs' ? 'Dokončeno' : 'Completed At'}
                          </p>
                          <p className="text-sm font-medium">
                            {new Date(linkedTask.completed_at).toLocaleString(dateLocale)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="flex-shrink-0 gap-2 sm:gap-2">
              {selectedTest?.task_id && (
              <Button
                variant="outline"
                onClick={() => {
                  navigate(`/dashboard/task/${selectedTest.task_id}`);
                  setSelectedTest(null);
                }}
                className="gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                {i18n.language === 'cs' ? 'Zobrazit Task Detail' : 'View Task Detail'}
              </Button>
            )}
            <Button
              onClick={() => setSelectedTest(null)}
              variant="secondary"
            >
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
