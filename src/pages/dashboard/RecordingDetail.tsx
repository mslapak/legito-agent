import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { ArrowLeft, Download, Save, Loader2, Pencil, Trash2, CheckCircle2, ExternalLink } from 'lucide-react';
import * as XLSX from 'xlsx';

interface RecordedSession {
  id: string;
  title: string;
  status: string;
  recorded_steps: any[];
  generated_test_ids: string[];
  created_at: string;
  completed_at: string | null;
  project_id: string | null;
}

interface GeneratedTest {
  id: string;
  title: string;
  prompt: string;
  expected_result: string | null;
  priority: string;
  status: string;
}

export default function RecordingDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState<RecordedSession | null>(null);
  const [tests, setTests] = useState<GeneratedTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Edit dialog
  const [editTest, setEditTest] = useState<GeneratedTest | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editExpected, setEditExpected] = useState('');
  const [editPriority, setEditPriority] = useState('medium');

  useEffect(() => {
    if (id && user) fetchData();
  }, [id, user]);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch session
    const { data: sessionData } = await supabase
      .from('recorded_sessions')
      .select('*')
      .eq('id', id!)
      .single();

    if (sessionData) {
      const s = sessionData as any as RecordedSession;
      setSession(s);

      // Fetch linked tests
      if (s.generated_test_ids?.length > 0) {
        const { data: testsData } = await supabase
          .from('generated_tests')
          .select('id, title, prompt, expected_result, priority, status')
          .in('id', s.generated_test_ids);
        if (testsData) setTests(testsData);
      }
    }
    setLoading(false);
  };

  const openEditDialog = (test: GeneratedTest) => {
    setEditTest(test);
    setEditTitle(test.title);
    setEditPrompt(test.prompt);
    setEditExpected(test.expected_result || '');
    setEditPriority(test.priority);
  };

  const saveEdit = async () => {
    if (!editTest) return;
    const { error } = await supabase
      .from('generated_tests')
      .update({
        title: editTitle,
        prompt: editPrompt,
        expected_result: editExpected || null,
        priority: editPriority,
      })
      .eq('id', editTest.id);

    if (error) {
      toast.error(t('common.error'));
    } else {
      toast.success(t('common.success'));
      setTests(prev => prev.map(t => t.id === editTest.id ? { ...t, title: editTitle, prompt: editPrompt, expected_result: editExpected || null, priority: editPriority } : t));
      setEditTest(null);
    }
  };

  const deleteTest = async (testId: string) => {
    await supabase.from('generated_tests').delete().eq('id', testId);
    setTests(prev => prev.filter(t => t.id !== testId));
    toast.success(t('common.success'));
  };

  const exportToXlsx = () => {
    setExporting(true);
    try {
      const rows = tests.map((test, i) => ({
        'ID': i + 1,
        'Title': test.title,
        'Step Action': test.prompt,
        'Step Expected Result': test.expected_result || '',
        'Priority': test.priority,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      
      // Column widths
      ws['!cols'] = [
        { wch: 5 },
        { wch: 40 },
        { wch: 60 },
        { wch: 40 },
        { wch: 10 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');
      XLSX.writeFile(wb, `${session?.title || 'recording'}_test_cases.xlsx`);
      toast.success(t('recorder.exportSuccess'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setExporting(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high': return <Badge variant="destructive">{t('priority.high')}</Badge>;
      case 'medium': return <Badge variant="secondary">{t('priority.medium')}</Badge>;
      case 'low': return <Badge variant="outline">{t('priority.low')}</Badge>;
      default: return <Badge variant="outline">{priority}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">{t('recorder.sessionNotFound')}</p>
        <Button variant="link" onClick={() => navigate('/dashboard/recorder')}>{t('common.back')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/recorder')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{session.title}</h2>
            <p className="text-sm text-muted-foreground">
              {new Date(session.created_at).toLocaleString()} · {tests.length} {t('recorder.testCases')}
            </p>
          </div>
        </div>
        <Button onClick={exportToXlsx} disabled={exporting || tests.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          {t('recorder.exportXlsx')}
        </Button>
      </div>

      {/* Recorded Steps */}
      {session.recorded_steps?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('recorder.recordedSteps')} ({session.recorded_steps.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-64">
              <div className="space-y-2">
                {session.recorded_steps.map((step: any, i: number) => (
                  <div key={i} className="flex gap-3 p-2 rounded border text-sm">
                    <span className="text-muted-foreground font-mono w-6 shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      {step.next_goal && <p className="font-medium">{step.next_goal}</p>}
                      {step.evaluation_previous_goal && (
                        <p className="text-muted-foreground text-xs mt-0.5">{step.evaluation_previous_goal}</p>
                      )}
                      {step.url && (
                        <p className="text-xs text-primary/70 truncate mt-0.5">{step.url}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Generated Test Cases */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('recorder.generatedTests')} ({tests.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {tests.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{t('recorder.noTestsGenerated')}</p>
          ) : (
            <div className="space-y-3">
              {tests.map(test => (
                <div key={test.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      <h3 className="font-medium text-sm">{test.title}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {getPriorityBadge(test.priority)}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(test)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTest(test.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{test.prompt}</p>
                  {test.expected_result && (
                    <p className="text-xs text-primary/80">
                      <span className="font-medium">{t('testGenerator.expectedResult')}:</span> {test.expected_result}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editTest} onOpenChange={(open) => !open && setEditTest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('tests.testName')}</Label>
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Prompt</Label>
              <Textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)} rows={4} />
            </div>
            <div className="space-y-2">
              <Label>{t('testGenerator.expectedResult')}</Label>
              <Textarea value={editExpected} onChange={e => setEditExpected(e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>{t('tests.priority')}</Label>
              <Select value={editPriority} onValueChange={setEditPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">{t('priority.high')}</SelectItem>
                  <SelectItem value="medium">{t('priority.medium')}</SelectItem>
                  <SelectItem value="low">{t('priority.low')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTest(null)}>{t('common.cancel')}</Button>
            <Button onClick={saveEdit}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
