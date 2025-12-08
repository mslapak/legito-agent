import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { TestTube, Sparkles, Loader2, Play, Save, Trash2, FileText, Upload, X } from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// Set up PDF.js worker
GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

interface Project {
  id: string;
  name: string;
  base_url: string | null;
}

interface GeneratedTestCase {
  title: string;
  prompt: string;
  expectedResult: string;
  priority: 'low' | 'medium' | 'high';
}

export default function TestGenerator() {
  const { session } = useAuth();
  const [description, setDescription] = useState('');
  const [documentation, setDocumentation] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [testType, setTestType] = useState('functional');
  const [projectId, setProjectId] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedTests, setGeneratedTests] = useState<GeneratedTestCase[]>([]);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [sourceTab, setSourceTab] = useState<'description' | 'documentation'>('description');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, base_url')
      .order('name');

    if (!error && data) {
      setProjects(data);
    }
  };

  const handleProjectChange = (id: string) => {
    setProjectId(id);
    const project = projects.find(p => p.id === id);
    if (project?.base_url) {
      setBaseUrl(project.base_url);
    }
  };

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;
    
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (max 10MB for PDFs, 1MB for text)
    const maxSize = file.name.toLowerCase().endsWith('.pdf') ? 10 * 1024 * 1024 : 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`Soubor je příliš velký (max ${file.name.toLowerCase().endsWith('.pdf') ? '10MB' : '1MB'})`);
      return;
    }

    // Check file type
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    const allowedTextTypes = ['text/plain', 'text/markdown', 'application/json'];
    const allowedTextExtensions = ['.txt', '.md', '.markdown', '.json'];
    const hasAllowedTextExtension = allowedTextExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!isPdf && !allowedTextTypes.includes(file.type) && !hasAllowedTextExtension) {
      toast.error('Nepodporovaný formát. Použijte .pdf, .txt, .md nebo .json');
      return;
    }

    try {
      let text: string;
      
      if (isPdf) {
        setIsExtractingPdf(true);
        toast.info('Extrahuji text z PDF...');
        text = await extractTextFromPdf(file);
        
        if (!text.trim()) {
          toast.error('PDF neobsahuje čitelný text (možná obsahuje pouze obrázky)');
          setIsExtractingPdf(false);
          return;
        }
        
        toast.success(`Text extrahován z PDF (${text.length} znaků)`);
      } else {
        text = await file.text();
      }
      
      setDocumentation(text);
      setUploadedFileName(file.name);
      if (!isPdf) {
        toast.success(`Soubor "${file.name}" načten`);
      }
    } catch (error) {
      console.error('Error reading file:', error);
      toast.error('Nepodařilo se přečíst soubor');
    } finally {
      setIsExtractingPdf(false);
    }
  };

  const clearUploadedFile = () => {
    setDocumentation('');
    setUploadedFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    const contentToAnalyze = sourceTab === 'documentation' ? documentation : description;
    
    if (!contentToAnalyze.trim()) {
      toast.error(sourceTab === 'documentation' 
        ? 'Vložte nebo nahrajte dokumentaci' 
        : 'Zadejte popis aplikace nebo funkce');
      return;
    }

    setIsLoading(true);
    setGeneratedTests([]);

    try {
      const response = await supabase.functions.invoke('generate-tests', {
        body: {
          description: sourceTab === 'description' ? contentToAnalyze : undefined,
          documentation: sourceTab === 'documentation' ? contentToAnalyze : undefined,
          baseUrl,
          testType,
          projectId: projectId || undefined,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.testCases) {
        setGeneratedTests(response.data.testCases);
        
        // If project is selected, save tests to database
        if (projectId) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const testsToInsert = response.data.testCases.map((tc: GeneratedTestCase) => ({
              user_id: user.id,
              project_id: projectId,
              title: tc.title,
              prompt: tc.prompt,
              expected_result: tc.expectedResult,
              priority: tc.priority,
              status: 'pending',
              source_type: sourceTab,
            }));

            const { error: insertError } = await supabase
              .from('generated_tests')
              .insert(testsToInsert);

            if (insertError) {
              console.error('Error saving tests to DB:', insertError);
            } else {
              toast.success(`Vygenerováno a uloženo ${response.data.testCases.length} testů do projektu`);
              return;
            }
          }
        }
        
        toast.success(`Vygenerováno ${response.data.testCases.length} testů`);
      } else {
        toast.error('Nepodařilo se vygenerovat testy');
      }
    } catch (error) {
      console.error('Error generating tests:', error);
      toast.error(error instanceof Error ? error.message : 'Chyba při generování testů');
    } finally {
      setIsLoading(false);
    }
  };

  const runTest = async (test: GeneratedTestCase) => {
    try {
      const response = await supabase.functions.invoke('browser-use', {
        body: {
          action: 'create_task',
          prompt: test.prompt,
          title: test.title,
          projectId: projectId || null,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success('Test byl spuštěn');
    } catch (error) {
      console.error('Error running test:', error);
      toast.error('Nepodařilo se spustit test');
    }
  };

  const saveTestCase = async (test: GeneratedTestCase, index: number) => {
    setSavingIndex(index);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Uživatel není přihlášen');

      const { error } = await supabase
        .from('test_cases')
        .insert({
          user_id: user.id,
          title: test.title,
          prompt: test.prompt,
          expected_result: test.expectedResult,
          priority: test.priority,
          test_suite_id: null,
        });

      if (error) throw error;
      toast.success('Test uložen');
    } catch (error) {
      console.error('Error saving test:', error);
      toast.error('Nepodařilo se uložit test');
    } finally {
      setSavingIndex(null);
    }
  };

  const removeTest = (index: number) => {
    setGeneratedTests(prev => prev.filter((_, i) => i !== index));
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive">Vysoká</Badge>;
      case 'medium':
        return <Badge className="bg-warning text-warning-foreground">Střední</Badge>;
      case 'low':
        return <Badge variant="secondary">Nízká</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Generator Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl gradient-accent flex items-center justify-center">
              <TestTube className="w-6 h-6 text-accent-foreground" />
            </div>
            <div>
              <CardTitle>AI Generátor testů</CardTitle>
              <CardDescription>
                Vygenerujte testy z popisu aplikace nebo z dokumentace
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Projekt (volitelný)</Label>
              <Select value={projectId || "none"} onValueChange={(val) => handleProjectChange(val === "none" ? "" : val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte projekt" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bez projektu</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Typ testů</Label>
              <Select value={testType} onValueChange={setTestType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="functional">Funkční testy</SelectItem>
                  <SelectItem value="e2e">End-to-end testy</SelectItem>
                  <SelectItem value="smoke">Smoke testy</SelectItem>
                  <SelectItem value="regression">Regresní testy</SelectItem>
                  <SelectItem value="ui">UI/UX testy</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>URL aplikace (volitelné)</Label>
            <Input
              placeholder="https://vase-aplikace.cz"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          {/* Source Tabs */}
          <Tabs value={sourceTab} onValueChange={(v) => setSourceTab(v as 'description' | 'documentation')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="description" className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Popis aplikace
              </TabsTrigger>
              <TabsTrigger value="documentation" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Dokumentace
              </TabsTrigger>
            </TabsList>

            <TabsContent value="description" className="space-y-2 mt-4">
              <Label>Popis aplikace / funkce *</Label>
              <Textarea
                placeholder="Popište, co chcete testovat. Např.: E-shop s košíkem, přihlášením uživatelů a platební bránou..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </TabsContent>

            <TabsContent value="documentation" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Nahrát dokumentaci</Label>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.markdown,.json,.pdf,application/pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="doc-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2"
                    disabled={isExtractingPdf}
                  >
                    {isExtractingPdf ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Extrahuji PDF...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Nahrát soubor
                      </>
                    )}
                  </Button>
                  {uploadedFileName && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="w-4 h-4" />
                      <span>{uploadedFileName}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearUploadedFile}
                        className="h-6 w-6 p-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Podporované formáty: .pdf, .txt, .md, .json (PDF max 10MB, ostatní max 1MB)
                </p>
              </div>

              {/* Preview of extracted text */}
              {uploadedFileName && documentation && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      Náhled extrahovaného textu
                    </Label>
                    <Badge variant="secondary">{documentation.length.toLocaleString()} znaků</Badge>
                  </div>
                  <div className="relative">
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30 p-4">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                        {documentation.length > 2000 
                          ? documentation.substring(0, 2000) + '\n\n... (zkráceno pro náhled)' 
                          : documentation}
                      </pre>
                    </div>
                    {documentation.length > 2000 && (
                      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-muted/80 to-transparent pointer-events-none rounded-b-lg" />
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Nebo vložte dokumentaci přímo *</Label>
                <Textarea
                  placeholder={`Vložte obsah dokumentace, návodů nebo specifikace. Např.:

# Přihlášení uživatele
1. Uživatel otevře stránku /login
2. Vyplní email a heslo
3. Klikne na tlačítko "Přihlásit se"
4. Při správných údajích je přesměrován na dashboard
5. Při chybných údajích se zobrazí chybová hláška

# Registrace
1. Uživatel otevře stránku /register
...`}
                  value={documentation}
                  onChange={(e) => setDocumentation(e.target.value)}
                  rows={10}
                  className="resize-none font-mono text-sm"
                />
              </div>
            </TabsContent>
          </Tabs>

          <Button 
            onClick={handleGenerate} 
            disabled={isLoading} 
            className="w-full gradient-primary"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generuji testy...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Vygenerovat testy
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated Tests */}
      {generatedTests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Vygenerované testy ({generatedTests.length})</CardTitle>
            <CardDescription>
              Můžete testy spustit přímo nebo je uložit pro pozdější použití
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {generatedTests.map((test, index) => (
              <div
                key={index}
                className="p-4 rounded-lg border border-border hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <h4 className="font-medium">{test.title}</h4>
                      {getPriorityBadge(test.priority)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => saveTestCase(test, index)}
                      disabled={savingIndex === index}
                    >
                      {savingIndex === index ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => runTest(test)}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTest(index)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="ml-11 space-y-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Prompt:</p>
                    <p className="text-sm">{test.prompt}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Očekávaný výsledek:</p>
                    <p className="text-sm">{test.expectedResult}</p>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => generatedTests.forEach((t, i) => saveTestCase(t, i))}
              >
                <Save className="mr-2 h-4 w-4" />
                Uložit všechny
              </Button>
              <Button
                className="gradient-primary"
                onClick={() => generatedTests.forEach(t => runTest(t))}
              >
                <Play className="mr-2 h-4 w-4" />
                Spustit všechny
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
