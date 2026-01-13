-- Add columns for configurable batch execution
ALTER TABLE test_batch_runs 
ADD COLUMN IF NOT EXISTS batch_size INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS paused BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add indexes for better performance with 1000+ tests
CREATE INDEX IF NOT EXISTS idx_generated_tests_project_status ON generated_tests(project_id, status);
CREATE INDEX IF NOT EXISTS idx_generated_tests_azure_id ON generated_tests(azure_devops_id);
CREATE INDEX IF NOT EXISTS idx_generated_tests_user_created ON generated_tests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_tests_status ON generated_tests(status);
CREATE INDEX IF NOT EXISTS idx_generated_tests_priority ON generated_tests(priority);