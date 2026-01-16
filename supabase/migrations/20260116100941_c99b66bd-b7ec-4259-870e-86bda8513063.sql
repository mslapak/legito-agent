-- Add cost optimization columns to projects table
ALTER TABLE public.projects 
ADD COLUMN max_steps integer NOT NULL DEFAULT 10,
ADD COLUMN record_video boolean NOT NULL DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN public.projects.max_steps IS 'Maximum number of Browser-Use agent steps (5-20). Lower = cheaper.';
COMMENT ON COLUMN public.projects.record_video IS 'Whether to record video during browser automation. Disabling saves ~20-30% proxy costs.';