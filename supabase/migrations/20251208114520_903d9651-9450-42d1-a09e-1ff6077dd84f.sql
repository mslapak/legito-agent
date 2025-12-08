-- Create project_credentials table for storing login credentials
CREATE TABLE public.project_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Výchozí účet',
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);

-- Enable RLS
ALTER TABLE public.project_credentials ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own credentials"
ON public.project_credentials FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own credentials"
ON public.project_credentials FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own credentials"
ON public.project_credentials FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own credentials"
ON public.project_credentials FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_project_credentials_updated_at
BEFORE UPDATE ON public.project_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();