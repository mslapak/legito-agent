import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Play, Loader2, ChevronDown, Copy, Eye, EyeOff, Trash2, Plus, Save, FileText, Upload, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Json } from '@/integrations/supabase/types';

interface UploadedFile { name: string; content: string; type: string; size: number; }
interface Step { step: number; next_goal: string; evaluation_previous_goal?: string; url?: string; }
interface DuplicateTask { id: string; title: string; prompt: string; steps: Step[] | null; }
interface OperationTemplate { id: string; name: string; description: string | null; prompt: string; steps: Step[] | null; }

export default function NewOperation() {
  const { t } = useTranslation();
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
  const [templates, setTemplates] = useState<OperationTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  useEffect(() => { if (user) fetchTemplates(); }, [user]);
  useEffect(() => { if (duplicateFromId) fetchDuplicateTask(duplicateFromId); }, [duplicateFromId]);

  const fetchTemplates = async () => {
    const { data } = await supabase.from('operation_templates').select('id, name, description, prompt, steps').eq('user_id', user!.id).order('created_at', { ascending: false });
    if (data) setTemplates(data.map(t => ({ ...t, steps: Array.isArray(t.steps) ? (t.steps as unknown as Step[]) : null })));
  };

  const fetchDuplicateTask = async (taskId: string) => {
    const { data, error } = await supabase.from('tasks').select('id, title, prompt, steps').eq('id', taskId).single();
    if (error) { toast.error(t('operations.loadOriginalFailed')); return; }
    const steps = Array.isArray(data.steps) ? (data.steps as unknown as Step[]) : null;
    setDuplicateTask({ id: data.id, title: data.title, prompt: data.prompt, steps });
    setEditableSteps(steps || []);
    setPrompt(data.prompt);
    setTitle(`${data.title} (${t('operations.duplicate').toLowerCase()})`);
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId === 'none') return;
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setPrompt(template.prompt);
      setTitle(template.name);
      setEditableSteps(template.steps || []);
      setDuplicateTask({ id: template.id, title: template.name, prompt: template.prompt, steps: template.steps });
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) { toast.error(t('operations.enterTemplateName')); return; }
    setSavingTemplate(true);
    try {
      const { error } = await supabase.from('operation_templates').insert({ user_id: user!.id, name: templateName, prompt, steps: editableSteps.length > 0 ? editableSteps as unknown as Json : null });
      if (error) throw error;
      toast.success(t('operations.templateSaved'));
      setShowSaveTemplate(false);
      setTemplateName('');
      fetchTemplates();
    } catch { toast.error(t('operations.templateSaveFailed')); }
    finally { setSavingTemplate(false); }
  };

  const updateStep = (index: number, newGoal: string) => setEditableSteps(prev => prev.map((s, i) => i === index ? { ...s, next_goal: newGoal } : s));
  const deleteStep = (index: number) => setEditableSteps(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, step: i + 1 })));
  const addStep = () => setEditableSteps(prev => [...prev, { step: prev.length + 1, next_goal: '' }]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error(t('operations.fileTooLarge')); return; }
    const allowedTypes = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/plain'];
    if (!allowedTypes.includes(file.type)) { toast.error(t('operations.unsupportedFormat')); return; }
    if (uploadedFiles.some(f => f.name === file.name)) { toast.error(t('operations.fileAlreadyAdded')); return; }
    setUploadingFile(true);
    const reader = new FileReader();
    reader.onload = () => { const base64 = (reader.result as string).split(',')[1]; setUploadedFiles(prev => [...prev, { name: file.name, content: base64, type: file.type, size: file.size }]); setUploadingFile(false); toast.success(t('operations.fileReady', { name: file.name })); };
    reader.onerror = () => { toast.error(t('toast.loadFailed')); setUploadingFile(false); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeFile = (fileName: string) => setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
  const formatFileSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) { toast.error(t('operations.enterInstructions')); return; }
    if (!user) { toast.error(t('operations.mustBeLoggedIn')); return; }
    setLoading(true);
    try {
      const uploadedFileNames: string[] = [];
      if (uploadedFiles.length > 0) {
        toast.info(t('operations.uploadingFiles'));
        for (const file of uploadedFiles) {
          const { error: uploadError } = await supabase.functions.invoke('browser-use', { body: { action: 'upload_file', fileName: file.name, fileBase64: file.content, contentType: file.type } });
          if (uploadError) throw new Error(t('operations.uploadFileFailed', { name: file.name }));
          uploadedFileNames.push(file.name);
        }
        toast.success(t('operations.filesUploaded'));
      }
      let fullPrompt = prompt;
      if (uploadedFileNames.length > 0) fullPrompt = `Files available: ${uploadedFileNames.map(f => `"${f}"`).join(', ')}.\n\n${fullPrompt}`;
      if (username && password) fullPrompt = `Credentials:\nUsername: ${username}\nPassword: ${password}\n\n${fullPrompt}`;
      const { data, error } = await supabase.functions.invoke('browser-use', { body: { action: 'create_task', prompt: fullPrompt, title: title || t('operations.newOperation'), userId: user.id, keepBrowserOpen, taskType: 'operation', includedFiles: uploadedFileNames.length > 0 ? uploadedFileNames : undefined } });
      if (error) throw error;
      const taskId = data.task?.id;
      if (!taskId) throw new Error('Task not created');
      let attempts = 0;
      while (attempts < 10) { const { data: taskExists } = await supabase.from('tasks').select('id').eq('id', taskId).maybeSingle(); if (taskExists) break; await new Promise(resolve => setTimeout(resolve, 300)); attempts++; }
      toast.success(t('operations.operationStarted'));
      navigate(`/dashboard/operations/${taskId}`);
    } catch (error: any) { console.error(error); toast.error(error.message || t('operations.operationCreateFailed')); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {templates.length > 0 && !duplicateFromId && (
        <Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />{t('operations.operationTemplates')}</CardTitle></CardHeader><CardContent><Select value={selectedTemplateId} onValueChange={handleTemplateSelect}><SelectTrigger><SelectValue placeholder={t('operations.selectTemplate')} /></SelectTrigger><SelectContent><SelectItem value="none">{t('operations.newOperationOption')}</SelectItem>{templates.map(template => (<SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>))}</SelectContent></Select></CardContent></Card>
      )}

      {(duplicateTask || editableSteps.length > 0) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-base flex items-center gap-2"><Copy className="h-4 w-4" />{duplicateTask ? t('operations.duplicateFrom', { title: duplicateTask.title }) : t('operations.operationSteps')}</CardTitle><Button variant="outline" size="sm" onClick={() => setShowSaveTemplate(!showSaveTemplate)}><Save className="h-4 w-4 mr-1" />{t('operations.saveAsTemplateBtn')}</Button></div><CardDescription>{t('operations.editStepsHint')}</CardDescription></CardHeader>
          {showSaveTemplate && (<CardContent className="pt-0 pb-3"><div className="flex gap-2"><Input placeholder={t('operations.templateNamePlaceholder')} value={templateName} onChange={(e) => setTemplateName(e.target.value)} /><Button onClick={handleSaveAsTemplate} disabled={savingTemplate}>{savingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}</Button></div></CardContent>)}
          {editableSteps.length > 0 && (<CardContent className="pt-0"><Collapsible open={stepsOpen} onOpenChange={setStepsOpen}><CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="w-full justify-between">{t('taskDetail.steps')} ({editableSteps.length})<ChevronDown className={`h-4 w-4 transition-transform ${stepsOpen ? 'rotate-180' : ''}`} /></Button></CollapsibleTrigger><CollapsibleContent><div className="mt-2 space-y-3 max-h-80 overflow-y-auto pr-2">{editableSteps.map((step, index) => (<div key={index} className="p-3 rounded-lg bg-muted/50 space-y-2"><div className="flex items-start gap-2"><span className="text-xs font-medium text-muted-foreground shrink-0 pt-2">{t('operations.step')} {step.step}</span><Textarea value={step.next_goal} onChange={(e) => updateStep(index, e.target.value)} className="min-h-[60px] text-sm" placeholder={t('operations.stepGoal')} /><Button variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive" onClick={() => deleteStep(index)}><Trash2 className="h-4 w-4" /></Button></div>{step.evaluation_previous_goal && <p className="text-xs text-muted-foreground ml-12">{t('operations.stepResult')}: {step.evaluation_previous_goal}</p>}{step.url && <p className="text-xs text-muted-foreground ml-12">URL: {step.url}</p>}</div>))}</div><Button variant="outline" size="sm" className="w-full mt-3" onClick={addStep}><Plus className="h-4 w-4 mr-1" />{t('operations.addStep')}</Button></CollapsibleContent></Collapsible></CardContent>)}
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>{t('operations.newOperationTitle')}</CardTitle><CardDescription>{t('operations.newOperationDescription')}</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2"><Label htmlFor="title">{t('operations.operationNameOptional')}</Label><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('operations.operationNamePlaceholder')} /></div>
            <div className="space-y-2"><Label htmlFor="prompt">{t('operations.instructions')} *</Label><Textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('operations.instructionsPlaceholder')} rows={6} className="resize-none" /></div>
            <div className="space-y-3"><Label>{t('operations.filesToUpload')}</Label><p className="text-xs text-muted-foreground">{t('operations.filesToUploadHelp')}</p><div className="flex items-center gap-2"><Input type="file" accept=".docx,.doc,.pdf,.xlsx,.xls,.txt" onChange={handleFileUpload} disabled={uploadingFile} className="flex-1" />{uploadingFile && <Loader2 className="h-4 w-4 animate-spin" />}</div>{uploadedFiles.length > 0 && (<div className="flex flex-wrap gap-2">{uploadedFiles.map(file => (<Badge key={file.name} variant="secondary" className="flex items-center gap-1 pr-1"><Upload className="h-3 w-3" />{file.name}<span className="text-xs text-muted-foreground ml-1">({formatFileSize(file.size)})</span><Button type="button" variant="ghost" size="icon" className="h-4 w-4 ml-1 hover:bg-destructive/20" onClick={() => removeFile(file.name)}><X className="h-3 w-3" /></Button></Badge>))}</div>)}</div>
            <Collapsible><CollapsibleTrigger asChild><Button type="button" variant="outline" size="sm" className="w-full justify-between">{t('operations.credentialsOptional')}<ChevronDown className="h-4 w-4" /></Button></CollapsibleTrigger><CollapsibleContent className="mt-4 space-y-4"><div className="space-y-2"><Label htmlFor="username">{t('operations.username')}</Label><Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="user@example.com" /></div><div className="space-y-2"><Label htmlFor="password">{t('operations.password')}</Label><div className="relative"><Input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /><Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div></div></CollapsibleContent></Collapsible>
            <div className="flex items-center space-x-2"><Checkbox id="keepBrowserOpen" checked={keepBrowserOpen} onCheckedChange={(checked) => setKeepBrowserOpen(checked as boolean)} /><Label htmlFor="keepBrowserOpen" className="text-sm font-normal cursor-pointer">{t('operations.keepBrowserOpen')}</Label></div>
            <Button type="submit" className="w-full" disabled={loading || !prompt.trim()}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('operations.running')}</> : <><Play className="mr-2 h-4 w-4" />{t('operations.runOperation')}</>}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
