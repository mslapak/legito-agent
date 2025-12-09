import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GraduationCap, Upload, Link as LinkIcon, FileText, Trash2, Eye, Loader2, Sparkles, Plus, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';

interface Training {
  id: string;
  name: string;
  description: string | null;
  source_type: string;
  source_content: string | null;
  structured_instructions: any;
  created_at: string;
}

const OperationTraining = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedTraining, setSelectedTraining] = useState<Training | null>(null);
  const [isStructuring, setIsStructuring] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceContent, setSourceContent] = useState('');
  const [sourceType, setSourceType] = useState<'text' | 'file'>('text');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) fetchTrainings();
  }, [user]);

  const fetchTrainings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('operation_trainings')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setTrainings(data || []);
    } catch (error) {
      console.error('Error fetching trainings:', error);
      toast({ title: 'Chyba', description: 'Nepodařilo se načíst školení', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setSourceContent(content);
      if (!name) setName(file.name.replace(/\.[^/.]+$/, ''));
    };
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !sourceContent.trim()) {
      toast({ title: 'Chyba', description: 'Vyplňte název a obsah', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('operation_trainings').insert({
        user_id: user!.id,
        name: name.trim(),
        description: description.trim() || null,
        source_type: sourceType,
        source_content: sourceContent,
      });

      if (error) throw error;

      toast({ title: 'Úspěch', description: 'Školení bylo přidáno' });
      setIsDialogOpen(false);
      setName('');
      setDescription('');
      setSourceContent('');
      fetchTrainings();
    } catch (error) {
      console.error('Error creating training:', error);
      toast({ title: 'Chyba', description: 'Nepodařilo se vytvořit školení', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStructure = async (training: Training) => {
    setIsStructuring(training.id);
    try {
      const { data, error } = await supabase.functions.invoke('structure-training', {
        body: { content: training.source_content, name: training.name }
      });

      if (error) throw error;

      await supabase
        .from('operation_trainings')
        .update({ structured_instructions: data.instructions })
        .eq('id', training.id);

      toast({ title: 'Úspěch', description: 'Instrukce byly strukturovány' });
      fetchTrainings();
    } catch (error) {
      console.error('Error structuring training:', error);
      toast({ title: 'Chyba', description: 'Nepodařilo se strukturovat instrukce', variant: 'destructive' });
    } finally {
      setIsStructuring(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('operation_trainings').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Smazáno', description: 'Školení bylo odstraněno' });
      fetchTrainings();
    } catch (error) {
      console.error('Error deleting training:', error);
      toast({ title: 'Chyba', description: 'Nepodařilo se smazat školení', variant: 'destructive' });
    }
  };

  const viewTraining = (training: Training) => {
    setSelectedTraining(training);
    setIsViewDialogOpen(true);
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Školící dokumentace</h2>
          <p className="text-muted-foreground">Návody a tréninky pro automatizaci operací</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Přidat školení</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nové školení</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Název</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Např. Jak vytvořit šablonu" />
              </div>
              <div className="space-y-2">
                <Label>Popis (volitelné)</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Krátký popis školení" />
              </div>
              <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as 'text' | 'file')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="text"><FileText className="w-4 h-4 mr-2" />Text</TabsTrigger>
                  <TabsTrigger value="file"><Upload className="w-4 h-4 mr-2" />Soubor</TabsTrigger>
                </TabsList>
                <TabsContent value="text" className="mt-4">
                  <Textarea
                    value={sourceContent}
                    onChange={(e) => setSourceContent(e.target.value)}
                    placeholder="Vložte obsah školení..."
                    rows={10}
                  />
                </TabsContent>
                <TabsContent value="file" className="mt-4">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <Upload className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground mb-4">Nahrajte TXT nebo MD soubor</p>
                    <Input type="file" accept=".txt,.md" onChange={handleFileUpload} className="max-w-xs mx-auto" />
                    {sourceContent && (
                      <p className="mt-4 text-sm text-green-500"><Check className="w-4 h-4 inline mr-1" />Soubor načten ({sourceContent.length} znaků)</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Zrušit</Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Uložit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {trainings.length === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center">
            <GraduationCap className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-semibold mb-2">Zatím žádná školení</h3>
            <p className="text-muted-foreground mb-4">Přidejte návody a tréninky pro automatizaci operací</p>
            <Button onClick={() => setIsDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />Přidat první školení</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {trainings.map((training) => (
            <Card key={training.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{training.name}</CardTitle>
                    {training.description && <CardDescription>{training.description}</CardDescription>}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline">
                        {training.source_type === 'file' ? <Upload className="w-3 h-3 mr-1" /> : <FileText className="w-3 h-3 mr-1" />}
                        {training.source_type === 'file' ? 'Soubor' : 'Text'}
                      </Badge>
                      {training.structured_instructions ? (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                          <Check className="w-3 h-3 mr-1" />
                          Strukturováno ({Array.isArray(training.structured_instructions) ? training.structured_instructions.length : 0} kroků)
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Čeká na strukturování</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(training.created_at), 'dd.MM.yyyy', { locale: cs })}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => viewTraining(training)}>
                      <Eye className="w-4 h-4 mr-1" />Zobrazit
                    </Button>
                    {!training.structured_instructions && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStructure(training)}
                        disabled={isStructuring === training.id}
                      >
                        {isStructuring === training.id ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4 mr-1" />
                        )}
                        Strukturovat
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm"><Trash2 className="w-4 h-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Smazat školení?</AlertDialogTitle>
                          <AlertDialogDescription>Tato akce je nevratná.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Zrušit</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(training.id)}>Smazat</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTraining?.name}</DialogTitle>
          </DialogHeader>
          {selectedTraining && (
            <div className="space-y-4">
              {selectedTraining.description && (
                <p className="text-muted-foreground">{selectedTraining.description}</p>
              )}
              
              <div>
                <h4 className="font-semibold mb-2">Zdrojový obsah</h4>
                <div className="bg-muted p-4 rounded-lg max-h-60 overflow-y-auto">
                  <pre className="text-sm whitespace-pre-wrap">{selectedTraining.source_content}</pre>
                </div>
              </div>

              {selectedTraining.structured_instructions && (
                <div>
                  <h4 className="font-semibold mb-2">Strukturované instrukce</h4>
                  <div className="space-y-2">
                    {Array.isArray(selectedTraining.structured_instructions) ? (
                      selectedTraining.structured_instructions.map((step: any, index: number) => (
                        <div key={index} className="flex gap-3 p-3 bg-muted rounded-lg">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-medium">{step.title || step.action || `Krok ${index + 1}`}</p>
                            {step.description && <p className="text-sm text-muted-foreground">{step.description}</p>}
                          </div>
                        </div>
                      ))
                    ) : (
                      <pre className="text-sm bg-muted p-4 rounded-lg overflow-x-auto">
                        {JSON.stringify(selectedTraining.structured_instructions, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OperationTraining;
