import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { FileText, Pencil, Trash2, Play, ChevronDown, ChevronRight, Clock, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { Json } from '@/integrations/supabase/types';

interface Step {
  step: number;
  next_goal: string;
  evaluation_previous_goal?: string;
  url?: string;
}

interface OperationTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  prompt: string;
  steps: Json;
  created_at: string;
  updated_at: string;
}

export default function OperationTemplates() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [editingTemplate, setEditingTemplate] = useState<OperationTemplate | null>(null);
  const [deleteTemplate, setDeleteTemplate] = useState<OperationTemplate | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editSteps, setEditSteps] = useState<Step[]>([]);
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());

  const { data: templates, isLoading } = useQuery({
    queryKey: ['operation-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operation_templates')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as OperationTemplate[];
    },
    enabled: !!user,
  });

  const updateMutation = useMutation({
    mutationFn: async (template: { id: string; name: string; description: string; prompt: string; steps: Step[] }) => {
      const { error } = await supabase
        .from('operation_templates')
        .update({
          name: template.name,
          description: template.description,
          prompt: template.prompt,
          steps: template.steps as unknown as Json,
        })
        .eq('id', template.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operation-templates'] });
      toast.success('Šablona byla aktualizována');
      setEditingTemplate(null);
    },
    onError: () => {
      toast.error('Nepodařilo se aktualizovat šablonu');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('operation_templates')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operation-templates'] });
      toast.success('Šablona byla smazána');
      setDeleteTemplate(null);
    },
    onError: () => {
      toast.error('Nepodařilo se smazat šablonu');
    },
  });

  const openEditDialog = (template: OperationTemplate) => {
    setEditingTemplate(template);
    setEditName(template.name);
    setEditDescription(template.description || '');
    setEditPrompt(template.prompt);
    const steps = Array.isArray(template.steps) ? template.steps as unknown as Step[] : [];
    setEditSteps(steps);
  };

  const handleSaveEdit = () => {
    if (!editingTemplate) return;
    updateMutation.mutate({
      id: editingTemplate.id,
      name: editName,
      description: editDescription,
      prompt: editPrompt,
      steps: editSteps,
    });
  };

  const handleUseTemplate = (template: OperationTemplate) => {
    navigate(`/dashboard/operations/new?template=${template.id}`);
  };

  const toggleExpanded = (id: string) => {
    setExpandedTemplates(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const updateEditStep = (index: number, field: keyof Step, value: string | number) => {
    setEditSteps(prev => prev.map((s, i) => 
      i === index ? { ...s, [field]: value } : s
    ));
  };

  const deleteEditStep = (index: number) => {
    setEditSteps(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, step: i + 1 })));
  };

  const addEditStep = () => {
    setEditSteps(prev => [...prev, { step: prev.length + 1, next_goal: '' }]);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Šablony operací</h2>
          <p className="text-muted-foreground">Spravujte uložené šablony pro rychlé spouštění operací</p>
        </div>
      </div>

      {!templates?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Žádné šablony</h3>
            <p className="text-muted-foreground mb-4">
              Zatím nemáte žádné uložené šablony. Vytvořte šablonu z historie operací.
            </p>
            <Button onClick={() => navigate('/dashboard/operations/history')}>
              Přejít na historii operací
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {templates.map((template) => {
            const steps = Array.isArray(template.steps) ? template.steps as unknown as Step[] : [];
            const isExpanded = expandedTemplates.has(template.id);

            return (
              <Card key={template.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      {template.description && (
                        <CardDescription className="mt-1">{template.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUseTemplate(template)}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Použít
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(template)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTemplate(template)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {format(new Date(template.created_at), 'dd. MMM yyyy', { locale: cs })}
                    </div>
                    <div className="flex items-center gap-1">
                      <Layers className="h-4 w-4" />
                      {steps.length} kroků
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-sm font-medium mb-1">Prompt:</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">{template.prompt}</p>
                  </div>

                  {steps.length > 0 && (
                    <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(template.id)}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between">
                          <span>Kroky ({steps.length})</span>
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 space-y-2">
                        {steps.map((step, index) => (
                          <div key={index} className="bg-muted/30 rounded-lg p-3 text-sm">
                            <div className="flex items-start gap-2">
                              <Badge variant="outline" className="shrink-0">
                                {step.step}
                              </Badge>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium">{step.next_goal}</p>
                                {step.evaluation_previous_goal && (
                                  <p className="text-muted-foreground text-xs mt-1">
                                    {step.evaluation_previous_goal}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upravit šablonu</DialogTitle>
            <DialogDescription>
              Upravte název, popis, prompt a kroky šablony
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Název</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Popis</Label>
              <Input
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Volitelný popis šablony"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-prompt">Prompt</Label>
              <Textarea
                id="edit-prompt"
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Kroky ({editSteps.length})</Label>
                <Button type="button" variant="outline" size="sm" onClick={addEditStep}>
                  Přidat krok
                </Button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {editSteps.map((step, index) => (
                  <div key={index} className="flex items-start gap-2 bg-muted/30 rounded-lg p-3">
                    <Badge variant="outline" className="shrink-0 mt-1">
                      {step.step}
                    </Badge>
                    <div className="flex-1">
                      <Input
                        value={step.next_goal}
                        onChange={(e) => updateEditStep(index, 'next_goal', e.target.value)}
                        placeholder="Cíl kroku"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteEditStep(index)}
                      className="text-destructive hover:text-destructive shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>
              Zrušit
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Ukládám...' : 'Uložit změny'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTemplate} onOpenChange={(open) => !open && setDeleteTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Smazat šablonu?</AlertDialogTitle>
            <AlertDialogDescription>
              Opravdu chcete smazat šablonu "{deleteTemplate?.name}"? Tuto akci nelze vrátit zpět.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTemplate && deleteMutation.mutate(deleteTemplate.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Smazat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
