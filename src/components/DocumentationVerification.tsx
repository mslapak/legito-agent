import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  FileText,
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Trash2,
  FileCheck,
  Link,
  Globe,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface VerificationStep {
  id: string;
  step: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  result?: string;
  browser_use_task_id?: string;
}

interface DocumentationVerificationProps {
  projectId: string;
  projectName: string;
  baseUrl: string | null;
}

export default function DocumentationVerification({ 
  projectId, 
  projectName, 
  baseUrl 
}: DocumentationVerificationProps) {
  const [documentation, setDocumentation] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGeneratingSteps, setIsGeneratingSteps] = useState(false);
  const [steps, setSteps] = useState<VerificationStep[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [sourceTab, setSourceTab] = useState<'file' | 'url' | 'text'>('file');
  const [docUrl, setDocUrl] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n\n';
    }

    return fullText.trim();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.md')) {
      toast.error('Podporované formáty: PDF, TXT, MD, DOCX');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Maximální velikost souboru je 10 MB');
      return;
    }

    setUploadedFile(file);
    setIsExtracting(true);

    try {
      let text = '';

      if (file.type === 'application/pdf') {
        text = await extractTextFromPdf(file);
      } else if (file.type === 'text/plain' || file.name.endsWith('.md')) {
        text = await file.text();
      } else {
        toast.error('Tento typ souboru zatím není podporován');
        return;
      }

      setExtractedText(text);
      setDocumentation(text);
      toast.success('Text extrahován z dokumentace');
    } catch (error) {
      console.error('Error extracting text:', error);
      toast.error('Nepodařilo se extrahovat text z dokumentace');
    } finally {
      setIsExtracting(false);
    }
  };

  const clearFile = () => {
    setUploadedFile(null);
    setExtractedText('');
    setDocumentation('');
    setSteps([]);
    setDocUrl('');
  };

  const fetchDocFromUrl = async () => {
    if (!docUrl.trim()) {
      toast.error('Zadejte URL dokumentace');
      return;
    }

    setIsFetchingUrl(true);

    try {
      const { data, error } = await supabase.functions.invoke('fetch-documentation', {
        body: { url: docUrl },
      });

      if (error) throw error;

      if (data?.content) {
        setDocumentation(data.content);
        toast.success(`Dokumentace načtena z URL (${data.content.length} znaků)`);
      } else {
        toast.error('Nepodařilo se načíst obsah z URL');
      }
    } catch (error) {
      console.error('Error fetching URL:', error);
      toast.error('Nepodařilo se načíst dokumentaci z URL');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const generateSteps = async () => {
    if (!documentation.trim()) {
      toast.error('Vložte dokumentaci k ověření');
      return;
    }

    if (!baseUrl) {
      toast.error('Projekt nemá nastavenou URL aplikace');
      return;
    }

    setIsGeneratingSteps(true);
    setSteps([]);

    try {
      const { data, error } = await supabase.functions.invoke('generate-tests', {
        body: {
          description: `Analyzuj tuto dokumentaci a extrahuj z ní jednotlivé KROKY, které uživatel provádí v aplikaci.
Pro každý krok vytvoř samostatný testovací scénář, který ověří, že daná funkcionalita funguje podle dokumentace.

Dokumentace:
${documentation}

Důležité:
- Každý krok musí být konkrétní akce v prohlížeči
- Zahrň navigaci na správné stránky
- Zahrň kliknutí na tlačítka, vyplnění formulářů
- Zahrň ověření, že se zobrazil očekávaný výsledek
- Vrať max 10 kroků`,
          testType: 'e2e',
          baseUrl,
        },
      });

      if (error) throw error;

      const generatedSteps: VerificationStep[] = (data.tests || []).map((test: any, index: number) => ({
        id: `step-${index}`,
        step: test.prompt || test.title,
        status: 'pending' as const,
      }));

      setSteps(generatedSteps);
      toast.success(`Vygenerováno ${generatedSteps.length} kroků k ověření`);
    } catch (error) {
      console.error('Error generating steps:', error);
      toast.error('Nepodařilo se vygenerovat kroky');
    } finally {
      setIsGeneratingSteps(false);
    }
  };

  const runVerification = async () => {
    if (steps.length === 0) {
      toast.error('Nejdříve vygenerujte kroky');
      return;
    }

    if (!baseUrl) {
      toast.error('Projekt nemá nastavenou URL aplikace');
      return;
    }

    setIsRunning(true);

    for (let i = 0; i < steps.length; i++) {
      setCurrentStepIndex(i);
      
      setSteps(prev => prev.map((s, idx) => 
        idx === i ? { ...s, status: 'running' } : s
      ));

      try {
        const { data, error } = await supabase.functions.invoke('browser-use', {
          body: {
            action: 'create_task',
            url: baseUrl,
            task: `${steps[i].step}

DŮLEŽITÉ: Na konci ověř, jestli tento krok funguje správně podle dokumentace. Pokud ano, napiš "DOKUMENTACE AKTUÁLNÍ". Pokud ne, napiš "DOKUMENTACE NEAKTUÁLNÍ" a vysvětli proč.`,
          },
        });

        if (error) throw error;

        const taskId = data.id;
        
        setSteps(prev => prev.map((s, idx) => 
          idx === i ? { ...s, browser_use_task_id: taskId } : s
        ));

        // Poll for result
        let result = null;
        let attempts = 0;
        const maxAttempts = 60;

        while (!result && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const { data: statusData, error: statusError } = await supabase.functions.invoke('browser-use', {
            body: {
              action: 'get_task_status',
              taskId,
            },
          });

          if (statusError) {
            console.error('Status error:', statusError);
            break;
          }

          if (statusData?.expired || statusData?.status === 'not_found') {
            result = { status: 'finished', output: 'Sezení vypršelo' };
            break;
          }

          if (statusData?.status === 'finished' || statusData?.status === 'stopped' || statusData?.status === 'failed') {
            result = statusData;
            break;
          }

          attempts++;
        }

        const output = result?.output || result?.result || '';
        const isUpToDate = output.toLowerCase().includes('dokumentace aktuální') && 
                          !output.toLowerCase().includes('neaktuální');

        setSteps(prev => prev.map((s, idx) => 
          idx === i ? { 
            ...s, 
            status: isUpToDate ? 'passed' : 'failed',
            result: output,
          } : s
        ));

      } catch (error) {
        console.error('Error running step:', error);
        setSteps(prev => prev.map((s, idx) => 
          idx === i ? { ...s, status: 'failed', result: 'Chyba při spuštění' } : s
        ));
      }
    }

    setIsRunning(false);
    setCurrentStepIndex(-1);
    toast.success('Ověření dokumentace dokončeno');
  };

  const getStatusIcon = (status: VerificationStep['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-muted-foreground" />;
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case 'passed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-destructive" />;
    }
  };

  const getStatusBadge = (status: VerificationStep['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Čeká</Badge>;
      case 'running':
        return <Badge variant="default">Běží</Badge>;
      case 'passed':
        return <Badge className="bg-green-500 hover:bg-green-600">Aktuální</Badge>;
      case 'failed':
        return <Badge variant="destructive">Neaktuální</Badge>;
    }
  };

  const completedSteps = steps.filter(s => s.status === 'passed' || s.status === 'failed').length;
  const passedSteps = steps.filter(s => s.status === 'passed').length;
  const progress = steps.length > 0 ? (completedSteps / steps.length) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCheck className="w-5 h-5 text-primary" />
          Ověření dokumentace
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Section */}
        <div className="space-y-3">
          <Label>Zdroj dokumentace</Label>
          
          <Tabs value={sourceTab} onValueChange={(v) => setSourceTab(v as 'file' | 'url' | 'text')}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="file" className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Soubor
              </TabsTrigger>
              <TabsTrigger value="url" className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                URL
              </TabsTrigger>
              <TabsTrigger value="text" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Text
              </TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="space-y-3 mt-3">
              {!uploadedFile ? (
                <label>
                  <input
                    type="file"
                    accept=".pdf,.txt,.md,.docx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Nahrát PDF, TXT, MD
                    </span>
                  </div>
                </label>
              ) : (
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">{uploadedFile.name}</span>
                    {isExtracting && <Loader2 className="w-4 h-4 animate-spin" />}
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearFile}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="url" className="space-y-3 mt-3">
              <div className="flex gap-2">
                <Input
                  placeholder="https://docs.example.com/manual"
                  value={docUrl}
                  onChange={(e) => setDocUrl(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={fetchDocFromUrl}
                  disabled={isFetchingUrl || !docUrl.trim()}
                  variant="secondary"
                >
                  {isFetchingUrl ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Zadejte URL stránky s dokumentací
              </p>
            </TabsContent>

            <TabsContent value="text" className="space-y-3 mt-3">
              <Textarea
                placeholder="Vložte text dokumentace přímo sem..."
                value={documentation}
                onChange={(e) => setDocumentation(e.target.value)}
                rows={6}
                className="resize-none"
              />
            </TabsContent>
          </Tabs>

          {/* Preview of loaded documentation */}
          {documentation && sourceTab !== 'text' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Načtená dokumentace</Label>
                <Badge variant="secondary">{documentation.length.toLocaleString()} znaků</Badge>
              </div>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                  {documentation.length > 500 
                    ? documentation.substring(0, 500) + '...' 
                    : documentation}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Generate Steps Button */}
        <Button
          onClick={generateSteps}
          disabled={isGeneratingSteps || !documentation.trim() || !baseUrl}
          className="w-full"
          variant="secondary"
        >
          {isGeneratingSteps ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generuji kroky...
            </>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              Vygenerovat kroky z dokumentace
            </>
          )}
        </Button>

        {/* Steps List */}
        {steps.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Kroky k ověření ({passedSteps}/{steps.length} aktuální)
              </span>
              <Button
                onClick={runVerification}
                disabled={isRunning}
                size="sm"
                className="gradient-primary"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Ověřuji...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Spustit ověření
                  </>
                )}
              </Button>
            </div>

            {isRunning && (
              <Progress value={progress} className="h-2" />
            )}

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {steps.map((step, index) => (
                <div
                  key={step.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    currentStepIndex === index ? 'border-primary bg-primary/5' : 'bg-muted/30'
                  }`}
                >
                  <div className="mt-0.5">
                    {getStatusIcon(step.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        Krok {index + 1}
                      </span>
                      {getStatusBadge(step.status)}
                    </div>
                    <p className="text-sm">{step.step}</p>
                    {step.result && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {step.result}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!baseUrl && (
          <p className="text-xs text-muted-foreground text-center">
            Pro ověření dokumentace nastavte URL aplikace v projektu
          </p>
        )}
      </CardContent>
    </Card>
  );
}
