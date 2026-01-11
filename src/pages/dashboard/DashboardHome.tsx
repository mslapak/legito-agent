import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ArrowRight,
  Activity,
  FolderOpen,
  TestTube,
} from 'lucide-react';

interface Task {
  id: string;
  title: string;
  status: string;
  created_at: string;
  project_id: string | null;
}

interface Stats {
  total: number;
  running: number;
  completed: number;
  failed: number;
}

export default function DashboardHome() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, running: 0, completed: 0, failed: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchData();
      subscribeToTasks();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const { data: tasksData, error } = await supabase
        .from('tasks')
        .select('id, title, status, created_at, project_id')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setTasks(tasksData || []);

      // Calculate stats
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('status');

      if (allTasks) {
        setStats({
          total: allTasks.length,
          running: allTasks.filter(t => t.status === 'running' || t.status === 'pending').length,
          completed: allTasks.filter(t => t.status === 'completed').length,
          failed: allTasks.filter(t => t.status === 'failed').length,
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToTasks = () => {
    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const statCards = [
    { title: t('dashboard.totalTasks'), value: stats.total, icon: Activity, color: 'text-primary' },
    { title: t('dashboard.running'), value: stats.running, icon: Loader2, color: 'text-warning' },
    { title: t('dashboard.completed'), value: stats.completed, icon: CheckCircle2, color: 'text-success' },
    { title: t('dashboard.failed'), value: stats.failed, icon: XCircle, color: 'text-destructive' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const dateLocale = i18n.language === 'cs' ? 'cs-CZ' : 'en-US';

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card 
          className="cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all group"
          onClick={() => navigate('/dashboard/new-task')}
        >
          <CardHeader>
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center mb-4 group-hover:glow transition-all">
              <Play className="w-6 h-6 text-primary-foreground" />
            </div>
            <CardTitle className="flex items-center justify-between">
              {t('dashboard.newTask')}
              <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </CardTitle>
            <CardDescription>{t('dashboard.runNewTask')}</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all group"
          onClick={() => navigate('/dashboard/test-generator')}
        >
          <CardHeader>
            <div className="w-12 h-12 rounded-xl gradient-accent flex items-center justify-center mb-4 group-hover:glow transition-all">
              <TestTube className="w-6 h-6 text-accent-foreground" />
            </div>
            <CardTitle className="flex items-center justify-between">
              {t('dashboard.testGenerator')}
              <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </CardTitle>
            <CardDescription>{t('dashboard.generateWithAI')}</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all group"
          onClick={() => navigate('/dashboard/projects')}
        >
          <CardHeader>
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-4">
              <FolderOpen className="w-6 h-6 text-secondary-foreground" />
            </div>
            <CardTitle className="flex items-center justify-between">
              {t('dashboard.projects')}
              <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </CardTitle>
            <CardDescription>{t('dashboard.manageApps')}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Recent Tasks */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t('dashboard.recentTasks')}</CardTitle>
            <CardDescription>{t('dashboard.last5Tasks')}</CardDescription>
          </div>
          <Button variant="outline" onClick={() => navigate('/dashboard/history')}>
            {t('common.viewAll')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('dashboard.noTasksYet')}</p>
              <Button 
                variant="link" 
                onClick={() => navigate('/dashboard/new-task')}
                className="mt-2"
              >
                {t('dashboard.createFirstTask')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/dashboard/task/${task.id}`)}
                >
                  <div className="space-y-1">
                    <p className="font-medium">{task.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(task.created_at).toLocaleString(dateLocale)}
                    </p>
                  </div>
                  {getStatusBadge(task.status)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
