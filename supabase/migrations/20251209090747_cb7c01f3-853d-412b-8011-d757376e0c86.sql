-- Add task_type column to distinguish between tests and operations
ALTER TABLE public.tasks 
ADD COLUMN task_type text NOT NULL DEFAULT 'test';

-- Add constraint to limit values
ALTER TABLE public.tasks 
ADD CONSTRAINT task_type_check CHECK (task_type IN ('test', 'operation'));