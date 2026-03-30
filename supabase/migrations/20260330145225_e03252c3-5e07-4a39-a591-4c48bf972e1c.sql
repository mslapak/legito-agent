
CREATE TABLE public.recorded_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  browser_use_task_id text,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  recorded_steps jsonb,
  generated_test_ids uuid[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'recording',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.recorded_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recorded sessions" ON public.recorded_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own recorded sessions" ON public.recorded_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own recorded sessions" ON public.recorded_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own recorded sessions" ON public.recorded_sessions FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_recorded_sessions_updated_at BEFORE UPDATE ON public.recorded_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
