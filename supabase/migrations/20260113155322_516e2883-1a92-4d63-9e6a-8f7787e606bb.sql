-- Add test_suite_id column to generated_tests table
ALTER TABLE public.generated_tests 
ADD COLUMN test_suite_id uuid REFERENCES public.test_suites(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_generated_tests_suite_id ON public.generated_tests(test_suite_id);