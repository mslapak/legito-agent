-- Create table for generated tests with status tracking
CREATE TABLE public.generated_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  expected_result TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  source_type TEXT DEFAULT 'description',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.generated_tests ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own generated tests" 
ON public.generated_tests 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own generated tests" 
ON public.generated_tests 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own generated tests" 
ON public.generated_tests 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own generated tests" 
ON public.generated_tests 
FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_generated_tests_updated_at
BEFORE UPDATE ON public.generated_tests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster queries
CREATE INDEX idx_generated_tests_project ON public.generated_tests(project_id);
CREATE INDEX idx_generated_tests_user ON public.generated_tests(user_id);