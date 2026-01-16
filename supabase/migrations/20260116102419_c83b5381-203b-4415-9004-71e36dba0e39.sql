-- Add cost tracking columns to generated_tests
ALTER TABLE public.generated_tests 
ADD COLUMN IF NOT EXISTS step_count integer,
ADD COLUMN IF NOT EXISTS estimated_cost decimal(10,4);

-- Add step_count to tasks for consistency
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS step_count integer;

-- Add comment for documentation
COMMENT ON COLUMN public.generated_tests.step_count IS 'Number of agent steps executed';
COMMENT ON COLUMN public.generated_tests.estimated_cost IS 'Estimated cost in USD based on steps and proxy usage';
COMMENT ON COLUMN public.tasks.step_count IS 'Number of agent steps executed';