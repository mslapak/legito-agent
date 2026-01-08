import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
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
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

interface GeneratedTest {
  id: string;
  title: string;
  prompt: string;
  expected_result: string | null;
  priority: string;
  status: string;
  azure_devops_id: string | null;
  project_id: string | null;
  created_at: string;
  last_run_at: string | null;
  execution_time_ms: number | null;
  result_summary: string | null;
  result_reasoning: string | null;
}

interface Project {
  id: string;
  name: string;
}

interface Stats {
  total: number;
  pending: number;
  running: number;
  passed: number;
  failed: number;
  successRate: number;
}

type SortField = 'title' | 'status' | 'priority' | 'last_run_at' | 'created_at';
type SortOrder = 'asc' | 'desc';

export default function TestsDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tests, setTests] = useState<GeneratedTest[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [testsResult, projectsResult] = await Promise.all([
        supabase
          .from('generated_tests')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('projects')
          .select('id, name')
          .order('name'),
      ]);

      if (testsResult.error) throw testsResult.error;
      if (projectsResult.error) throw projectsResult.error;

      setTests(testsResult.data || []);
      setProjects(projectsResult.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Nepodařilo se načíst data');
    } finally {
      setLoading(false);
    }
  };

  const stats: Stats = useMemo(() => {
    const total = tests.length;
    const pending = tests.filter(t => t.status === 'pending').length;
    const running = tests.filter(t => t.status === 'running').length;
    const passed = tests.filter(t => t.status === 'passed').length;
    const failed = tests.filter(t => t.status === 'failed').length;
    const executed = passed + failed;
    const successRate = executed > 0 ? Math.round((passed / executed) * 100) : 0;

    return { total, pending, running, passed, failed, successRate };
  }, [tests]);

  const filteredTests = useMemo(() => {
    return tests.filter(test => {
      const matchesSearch = !search || 
        test.title.toLowerCase().includes(search.toLowerCase()) ||
        test.prompt.toLowerCase().includes(search.toLowerCase()) ||
        (test.azure_devops_id && test.azure_devops_id.toLowerCase().includes(search.toLowerCase()));
      
      const matchesProject = projectFilter === 'all' || test.project_id === projectFilter;
      const matchesStatus = statusFilter === 'all' || test.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || test.priority === priorityFilter;

      return matchesSearch && matchesProject && matchesStatus && matchesPriority;
    });
  }, [tests, search, projectFilter, statusFilter, priorityFilter]);

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
    if (!projectId) return 'Bez projektu';
    return projects.find(p => p.id === projectId)?.name || 'Neznámý projekt';
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
        return <Badge variant="destructive">Vysoká</Badge>;
      case 'medium':
        return <Badge variant="secondary">Střední</Badge>;
      case 'low':
        return <Badge variant="outline">Nízká</Badge>;
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
    setStatusFilter('all');
    setPriorityFilter('all');
    setPage(1);
  };

  const hasActiveFilters = search || projectFilter !== 'all' || statusFilter !== 'all' || priorityFilter !== 'all';

  const exportToExcel = async () => {
    setExporting(true);
    try {
      const data = sortedTests.map(test => ({
        'ID': test.azure_devops_id || test.id.substring(0, 8),
        'Title': test.title,
        'Test Step': '1',
        'Step Action': test.prompt,
        'Step Expected': test.expected_result || '',
        'Priority': test.priority === 'high' ? 'Vysoká' : test.priority === 'medium' ? 'Střední' : 'Nízká',
        'Status': test.status === 'passed' ? 'Prošel' : test.status === 'failed' ? 'Selhal' : test.status === 'running' ? 'Běží' : 'Čeká',
        'Last Run': test.last_run_at ? new Date(test.last_run_at).toLocaleString('cs-CZ') : 'N/A',
        'Duration': formatDuration(test.execution_time_ms),
        'Result': test.result_summary || '',
        'Reasoning': test.result_reasoning || '',
        'Project': getProjectName(test.project_id),
        'Created': new Date(test.created_at).toLocaleString('cs-CZ'),
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
      toast.success('Export dokončen');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Export se nezdařil');
    } finally {
      setExporting(false);
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
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Celkem testů</CardTitle>
            <TestTube className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Čeká na spuštění</CardTitle>
            <Clock className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Prošlo</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-success">{stats.passed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Selhalo</CardTitle>
            <XCircle className="h-5 w-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{stats.failed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Úspěšnost</CardTitle>
            <TrendingUp className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.successRate}%</div>
            <Progress value={stats.successRate} className="mt-2 h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Filtry</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Resetovat
                </Button>
              )}
              <Button onClick={exportToExcel} disabled={exporting || sortedTests.length === 0}>
                {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Exportovat do Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Hledat test..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={projectFilter} onValueChange={(v) => { setProjectFilter(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Všechny projekty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny projekty</SelectItem>
                {projects.map(project => (
                  <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Všechny stavy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny stavy</SelectItem>
                <SelectItem value="pending">Čeká</SelectItem>
                <SelectItem value="running">Běží</SelectItem>
                <SelectItem value="passed">Prošel</SelectItem>
                <SelectItem value="failed">Selhal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Všechny priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny priority</SelectItem>
                <SelectItem value="high">Vysoká</SelectItem>
                <SelectItem value="medium">Střední</SelectItem>
                <SelectItem value="low">Nízká</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Výsledky testů ({sortedTests.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {sortedTests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TestTube className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Žádné testy nebyly nalezeny</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">ID</th>
                      <th 
                        className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('title')}
                      >
                        <div className="flex items-center gap-1">
                          Název testu
                          <ArrowUpDown className="h-4 w-4" />
                        </div>
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Projekt</th>
                      <th 
                        className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('priority')}
                      >
                        <div className="flex items-center gap-1">
                          Priorita
                          <ArrowUpDown className="h-4 w-4" />
                        </div>
                      </th>
                      <th 
                        className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('status')}
                      >
                        <div className="flex items-center gap-1">
                          Status
                          <ArrowUpDown className="h-4 w-4" />
                        </div>
                      </th>
                      <th 
                        className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('last_run_at')}
                      >
                        <div className="flex items-center gap-1">
                          Poslední běh
                          <ArrowUpDown className="h-4 w-4" />
                        </div>
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Čas běhu</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Výsledek</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTests.map(test => (
                      <tr 
                        key={test.id} 
                        className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/dashboard/projects`)}
                      >
                        <td className="p-3 font-mono text-sm">
                          {test.azure_devops_id || test.id.substring(0, 8)}
                        </td>
                        <td className="p-3">
                          <div className="max-w-xs truncate font-medium">{test.title}</div>
                        </td>
                        <td className="p-3 text-muted-foreground text-sm">
                          {getProjectName(test.project_id)}
                        </td>
                        <td className="p-3">{getPriorityBadge(test.priority)}</td>
                        <td className="p-3">{getStatusBadge(test.status)}</td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {test.last_run_at 
                            ? new Date(test.last_run_at).toLocaleString('cs-CZ', { 
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
                        <td className="p-3">
                          <div className="max-w-xs truncate text-sm text-muted-foreground">
                            {test.result_summary || '-'}
                          </div>
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
                    Zobrazeno {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, sortedTests.length)} z {sortedTests.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Předchozí
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Stránka {page} z {totalPages}
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Další
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
