-- Add batch_delay_seconds column to projects table
ALTER TABLE public.projects 
ADD COLUMN batch_delay_seconds integer DEFAULT 10;

-- Add comment for documentation
COMMENT ON COLUMN public.projects.batch_delay_seconds IS 'Delay in seconds between tests in batch runs to prevent concurrent session limits';