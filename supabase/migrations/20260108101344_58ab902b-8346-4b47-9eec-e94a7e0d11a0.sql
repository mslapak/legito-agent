-- Add azure_devops_id column for tracking imported tests
ALTER TABLE public.generated_tests 
ADD COLUMN azure_devops_id TEXT;