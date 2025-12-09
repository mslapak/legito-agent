import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { cs } from 'date-fns/locale';
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Save as template dialog
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

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
      toast.error('Nepodařilo se načíst operace');
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
      toast.error('Nepodařilo se smazat operaci');
    } else {
      toast.success('Operace smazána');
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
      toast.error('Zadejte název šablony');
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

      toast.success('Šablona uložena');
      setSaveTemplateOpen(false);
      setSelectedOperation(null);
      setTemplateName('');
    } catch (error: any) {
      toast.error('Nepodařilo se uložit šablonu');
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
          <Badge variant="default" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
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
            placeholder="Hledat operace..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Vše</SelectItem>
            <SelectItem value="pending">Čeká</SelectItem>
            <SelectItem value="running">Běží</SelectItem>
            <SelectItem value="completed">Dokončeno</SelectItem>
            <SelectItem value="failed">Chyba</SelectItem>
            <SelectItem value="cancelled">Zrušeno</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredOperations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Žádné operace nenalezeny</p>
            <Button
              variant="link"
              onClick={() => navigate('/dashboard/operations/new')}
              className="mt-2"
            >
              Vytvořit novou operaci
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
                          {getStepsCount(operation.steps)} kroků
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{operation.prompt}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {format(new Date(operation.created_at), 'PPp', { locale: cs })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openSaveTemplateDialog(operation)}
                      title="Uložit jako šablonu"
                    >
                      <Save className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">Šablona</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/dashboard/operations/new?duplicate_from=${operation.id}`)}
                    >
                      <Copy className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">Duplikovat</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/dashboard/operations/${operation.id}`)}
                    >
                      <Eye className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">Detail</span>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Smazat operaci?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tato akce je nevratná. Operace bude trvale smazána.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Zrušit</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(operation.id)}>
                            Smazat
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
            <DialogTitle>Uložit jako šablonu</DialogTitle>
            <DialogDescription>
              Uložte tuto operaci jako šablonu pro opakované použití.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Název šablony</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Např. Vytvoření template v Legito"
              />
            </div>
            {selectedOperation && getStepsCount(selectedOperation.steps) > 0 && (
              <p className="text-sm text-muted-foreground">
                Šablona bude obsahovat {getStepsCount(selectedOperation.steps)} kroků.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateOpen(false)}>
              Zrušit
            </Button>
            <Button onClick={handleSaveAsTemplate} disabled={savingTemplate}>
              {savingTemplate ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Uložit šablonu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}