-- Add setup_prompt column to projects table
ALTER TABLE public.projects ADD COLUMN setup_prompt TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.projects.setup_prompt IS 'Prompt that runs before each test (e.g., login flow, navigation to starting page)';