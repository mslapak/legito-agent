import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Search,
  Loader2,
  Eye,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Play,
  Ban,
  Copy,
  Save,
} from 'lucide-react';
import { format } from 'date-fns';
import { cs, enUS } from 'date-fns/locale';
import type { Json } from '@/integrations/supabase/types';

interface Operation {
  id: string;
  title: string;
  prompt: string;
  status: string;
  steps: Json | null;
  created_at: string;
  completed_at: string | null;
}

export default function OperationHistory() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const dateLocale = i18n.language === 'cs' ? cs : enUS;

  useEffect(() => {
    if (user) {
      fetchOperations();
      const channel = subscribeToOperations();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchOperations = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, prompt, status, steps, created_at, completed_at')
      .eq('user_id', user!.id)
      .eq('task_type', 'operation')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error(t('operations.loadFailed'));
      console.error(error);
    } else {
      setOperations(data || []);
    }
    setLoading(false);
  };

  const subscribeToOperations = () => {
    return supabase
      .channel('operations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `task_type=eq.operation`,
        },
        () => {
          fetchOperations();
        }
      )
      .subscribe();
  };

  const handleDelete = async (operationId: string) => {
    const { error } = await supabase.from('tasks').delete().eq('id', operationId);

    if (error) {
      toast.error(t('operations.deleteFailed'));
    } else {
      toast.success(t('operations.operationDeleted'));
      fetchOperations();
    }
  };

  const openSaveTemplateDialog = (operation: Operation) => {
    setSelectedOperation(operation);
    setTemplateName(operation.title);
    setSaveTemplateOpen(true);
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim() || !selectedOperation) {
      toast.error(t('operations.enterTemplateName'));
      return;
    }

    setSavingTemplate(true);
    try {
      const { error } = await supabase.from('operation_templates').insert({
        user_id: user!.id,
        name: templateName,
        prompt: selectedOperation.prompt,
        steps: selectedOperation.steps,
      });

      if (error) throw error;

      toast.success(t('operations.templateSaved'));
      setSaveTemplateOpen(false);
      setSelectedOperation(null);
      setTemplateName('');
    } catch (error: any) {
      toast.error(t('operations.templateSaveFailed'));
    } finally {
      setSavingTemplate(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-500/10 text-green-500 border-green-500/20">
            <CheckCircle className="w-3 h-3 mr-1" />
            {t('status.completed')}
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            {t('operations.error')}
          </Badge>
        );
      case 'running':
        return (
          <Badge variant="default" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
            <Play className="w-3 h-3 mr-1" />
            {t('status.running')}
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge variant="secondary">
            <Ban className="w-3 h-3 mr-1" />
            {t('status.cancelled')}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Clock className="w-3 h-3 mr-1" />
            {t('status.pending')}
          </Badge>
        );
    }
  };

  const getStepsCount = (steps: Json | null): number => {
    if (!steps || !Array.isArray(steps)) return 0;
    return steps.length;
  };

  const filteredOperations = operations.filter((op) => {
    const matchesSearch =
      op.title.toLowerCase().includes(search.toLowerCase()) ||
      op.prompt.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || op.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('operations.searchOperations')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder={t('tests.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('operations.all')}</SelectItem>
            <SelectItem value="pending">{t('operations.waiting')}</SelectItem>
            <SelectItem value="running">{t('status.running')}</SelectItem>
            <SelectItem value="completed">{t('status.completed')}</SelectItem>
            <SelectItem value="failed">{t('operations.error')}</SelectItem>
            <SelectItem value="cancelled">{t('status.cancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredOperations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('operations.noOperationsFound')}</p>
            <Button
              variant="link"
              onClick={() => navigate('/dashboard/operations/new')}
              className="mt-2"
            >
              {t('operations.createNewOperation')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOperations.map((operation) => (
            <Card key={operation.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate">{operation.title}</h3>
                      {getStatusBadge(operation.status)}
                      {getStepsCount(operation.steps) > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {getStepsCount(operation.steps)} {t('operations.steps')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{operation.prompt}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {format(new Date(operation.created_at), 'PPp', { locale: dateLocale })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openSaveTemplateDialog(operation)}
                      title={t('operations.saveAsTemplate')}
                    >
                      <Save className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">{t('nav.templates')}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/dashboard/operations/new?duplicate_from=${operation.id}`)}
                    >
                      <Copy className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">{t('operations.duplicate')}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/dashboard/operations/${operation.id}`)}
                    >
                      <Eye className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">{t('operations.detail')}</span>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('operations.deleteOperation')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('operations.deleteOperationConfirm')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(operation.id)}>
                            {t('common.delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Save as Template Dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('operations.saveAsTemplate')}</DialogTitle>
            <DialogDescription>
              {t('operations.saveTemplateDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">{t('operations.templateName')}</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t('operations.templateNamePlaceholder')}
              />
            </div>
            {selectedOperation && getStepsCount(selectedOperation.steps) > 0 && (
              <p className="text-sm text-muted-foreground">
                {t('operations.templateWillContain', { count: getStepsCount(selectedOperation.steps) })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveAsTemplate} disabled={savingTemplate}>
              {savingTemplate ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t('operations.saveTemplate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
