-- Add browser_profile_id column to projects table for persistent login state
ALTER TABLE public.projects 
ADD COLUMN browser_profile_id TEXT;

COMMENT ON COLUMN public.projects.browser_profile_id IS 
  'Browser-Use Cloud profile ID for persistent login state between browser sessions';