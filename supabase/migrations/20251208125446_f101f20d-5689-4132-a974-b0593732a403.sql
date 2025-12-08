-- Create table for documentation verification results
CREATE TABLE public.documentation_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  documentation_source TEXT NOT NULL, -- 'file', 'url', 'text'
  documentation_url TEXT,
  documentation_preview TEXT, -- first 500 chars of documentation
  total_steps INTEGER NOT NULL DEFAULT 0,
  passed_steps INTEGER NOT NULL DEFAULT 0,
  failed_steps INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create table for individual verification steps
CREATE TABLE public.verification_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  verification_id UUID NOT NULL REFERENCES public.documentation_verifications(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'passed', 'failed'
  result TEXT,
  task_id UUID REFERENCES public.tasks(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.documentation_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_steps ENABLE ROW LEVEL SECURITY;

-- RLS policies for documentation_verifications
CREATE POLICY "Users can view own verifications"
ON public.documentation_verifications
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own verifications"
ON public.documentation_verifications
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own verifications"
ON public.documentation_verifications
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own verifications"
ON public.documentation_verifications
FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for verification_steps (via verification ownership)
CREATE POLICY "Users can view own verification steps"
ON public.verification_steps
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.documentation_verifications dv
    WHERE dv.id = verification_id AND dv.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create verification steps"
ON public.verification_steps
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.documentation_verifications dv
    WHERE dv.id = verification_id AND dv.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update verification steps"
ON public.verification_steps
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.documentation_verifications dv
    WHERE dv.id = verification_id AND dv.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete verification steps"
ON public.verification_steps
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.documentation_verifications dv
    WHERE dv.id = verification_id AND dv.user_id = auth.uid()
  )
);

-- Create indexes for performance
CREATE INDEX idx_doc_verifications_project ON public.documentation_verifications(project_id);
CREATE INDEX idx_doc_verifications_user ON public.documentation_verifications(user_id);
CREATE INDEX idx_verification_steps_verification ON public.verification_steps(verification_id);