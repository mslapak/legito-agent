-- Create table for operation trainings
CREATE TABLE public.operation_trainings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  source_type TEXT DEFAULT 'file',
  source_content TEXT,
  structured_instructions JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.operation_trainings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own trainings" ON public.operation_trainings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own trainings" ON public.operation_trainings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trainings" ON public.operation_trainings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trainings" ON public.operation_trainings FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_operation_trainings_updated_at
  BEFORE UPDATE ON public.operation_trainings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();