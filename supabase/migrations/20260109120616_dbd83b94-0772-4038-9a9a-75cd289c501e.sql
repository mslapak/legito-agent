-- Create table for tracking batch test runs
CREATE TABLE public.test_batch_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  total_tests INTEGER NOT NULL,
  completed_tests INTEGER DEFAULT 0,
  passed_tests INTEGER DEFAULT 0,
  failed_tests INTEGER DEFAULT 0,
  test_ids UUID[] NOT NULL,
  current_test_id UUID,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.test_batch_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own batch runs"
ON public.test_batch_runs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own batch runs"
ON public.test_batch_runs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own batch runs"
ON public.test_batch_runs FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own batch runs"
ON public.test_batch_runs FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_test_batch_runs_updated_at
BEFORE UPDATE ON public.test_batch_runs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.test_batch_runs;