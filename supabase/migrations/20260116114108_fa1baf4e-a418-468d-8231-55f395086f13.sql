-- Create unique partial index to enforce only one active batch per user
-- "Active" means status is 'pending' or 'running'
CREATE UNIQUE INDEX idx_one_active_batch_per_user 
ON public.test_batch_runs (user_id) 
WHERE status IN ('pending', 'running');