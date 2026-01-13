import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, History, FileText, GraduationCap, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { cs, enUS } from 'date-fns/locale';

interface Task {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
}

interface Stats {
  total: number;
  running: number;
  completed: number;
  failed: number;
}

const OperationsDashboard = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, running: 0, completed: 0, failed: 0 });
  const [templateCount, setTemplateCount] = useState(0);
  const [trainingCount, setTrainingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const dateLocale = i18n.language === 'cs' ? cs : enUS;

  useEffect(() => {
    if (user) {
      fetchData();
      const channel = supabase
        .channel('operations-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchData())
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('id, title, status, created_at')
        .eq('user_id', user!.id)
        .eq('task_type', 'operation')
        .order('created_at', { ascending: false })
        .limit(5);
      setTasks(tasksData || []);

      const { data: allTasks } = await supabase
        .from('tasks')
        .select('status')
        .eq('user_id', user!.id)
        .eq('task_type', 'operation');
      
      if (allTasks) {
        setStats({
          total: allTasks.length,
          running: allTasks.filter(t => t.status === 'running').length,
          completed: allTasks.filter(t => t.status === 'completed').length,
          failed: allTasks.filter(t => t.status === 'failed').length,
        });
      }

      const { count: tplCount } = await supabase
        .from('operation_templates')
        .select('*', { count: 'exact', head: true });
      setTemplateCount(tplCount || 0);

      const { count: trnCount } = await supabase
        .from('operation_trainings')
        .select('*', { count: 'exact', head: true });
      setTrainingCount(trnCount || 0);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle className="w-3 h-3 mr-1" />{t('status.completed')}</Badge>;
      case 'running':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{t('status.running')}</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20"><XCircle className="w-3 h-3 mr-1" />{t('status.failed')}</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><Clock className="w-3 h-3 mr-1" />{t('status.pending')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('operations.totalOperations')}</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('operations.running')}</CardDescription>
            <CardTitle className="text-3xl text-blue-500">{stats.running}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('operations.completed')}</CardDescription>
            <CardTitle className="text-3xl text-green-500">{stats.completed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('operations.failed')}</CardDescription>
            <CardTitle className="text-3xl text-red-500">{stats.failed}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="hover:border-primary/50 transition-colors">
          <Link to="/dashboard/operations/new">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Play className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{t('operations.newOperation')}</CardTitle>
                  <CardDescription>{t('operations.runNew')}</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <Link to="/dashboard/operations/templates">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{t('nav.templates')}</CardTitle>
                  <CardDescription>{templateCount} {t('operations.savedTemplates')}</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <Link to="/dashboard/operations/training">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <GraduationCap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{t('nav.training')}</CardTitle>
                  <CardDescription>{trainingCount} {t('operations.trainings')}</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <Link to="/dashboard/operations/history">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <History className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{t('operations.history')}</CardTitle>
                  <CardDescription>{t('operations.viewAllOperations')}</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Link>
        </Card>
      </div>

      {/* Recent Operations */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('operations.recentOperations')}</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard/operations/history">{t('operations.viewAll')}</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Play className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('operations.noOperationsYet')}</p>
              <Button className="mt-4" asChild>
                <Link to="/dashboard/operations/new">{t('operations.startFirstOperation')}</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <Link
                  key={task.id}
                  to={`/dashboard/operations/${task.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(task.created_at), 'dd.MM.yyyy HH:mm', { locale: dateLocale })}
                    </p>
                  </div>
                  {getStatusBadge(task.status)}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OperationsDashboard;
