-- Add columns for storing test run results directly on generated_tests
ALTER TABLE generated_tests 
ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS execution_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS result_summary TEXT,
ADD COLUMN IF NOT EXISTS result_reasoning TEXT;

-- Add index for faster queries on last_run_at
CREATE INDEX IF NOT EXISTS idx_generated_tests_last_run_at ON generated_tests(last_run_at DESC);