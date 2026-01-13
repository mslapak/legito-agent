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
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { TestTube, Sparkles, Loader2, Play, Save, Trash2, FileText, Upload, X, ClipboardPaste, Table2, FileSpreadsheet, AlertCircle, Layers } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { useTranslation } from 'react-i18next';

interface CsvPreviewRow {
  title: string;
  prompt: string;
  expectedResult: string;
  priority: string;
}

interface AzureDevOpsTestCase {
  id: string;
  title: string;
  steps: Array<{
    stepNumber: number;
    action: string;
    expected: string;
  }>;
}

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
  const { t, i18n } = useTranslation();
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
  const [sourceTab, setSourceTab] = useState<'description' | 'documentation' | 'import_text' | 'import_csv' | 'import_azure'>('description');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Import from text state
  const [rawTestsInput, setRawTestsInput] = useState('');
  const [isParsingText, setIsParsingText] = useState(false);
  
  // CSV import state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreviewRow[]>([]);
  const [parsedCsvTests, setParsedCsvTests] = useState<GeneratedTestCase[]>([]);
  const csvInputRef = useRef<HTMLInputElement>(null);
  
  // Azure DevOps XLSX import state
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [xlsxPreview, setXlsxPreview] = useState<AzureDevOpsTestCase[]>([]);
  const [parsedAzureTests, setParsedAzureTests] = useState<GeneratedTestCase[]>([]);
  const xlsxInputRef = useRef<HTMLInputElement>(null);
  const [isImportingAzure, setIsImportingAzure] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importChunkSize, setImportChunkSize] = useState<number>(25);

  // Average time per test in minutes (based on historical data)
  const AVG_TIME_PER_TEST = 5;

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
      toast.error(i18n.language === 'cs' 
        ? `Soubor je příliš velký (max ${file.name.toLowerCase().endsWith('.pdf') ? '10MB' : '1MB'})`
        : `File is too large (max ${file.name.toLowerCase().endsWith('.pdf') ? '10MB' : '1MB'})`);
      return;
    }

    // Check file type
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    const allowedTextTypes = ['text/plain', 'text/markdown', 'application/json'];
    const allowedTextExtensions = ['.txt', '.md', '.markdown', '.json'];
    const hasAllowedTextExtension = allowedTextExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!isPdf && !allowedTextTypes.includes(file.type) && !hasAllowedTextExtension) {
      toast.error(i18n.language === 'cs' 
        ? 'Nepodporovaný formát. Použijte .pdf, .txt, .md nebo .json'
        : 'Unsupported format. Use .pdf, .txt, .md or .json');
      return;
    }

    try {
      let text: string;
      
      if (isPdf) {
        setIsExtractingPdf(true);
        toast.info(t('testGenerator.extractingPdf'));
        text = await extractTextFromPdf(file);
        
        if (!text.trim()) {
          toast.error(i18n.language === 'cs' 
            ? 'PDF neobsahuje čitelný text (možná obsahuje pouze obrázky)'
            : 'PDF does not contain readable text (may contain only images)');
          setIsExtractingPdf(false);
          return;
        }
        
        toast.success(i18n.language === 'cs' 
          ? `Text extrahován z PDF (${text.length} znaků)`
          : `Text extracted from PDF (${text.length} characters)`);
      } else {
        text = await file.text();
      }
      
      setDocumentation(text);
      setUploadedFileName(file.name);
      if (!isPdf) {
        toast.success(i18n.language === 'cs' 
          ? `Soubor "${file.name}" načten`
          : `File "${file.name}" loaded`);
      }
    } catch (error) {
      console.error('Error reading file:', error);
      toast.error(i18n.language === 'cs' ? 'Nepodařilo se přečíst soubor' : 'Failed to read file');
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

  // Parse tests from raw text using AI
  const handleParseFromText = async () => {
    if (!rawTestsInput.trim()) {
      toast.error(i18n.language === 'cs' ? 'Vložte text s testy' : 'Paste text with tests');
      return;
    }

    setIsParsingText(true);
    setGeneratedTests([]);

    try {
      const response = await supabase.functions.invoke('generate-tests', {
        body: {
          action: 'parse_tests',
          rawText: rawTestsInput,
          baseUrl,
          projectId: projectId || undefined,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.testCases) {
        setGeneratedTests(response.data.testCases);
        
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
              source_type: 'import_text',
            }));

            const { error: insertError } = await supabase
              .from('generated_tests')
              .insert(testsToInsert);

            if (insertError) {
              console.error('Error saving tests to DB:', insertError);
            } else {
              toast.success(t('testGenerator.testsImportedAndSaved', { count: response.data.testCases.length }));
              return;
            }
          }
        }
        
        toast.success(t('testGenerator.testsImported', { count: response.data.testCases.length }));
      } else {
        toast.error(i18n.language === 'cs' ? 'Nepodařilo se parsovat testy' : 'Failed to parse tests');
      }
    } catch (error) {
      console.error('Error parsing tests:', error);
      toast.error(error instanceof Error ? error.message : t('toast.unknownError'));
    } finally {
      setIsParsingText(false);
    }
  };

  // CSV parsing
  const parseCSV = (text: string): CsvPreviewRow[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    // Parse header - handle both comma and semicolon delimiters
    const delimiter = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/"/g, ''));
    
    // Find column indices with flexible naming
    const titleIdx = headers.findIndex(h => ['title', 'název', 'name', 'test', 'test_name', 'testname'].includes(h));
    const promptIdx = headers.findIndex(h => ['prompt', 'steps', 'kroky', 'description', 'popis', 'step', 'instructions'].includes(h));
    const expectedIdx = headers.findIndex(h => ['expected', 'expected_result', 'expectedresult', 'očekávaný', 'result', 'výsledek', 'očekávaný_výsledek'].includes(h));
    const priorityIdx = headers.findIndex(h => ['priority', 'priorita', 'severity', 'importance'].includes(h));
    
    if (titleIdx === -1 || promptIdx === -1) {
      throw new Error(i18n.language === 'cs' 
        ? 'CSV musí obsahovat sloupce "title" a "prompt" (nebo jejich varianty)'
        : 'CSV must contain "title" and "prompt" columns (or their variants)');
    }
    
    return lines.slice(1).map(line => {
      // Handle quoted values with commas
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if ((char === delimiter) && !inQuotes) {
          values.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^"|"$/g, ''));
      
      const priorityValue = priorityIdx !== -1 ? values[priorityIdx]?.toLowerCase() : 'medium';
      const normalizedPriority = ['high', 'vysoká', 'critical'].includes(priorityValue) ? 'high' 
        : ['low', 'nízká', 'minor'].includes(priorityValue) ? 'low' 
        : 'medium';
      
      return {
        title: values[titleIdx] || '',
        prompt: values[promptIdx] || '',
        expectedResult: expectedIdx !== -1 ? values[expectedIdx] || '' : '',
        priority: normalizedPriority,
      };
    }).filter(row => row.title && row.prompt);
  };

  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error(i18n.language === 'cs' ? 'Nahrajte soubor ve formátu CSV' : 'Upload a CSV file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(i18n.language === 'cs' ? 'Soubor je příliš velký (max 5MB)' : 'File is too large (max 5MB)');
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      
      if (parsed.length === 0) {
        toast.error(i18n.language === 'cs' ? 'CSV neobsahuje žádné validní testy' : 'CSV does not contain any valid tests');
        return;
      }
      
      setCsvFile(file);
      setCsvPreview(parsed.slice(0, 5));
      setParsedCsvTests(parsed.map(row => ({
        title: row.title,
        prompt: row.prompt,
        expectedResult: row.expectedResult,
        priority: row.priority as 'low' | 'medium' | 'high',
      })));
      
      toast.success(i18n.language === 'cs' 
        ? `Načteno ${parsed.length} testů z CSV`
        : `Loaded ${parsed.length} tests from CSV`);
    } catch (error) {
      console.error('Error parsing CSV:', error);
      toast.error(error instanceof Error ? error.message : t('toast.unknownError'));
    }
  };

  const clearCsvFile = () => {
    setCsvFile(null);
    setCsvPreview([]);
    setParsedCsvTests([]);
    if (csvInputRef.current) {
      csvInputRef.current.value = '';
    }
  };

  const handleImportCsv = async () => {
    if (parsedCsvTests.length === 0) {
      toast.error(i18n.language === 'cs' ? 'Nejsou načteny žádné testy' : 'No tests loaded');
      return;
    }

    setGeneratedTests(parsedCsvTests);

    if (projectId) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const testsToInsert = parsedCsvTests.map((tc) => ({
            user_id: user.id,
            project_id: projectId,
            title: tc.title,
            prompt: tc.prompt,
            expected_result: tc.expectedResult,
            priority: tc.priority,
            status: 'pending',
            source_type: 'import_csv',
          }));

          const { error: insertError } = await supabase
            .from('generated_tests')
            .insert(testsToInsert);

          if (insertError) {
            console.error('Error saving tests to DB:', insertError);
          } else {
            toast.success(t('testGenerator.testsImportedAndSaved', { count: parsedCsvTests.length }));
            return;
          }
        }
      } catch (error) {
        console.error('Error saving CSV tests:', error);
      }
    }
    
    toast.success(t('testGenerator.testsImported', { count: parsedCsvTests.length }));
  };

  // Azure DevOps XLSX parsing
  const parseAzureDevOpsExport = (workbook: XLSX.WorkBook): AzureDevOpsTestCase[] => {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, string | number>[];
    
    const tests: AzureDevOpsTestCase[] = [];
    let currentTest: AzureDevOpsTestCase | null = null;
    let testCounter = 0;
    
    for (const row of rows) {
      // Support both ID column and Work Item Type column
      const id = row['ID']?.toString() || '';
      const workItemType = row['Work Item Type']?.toString() || '';
      const title = row['Title']?.toString() || '';
      const stepNum = row['Test Step']?.toString() || '';
      const stepAction = row['Step Action']?.toString() || '';
      const stepExpected = row['Step Expected']?.toString() || '';
      
      // New test case row detection:
      // 1. Has ID and Title (without step number)
      // 2. Or has Work Item Type = "Test Case" and Title
      const isNewTestCase = 
        (id && title && !stepNum) || 
        (workItemType.toLowerCase() === 'test case' && title && !stepNum);
      
      if (isNewTestCase) {
        if (currentTest) tests.push(currentTest);
        testCounter++;
        // Use ID if available, otherwise generate one from counter
        const testId = id || `TC-${testCounter}`;
        currentTest = { id: testId, title, steps: [] };
      }
      
      // Step row - can have action OR expected result
      if (currentTest && stepNum && (stepAction || stepExpected)) {
        currentTest.steps.push({
          stepNumber: parseInt(stepNum) || currentTest.steps.length + 1,
          action: stepAction,
          expected: stepExpected,
        });
      }
    }
    
    if (currentTest) tests.push(currentTest);
    return tests.filter(t => t.steps.length > 0);
  };

  const convertAzureTestToGenerated = (azureTest: AzureDevOpsTestCase): GeneratedTestCase => {
    // Filter out "Objective:" steps
    const actionSteps = azureTest.steps.filter(s => 
      !s.action.toLowerCase().startsWith('objective:')
    );
    
    const prompt = i18n.language === 'cs' 
      ? `Proveď následující kroky:\n${actionSteps.map(s => `${s.stepNumber}. ${s.action}`).join('\n')}`
      : `Perform the following steps:\n${actionSteps.map(s => `${s.stepNumber}. ${s.action}`).join('\n')}`;
    
    const expectedResults = actionSteps
      .filter(s => s.expected)
      .map(s => s.expected);
    
    const expectedResult = expectedResults.length > 0 
      ? (i18n.language === 'cs' 
          ? `Očekávaný výsledek:\n${expectedResults.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
          : `Expected result:\n${expectedResults.map((e, i) => `${i + 1}. ${e}`).join('\n')}`)
      : '';
    
    return {
      title: azureTest.title,
      prompt,
      expectedResult,
      priority: 'medium',
    };
  };

  const handleXlsxUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isXlsx = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
    if (!isXlsx) {
      toast.error(i18n.language === 'cs' ? 'Nahrajte soubor ve formátu XLSX nebo XLS' : 'Upload an XLSX or XLS file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error(i18n.language === 'cs' ? 'Soubor je příliš velký (max 10MB)' : 'File is too large (max 10MB)');
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const parsed = parseAzureDevOpsExport(workbook);
      
      if (parsed.length === 0) {
        toast.error(i18n.language === 'cs' 
          ? 'Soubor neobsahuje žádné validní testy z Azure DevOps'
          : 'File does not contain any valid Azure DevOps tests');
        return;
      }
      
      setXlsxFile(file);
      setXlsxPreview(parsed.slice(0, 5));
      setParsedAzureTests(parsed.map(convertAzureTestToGenerated));
      
      toast.success(i18n.language === 'cs' 
        ? `Načteno ${parsed.length} testů z Azure DevOps`
        : `Loaded ${parsed.length} tests from Azure DevOps`);
    } catch (error) {
      console.error('Error parsing XLSX:', error);
      toast.error(i18n.language === 'cs' ? 'Chyba při čtení XLSX souboru' : 'Error reading XLSX file');
    }
  };

  const clearXlsxFile = () => {
    setXlsxFile(null);
    setXlsxPreview([]);
    setParsedAzureTests([]);
    if (xlsxInputRef.current) {
      xlsxInputRef.current.value = '';
    }
  };

  const handleImportAzure = async () => {
    if (parsedAzureTests.length === 0) {
      toast.error(i18n.language === 'cs' ? 'Nejsou načteny žádné testy' : 'No tests loaded');
      return;
    }

    setIsImportingAzure(true);
    setGeneratedTests(parsedAzureTests);

    if (projectId) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Get all Azure DevOps test IDs from the parsed preview
          const allAzureIds = xlsxPreview.map(t => t.id);
          
          // Build full mapping of test to azure_devops_id
          const testsWithIds = parsedAzureTests.map((tc, idx) => ({
            ...tc,
            azure_devops_id: allAzureIds[idx] || null,
          }));

          // Use user-selected chunk size
          const CHUNK_SIZE = importChunkSize;
          const totalTests = testsWithIds.length;
          
          // Always show progress for chunked imports
          setImportProgress({ current: 0, total: totalTests });

          for (let i = 0; i < totalTests; i += CHUNK_SIZE) {
            const chunk = testsWithIds.slice(i, i + CHUNK_SIZE);
            
            const testsToInsert = chunk.map((tc) => ({
              user_id: user.id,
              project_id: projectId,
              title: tc.title,
              prompt: tc.prompt,
              expected_result: tc.expectedResult,
              priority: tc.priority,
              status: 'pending',
              source_type: 'import_azure_devops',
              azure_devops_id: tc.azure_devops_id,
            }));

            const { error: insertError } = await supabase
              .from('generated_tests')
              .insert(testsToInsert);

            if (insertError) {
              console.error('Error saving tests to DB:', insertError);
              toast.error(`${t('common.error')}: ${insertError.message}`);
              setIsImportingAzure(false);
              setImportProgress(null);
              return;
            }

            // Update progress
            setImportProgress({ current: Math.min(i + CHUNK_SIZE, totalTests), total: totalTests });
          }

          toast.success(t('testGenerator.testsImportedAndSaved', { count: parsedAzureTests.length }));
          setIsImportingAzure(false);
          setImportProgress(null);
          return;
        }
      } catch (error) {
        console.error('Error saving Azure tests:', error);
      }
    }
    
    setIsImportingAzure(false);
    setImportProgress(null);
    toast.success(t('testGenerator.testsImported', { count: parsedAzureTests.length }));
  };

  const handleGenerate = async () => {
    const contentToAnalyze = sourceTab === 'documentation' ? documentation : description;
    
    if (!contentToAnalyze.trim()) {
      toast.error(sourceTab === 'documentation' 
        ? (i18n.language === 'cs' ? 'Vložte nebo nahrajte dokumentaci' : 'Paste or upload documentation')
        : (i18n.language === 'cs' ? 'Zadejte popis aplikace nebo funkce' : 'Enter application or feature description'));
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
              toast.success(t('testGenerator.testsImportedAndSaved', { count: response.data.testCases.length }));
              return;
            }
          }
        }
        
        toast.success(t('testGenerator.testsImported', { count: response.data.testCases.length }));
      } else {
        toast.error(i18n.language === 'cs' ? 'Nepodařilo se vygenerovat testy' : 'Failed to generate tests');
      }
    } catch (error) {
      console.error('Error generating tests:', error);
      toast.error(error instanceof Error ? error.message : t('toast.unknownError'));
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

      toast.success(i18n.language === 'cs' ? 'Test byl spuštěn' : 'Test started');
    } catch (error) {
      console.error('Error running test:', error);
      toast.error(i18n.language === 'cs' ? 'Nepodařilo se spustit test' : 'Failed to start test');
    }
  };

  const saveTestCase = async (test: GeneratedTestCase, index: number) => {
    setSavingIndex(index);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.language === 'cs' ? 'Uživatel není přihlášen' : 'User not logged in');

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
      toast.success(t('testGenerator.testSaved'));
    } catch (error) {
      console.error('Error saving test:', error);
      toast.error(t('testGenerator.saveFailed'));
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
        return <Badge variant="destructive">{t('priority.high')}</Badge>;
      case 'medium':
        return <Badge className="bg-warning text-warning-foreground">{t('priority.medium')}</Badge>;
      case 'low':
        return <Badge variant="secondary">{t('priority.low')}</Badge>;
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
              <CardTitle>{t('testGenerator.title')}</CardTitle>
              <CardDescription>
                {t('testGenerator.subtitle')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('newTask.projectOptional')}</Label>
              <Select value={projectId || "none"} onValueChange={(val) => handleProjectChange(val === "none" ? "" : val)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('newTask.selectProject')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('newTask.noProject')}</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('testGenerator.testType')}</Label>
              <Select value={testType} onValueChange={setTestType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="functional">{t('testGenerator.functional')}</SelectItem>
                  <SelectItem value="e2e">{t('testGenerator.e2e')}</SelectItem>
                  <SelectItem value="smoke">{t('testGenerator.smoke')}</SelectItem>
                  <SelectItem value="regression">{t('testGenerator.regression')}</SelectItem>
                  <SelectItem value="ui">UI/UX</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('testGenerator.baseUrl')} ({t('common.optional')})</Label>
            <Input
              placeholder={t('testGenerator.baseUrlPlaceholder')}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          {/* Source Tabs */}
          <Tabs value={sourceTab} onValueChange={(v) => setSourceTab(v as 'description' | 'documentation' | 'import_text' | 'import_csv' | 'import_azure')}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="description" className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span className="hidden lg:inline">{t('testGenerator.sourceDescription')}</span>
              </TabsTrigger>
              <TabsTrigger value="documentation" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span className="hidden lg:inline">Docs</span>
              </TabsTrigger>
              <TabsTrigger value="import_text" className="flex items-center gap-2">
                <ClipboardPaste className="w-4 h-4" />
                <span className="hidden lg:inline">Text</span>
              </TabsTrigger>
              <TabsTrigger value="import_csv" className="flex items-center gap-2">
                <Table2 className="w-4 h-4" />
                <span className="hidden lg:inline">CSV</span>
              </TabsTrigger>
              <TabsTrigger value="import_azure" className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                <span className="hidden lg:inline">Azure DevOps</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="description" className="space-y-2 mt-4">
              <Label>{t('testGenerator.appDescription')} *</Label>
              <Textarea
                placeholder={t('testGenerator.appDescriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </TabsContent>

            <TabsContent value="documentation" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>{t('testGenerator.uploadFile')}</Label>
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
                        {t('testGenerator.extractingPdf')}
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        {t('testGenerator.uploadFile')}
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
                  {t('testGenerator.supportedFormats')}
                </p>
              </div>

              {/* Preview of extracted text */}
              {uploadedFileName && documentation && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      {i18n.language === 'cs' ? 'Náhled extrahovaného textu' : 'Preview of extracted text'}
                    </Label>
                    <Badge variant="secondary">{documentation.length.toLocaleString()} {i18n.language === 'cs' ? 'znaků' : 'chars'}</Badge>
                  </div>
                  <div className="relative">
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30 p-4">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                        {documentation.length > 2000 
                          ? documentation.substring(0, 2000) + (i18n.language === 'cs' ? '\n\n... (zkráceno pro náhled)' : '\n\n... (truncated for preview)')
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
                <Label>{t('testGenerator.documentation')} *</Label>
                <Textarea
                  placeholder={t('testGenerator.documentationPlaceholder')}
                  value={documentation}
                  onChange={(e) => setDocumentation(e.target.value)}
                  rows={10}
                  className="resize-none font-mono text-sm"
                />
              </div>
            </TabsContent>

            <TabsContent value="import_text" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>{t('testGenerator.pasteTests')} *</Label>
                <Textarea
                  placeholder={t('testGenerator.pasteTestsPlaceholder')}
                  value={rawTestsInput}
                  onChange={(e) => setRawTestsInput(e.target.value)}
                  rows={12}
                  className="resize-none font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {t('testGenerator.pasteTestsHelp')}
                </p>
              </div>
            </TabsContent>

            <TabsContent value="import_csv" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>{t('testGenerator.csvUpload')}</Label>
                <div className="flex items-center gap-3">
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCsvUpload}
                    className="hidden"
                    id="csv-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => csvInputRef.current?.click()}
                    className="flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    {t('testGenerator.csvUpload')}
                  </Button>
                  {csvFile && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Table2 className="w-4 h-4" />
                      <span>{csvFile.name}</span>
                      <Badge variant="secondary">{parsedCsvTests.length} {i18n.language === 'cs' ? 'testů' : 'tests'}</Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearCsvFile}
                        className="h-6 w-6 p-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('testGenerator.csvHelp')}
                </p>
              </div>

              {/* CSV Preview */}
              {csvPreview.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Table2 className="w-4 h-4 text-primary" />
                    {t('testGenerator.csvPreview')} ({Math.min(5, parsedCsvTests.length)}/{parsedCsvTests.length})
                  </Label>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">#</th>
                            <th className="px-3 py-2 text-left font-medium">{t('tests.testName')}</th>
                            <th className="px-3 py-2 text-left font-medium">{t('tests.priority')}</th>
                            <th className="px-3 py-2 text-left font-medium">{t('taskDetail.steps')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreview.map((row, idx) => (
                            <tr key={idx} className="border-t border-border">
                              <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                              <td className="px-3 py-2 font-medium max-w-[200px] truncate">{row.title}</td>
                              <td className="px-3 py-2">
                                <Badge 
                                  variant={row.priority === 'high' ? 'destructive' : row.priority === 'low' ? 'secondary' : 'outline'}
                                  className={row.priority === 'medium' ? 'bg-warning text-warning-foreground' : ''}
                                >
                                  {row.priority === 'high' ? t('priority.high') : row.priority === 'low' ? t('priority.low') : t('priority.medium')}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 max-w-[300px] truncate text-muted-foreground">{row.prompt}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="import_azure" className="space-y-4 mt-4">
              {!projectId && (
                <div className="rounded-lg border border-warning bg-warning/10 p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-warning">{i18n.language === 'cs' ? 'Nejprve vyberte projekt' : 'Select a project first'}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {i18n.language === 'cs' 
                        ? 'Pro import testů z Azure DevOps musíte nejprve vybrat projekt v sekci výše.'
                        : 'To import tests from Azure DevOps, you must first select a project above.'}
                    </p>
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label>{t('testGenerator.azureUpload')}</Label>
                <div className="flex items-center gap-3">
                  <input
                    ref={xlsxInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleXlsxUpload}
                    className="hidden"
                    id="xlsx-upload"
                    disabled={!projectId}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!projectId) {
                        toast.error(i18n.language === 'cs' ? "Nejprve vyberte projekt" : "Select a project first");
                        return;
                      }
                      xlsxInputRef.current?.click();
                    }}
                    className="flex items-center gap-2"
                    disabled={!projectId}
                  >
                    <Upload className="w-4 h-4" />
                    {i18n.language === 'cs' ? 'Nahrát XLSX' : 'Upload XLSX'}
                  </Button>
                  {xlsxFile && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>{xlsxFile.name}</span>
                      <Badge variant="secondary">{parsedAzureTests.length} {i18n.language === 'cs' ? 'testů' : 'tests'}</Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearXlsxFile}
                        className="h-6 w-6 p-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('testGenerator.azureHelp')}
                </p>
              </div>

              {/* Azure DevOps Preview with Enhanced Statistics */}
              {xlsxPreview.length > 0 && (
                <div className="space-y-4">
                  {/* Statistics Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                      <p className="text-xs text-muted-foreground">{t('testGenerator.totalTests')}</p>
                      <p className="text-2xl font-bold text-primary">{parsedAzureTests.length}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted border">
                      <p className="text-xs text-muted-foreground">{t('testGenerator.totalSteps')}</p>
                      <p className="text-2xl font-bold">
                        {xlsxPreview.reduce((acc, t) => acc + t.steps.length, 0) + 
                          (parsedAzureTests.length > 5 
                            ? Math.round((parsedAzureTests.length - 5) * (xlsxPreview.reduce((acc, t) => acc + t.steps.length, 0) / 5))
                            : 0)}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted border">
                      <p className="text-xs text-muted-foreground">{t('testGenerator.avgStepsPerTest')}</p>
                      <p className="text-2xl font-bold">
                        {xlsxPreview.length > 0 
                          ? (xlsxPreview.reduce((acc, t) => acc + t.steps.length, 0) / xlsxPreview.length).toFixed(1)
                          : 0}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                      <p className="text-xs text-muted-foreground">{t('testGenerator.estimatedRunTime')}</p>
                      <p className="text-2xl font-bold text-warning">~{Math.ceil(parsedAzureTests.length * AVG_TIME_PER_TEST)} min</p>
                    </div>
                  </div>

                  {/* Chunk Size Selector with dynamic estimate */}
                  <div className="p-4 rounded-lg bg-muted/50 border space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Layers className="w-4 h-4" />
                        {i18n.language === 'cs' ? 'Velikost chunku pro import' : 'Import chunk size'}
                      </Label>
                      <div className="text-right">
                        <span className="text-sm text-muted-foreground">
                          {i18n.language === 'cs' ? 'Odhadovaný čas na chunk:' : 'Est. time per chunk:'}{' '}
                        </span>
                        <span className="font-semibold text-warning">
                          ~{importChunkSize * AVG_TIME_PER_TEST} min
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Select value={importChunkSize.toString()} onValueChange={(v) => setImportChunkSize(parseInt(v))}>
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10 {i18n.language === 'cs' ? 'testů' : 'tests'} (~{10 * AVG_TIME_PER_TEST} min)</SelectItem>
                          <SelectItem value="25">25 {i18n.language === 'cs' ? 'testů' : 'tests'} (~{25 * AVG_TIME_PER_TEST} min)</SelectItem>
                          <SelectItem value="50">50 {i18n.language === 'cs' ? 'testů' : 'tests'} (~{50 * AVG_TIME_PER_TEST} min)</SelectItem>
                          <SelectItem value="100">100 {i18n.language === 'cs' ? 'testů' : 'tests'} (~{100 * AVG_TIME_PER_TEST} min)</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex-1 text-sm text-muted-foreground">
                        {Math.ceil(parsedAzureTests.length / importChunkSize)} {i18n.language === 'cs' ? 'chunků celkem' : 'chunks total'}
                      </div>
                    </div>
                  </div>

                  <Label className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-primary" />
                    {t('testGenerator.azurePreview')} ({Math.min(5, parsedAzureTests.length)}/{parsedAzureTests.length})
                  </Label>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="overflow-x-auto max-h-80">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">ID</th>
                            <th className="px-3 py-2 text-left font-medium">{t('tests.testName')}</th>
                            <th className="px-3 py-2 text-left font-medium">{t('taskDetail.steps')}</th>
                            <th className="px-3 py-2 text-left font-medium">{i18n.language === 'cs' ? 'První krok' : 'First step'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {xlsxPreview.map((test, idx) => (
                            <tr key={idx} className="border-t border-border">
                              <td className="px-3 py-2 text-muted-foreground">{test.id}</td>
                              <td className="px-3 py-2 font-medium max-w-[200px] truncate">{test.title}</td>
                              <td className="px-3 py-2">
                                <Badge variant="outline">{test.steps.length} {i18n.language === 'cs' ? 'kroků' : 'steps'}</Badge>
                              </td>
                              <td className="px-3 py-2 max-w-[300px] truncate text-muted-foreground">
                                {test.steps[0]?.action || '-'}
                              </td>
                            </tr>
                          ))}
                          {parsedAzureTests.length > 5 && (
                            <tr className="border-t border-border bg-muted/30">
                              <td colSpan={4} className="px-3 py-2 text-center text-muted-foreground text-sm">
                                ... {i18n.language === 'cs' ? `a dalších ${parsedAzureTests.length - 5} testů` : `and ${parsedAzureTests.length - 5} more tests`}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Action buttons based on selected tab */}
          {(sourceTab === 'description' || sourceTab === 'documentation') && (
            <Button 
              onClick={handleGenerate} 
              disabled={isLoading} 
              className="w-full gradient-primary"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('testGenerator.generatingTests')}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t('testGenerator.generateTests')}
                </>
              )}
            </Button>
          )}

          {sourceTab === 'import_text' && (
            <Button 
              onClick={handleParseFromText} 
              disabled={isParsingText || !rawTestsInput.trim()} 
              className="w-full gradient-primary"
            >
              {isParsingText ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('testGenerator.parsingTests')}
                </>
              ) : (
                <>
                  <ClipboardPaste className="mr-2 h-4 w-4" />
                  {t('testGenerator.parseTests')}
                </>
              )}
            </Button>
          )}

          {sourceTab === 'import_csv' && (
            <Button 
              onClick={handleImportCsv} 
              disabled={parsedCsvTests.length === 0} 
              className="w-full gradient-primary"
            >
              <Table2 className="mr-2 h-4 w-4" />
              {t('testGenerator.importCsv')} ({parsedCsvTests.length})
            </Button>
          )}

          {sourceTab === 'import_azure' && (
            <div className="space-y-3">
              {importProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{t('testGenerator.importProgress', { current: importProgress.current, total: importProgress.total })}</span>
                    <span className="text-muted-foreground">{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
                  </div>
                  <Progress value={(importProgress.current / importProgress.total) * 100} className="h-2" />
                </div>
              )}
              <Button 
                onClick={handleImportAzure} 
                disabled={parsedAzureTests.length === 0 || isImportingAzure} 
                className="w-full gradient-primary"
              >
                {isImportingAzure ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {importProgress 
                      ? t('testGenerator.importProgress', { current: importProgress.current, total: importProgress.total })
                      : t('testGenerator.importingAzure')}
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    {t('testGenerator.importAzure')} ({parsedAzureTests.length})
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generated Tests */}
      {generatedTests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('testGenerator.generatedTests')} ({generatedTests.length})</CardTitle>
            <CardDescription>
              {i18n.language === 'cs' 
                ? 'Můžete testy spustit přímo nebo je uložit pro pozdější použití'
                : 'You can run tests directly or save them for later use'}
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
                    <p className="text-sm text-muted-foreground">{t('testGenerator.expectedResult')}:</p>
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
                {i18n.language === 'cs' ? 'Uložit všechny' : 'Save all'}
              </Button>
              <Button
                className="gradient-primary"
                onClick={() => generatedTests.forEach(t => runTest(t))}
              >
                <Play className="mr-2 h-4 w-4" />
                {i18n.language === 'cs' ? 'Spustit všechny' : 'Run all'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
