import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Play, Loader2, ChevronDown, Copy, Eye, EyeOff, Trash2, Plus, Save, FileText, Upload, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Json } from '@/integrations/supabase/types';

interface UploadedFile {
  name: string;
  content: string;
  type: string;
  size: number;
}

interface Step {
  step: number;
  next_goal: string;
  evaluation_previous_goal?: string;
  url?: string;
}

interface DuplicateTask {
  id: string;
  title: string;
  prompt: string;
  steps: Step[] | null;
}

interface OperationTemplate {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  steps: Step[] | null;
}

export default function NewOperation() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const duplicateFromId = searchParams.get('duplicate_from');

  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepBrowserOpen, setKeepBrowserOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [duplicateTask, setDuplicateTask] = useState<DuplicateTask | null>(null);
  const [editableSteps, setEditableSteps] = useState<Step[]>([]);
  const [stepsOpen, setStepsOpen] = useState(true);
  
  // Templates
  const [templates, setTemplates] = useState<OperationTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  
  // File uploads
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  useEffect(() => {
    if (user) {
      fetchTemplates();
    }
  }, [user]);

  useEffect(() => {
    if (duplicateFromId) {
      fetchDuplicateTask(duplicateFromId);
    }
  }, [duplicateFromId]);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from('operation_templates')
      .select('id, name, description, prompt, steps')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTemplates(data.map(t => ({
        ...t,
        steps: Array.isArray(t.steps) ? (t.steps as unknown as Step[]) : null
      })));
    }
  };

  const fetchDuplicateTask = async (taskId: string) => {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, prompt, steps')
      .eq('id', taskId)
      .single();

    if (error) {
      toast.error('Nepodařilo se načíst původní operaci');
      return;
    }

    const steps = Array.isArray(data.steps) ? (data.steps as unknown as Step[]) : null;
    setDuplicateTask({
      id: data.id,
      title: data.title,
      prompt: data.prompt,
      steps,
    });
    setEditableSteps(steps || []);
    setPrompt(data.prompt);
    setTitle(`${data.title} (kopie)`);
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId === 'none') {
      return;
    }
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setPrompt(template.prompt);
      setTitle(template.name);
      setEditableSteps(template.steps || []);
      setDuplicateTask({
        id: template.id,
        title: template.name,
        prompt: template.prompt,
        steps: template.steps,
      });
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      toast.error('Zadejte název šablony');
      return;
    }

    setSavingTemplate(true);
    try {
      const { error } = await supabase.from('operation_templates').insert({
        user_id: user!.id,
        name: templateName,
        prompt: prompt,
        steps: editableSteps.length > 0 ? editableSteps as unknown as Json : null,
      });

      if (error) throw error;

      toast.success('Šablona uložena');
      setShowSaveTemplate(false);
      setTemplateName('');
      fetchTemplates();
    } catch (error: any) {
      toast.error('Nepodařilo se uložit šablonu');
    } finally {
      setSavingTemplate(false);
    }
  };

  const updateStep = (index: number, newGoal: string) => {
    setEditableSteps(prev => prev.map((s, i) => 
      i === index ? { ...s, next_goal: newGoal } : s
    ));
  };

  const deleteStep = (index: number) => {
    setEditableSteps(prev => {
      const newSteps = prev.filter((_, i) => i !== index);
      // Reindex steps
      return newSteps.map((s, i) => ({ ...s, step: i + 1 }));
    });
  };

  const addStep = () => {
    setEditableSteps(prev => [
      ...prev,
      { step: prev.length + 1, next_goal: '' }
    ]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Soubor je příliš velký (max 10MB)');
      return;
    }

    // Check file type
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
      'application/msword', // doc
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/vnd.ms-excel', // xls
      'text/plain',
    ];
    
    if (!allowedTypes.includes(file.type)) {
      toast.error('Nepodporovaný formát souboru. Povolené: DOCX, DOC, PDF, XLSX, XLS, TXT');
      return;
    }

    // Check if file already uploaded
    if (uploadedFiles.some(f => f.name === file.name)) {
      toast.error('Soubor s tímto názvem již byl přidán');
      return;
    }

    setUploadingFile(true);
    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setUploadedFiles(prev => [...prev, { 
          name: file.name, 
          content: base64, 
          type: file.type,
          size: file.size 
        }]);
        setUploadingFile(false);
        toast.success(`Soubor ${file.name} připraven k nahrání`);
      };
      reader.onerror = () => {
        toast.error('Nepodařilo se načíst soubor');
        setUploadingFile(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('File read error:', error);
      toast.error('Nepodařilo se načíst soubor');
      setUploadingFile(false);
    }
    
    // Reset input
    e.target.value = '';
  };

  const removeFile = (fileName: string) => {
    setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prompt.trim()) {
      toast.error('Zadejte instrukce pro operaci');
      return;
    }

    if (!user) {
      toast.error('Musíte být přihlášeni');
      return;
    }

    setLoading(true);

    try {
      // Upload files first if any
      const uploadedFileNames: string[] = [];
      if (uploadedFiles.length > 0) {
        toast.info('Nahrávám soubory...');
        for (const file of uploadedFiles) {
          const { data: uploadData, error: uploadError } = await supabase.functions.invoke('browser-use', {
            body: {
              action: 'upload_file',
              fileName: file.name,
              fileBase64: file.content,
              contentType: file.type,
            },
          });

          if (uploadError) {
            throw new Error(`Nepodařilo se nahrát soubor ${file.name}`);
          }
          uploadedFileNames.push(file.name);
        }
        toast.success('Soubory nahrány');
      }

      // Build prompt with credentials and file info
      let fullPrompt = prompt;
      
      // Add file info to prompt
      if (uploadedFileNames.length > 0) {
        const fileList = uploadedFileNames.map(f => `"${f}"`).join(', ');
        fullPrompt = `Máš k dispozici soubory: ${fileList}. Tyto soubory můžeš použít pro import/upload na webové stránce.\n\n${fullPrompt}`;
      }
      
      if (username && password) {
        fullPrompt = `Credentials for login:\nUsername: ${username}\nPassword: ${password}\n\n${fullPrompt}`;
      }

      const { data, error } = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'create_task',
          prompt: fullPrompt,
          title: title || 'Operace v Legito',
          userId: user.id,
          keepBrowserOpen,
          taskType: 'operation',
          includedFiles: uploadedFileNames.length > 0 ? uploadedFileNames : undefined,
        },
      });

      if (error) throw error;

      const taskId = data.task?.id;
      if (!taskId) {
        throw new Error('Task nebyl vytvořen správně');
      }

      // Wait for task to be saved to database before navigating
      let attempts = 0;
      while (attempts < 10) {
        const { data: taskExists } = await supabase
          .from('tasks')
          .select('id')
          .eq('id', taskId)
          .maybeSingle();
        
        if (taskExists) break;
        await new Promise(resolve => setTimeout(resolve, 300));
        attempts++;
      }

      toast.success('Operace spuštěna');
      navigate(`/dashboard/operations/${taskId}`);
    } catch (error: any) {
      console.error('Error creating operation:', error);
      toast.error(error.message || 'Nepodařilo se spustit operaci');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Template selector */}
      {templates.length > 0 && !duplicateFromId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Šablony operací
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Vyberte šablonu..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-- Nová operace --</SelectItem>
                {templates.map(template => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Duplicate/Template info with editable steps */}
      {(duplicateTask || editableSteps.length > 0) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Copy className="h-4 w-4" />
                {duplicateTask ? `Duplikace z: ${duplicateTask.title}` : 'Kroky operace'}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSaveTemplate(!showSaveTemplate)}
              >
                <Save className="h-4 w-4 mr-1" />
                Uložit jako šablonu
              </Button>
            </div>
            <CardDescription>
              Upravte kroky nebo prompt podle potřeby
            </CardDescription>
          </CardHeader>
          
          {showSaveTemplate && (
            <CardContent className="pt-0 pb-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Název šablony..."
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <Button onClick={handleSaveAsTemplate} disabled={savingTemplate}>
                  {savingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Uložit'}
                </Button>
              </div>
            </CardContent>
          )}
          
          {editableSteps.length > 0 && (
            <CardContent className="pt-0">
              <Collapsible open={stepsOpen} onOpenChange={setStepsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between">
                    Kroky ({editableSteps.length})
                    <ChevronDown className={`h-4 w-4 transition-transform ${stepsOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 space-y-3 max-h-80 overflow-y-auto pr-2">
                    {editableSteps.map((step, index) => (
                      <div key={index} className="p-3 rounded-lg bg-muted/50 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-medium text-muted-foreground shrink-0 pt-2">
                            Krok {step.step}
                          </span>
                          <Textarea
                            value={step.next_goal}
                            onChange={(e) => updateStep(index, e.target.value)}
                            className="min-h-[60px] text-sm"
                            placeholder="Co má tento krok udělat..."
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-destructive hover:text-destructive"
                            onClick={() => deleteStep(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {step.evaluation_previous_goal && (
                          <p className="text-xs text-muted-foreground ml-12">
                            Výsledek: {step.evaluation_previous_goal}
                          </p>
                        )}
                        {step.url && (
                          <p className="text-xs text-muted-foreground ml-12">
                            URL: {step.url}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3"
                    onClick={addStep}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Přidat krok
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nová operace</CardTitle>
          <CardDescription>
            Zadejte instrukce pro Browser-Use AI agenta. Např. "Přihlaš se do Legito, otevři dashboard, vytvoř nový template..."
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Název operace (volitelné)</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Např. Vytvoření nového template"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">Instrukce *</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Přihlaš se do Legito na adrese https://..., otevři dashboard, klikni na Templates, vytvoř nový template s názvem..."
                rows={6}
                className="resize-none"
              />
            </div>

            {/* File upload section */}
            <div className="space-y-3">
              <Label>Soubory k nahrání (volitelné)</Label>
              <p className="text-xs text-muted-foreground">
                Nahrajte dokumenty (DOCX, PDF, XLSX atd.), které agent použije pro import na webové stránce.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".docx,.doc,.pdf,.xlsx,.xls,.txt"
                  onChange={handleFileUpload}
                  disabled={uploadingFile}
                  className="flex-1"
                />
                {uploadingFile && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
              {uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {uploadedFiles.map(file => (
                    <Badge 
                      key={file.name} 
                      variant="secondary" 
                      className="flex items-center gap-1 pr-1"
                    >
                      <Upload className="h-3 w-3" />
                      {file.name}
                      <span className="text-xs text-muted-foreground ml-1">
                        ({formatFileSize(file.size)})
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 ml-1 hover:bg-destructive/20"
                        onClick={() => removeFile(file.name)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="w-full justify-between">
                  Přihlašovací údaje (volitelné)
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Uživatelské jméno / Email</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Heslo</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="keepBrowserOpen"
                checked={keepBrowserOpen}
                onCheckedChange={(checked) => setKeepBrowserOpen(checked as boolean)}
              />
              <Label htmlFor="keepBrowserOpen" className="text-sm font-normal cursor-pointer">
                Nechat prohlížeč otevřený (pro interaktivní práci)
              </Label>
            </div>

            <Button type="submit" className="w-full" disabled={loading || !prompt.trim()}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Spouštím...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Spustit operaci
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}