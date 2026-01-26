-- Create trigger for automatic updated_at on test_batch_runs
CREATE TRIGGER batch_runs_updated_at
  BEFORE UPDATE ON test_batch_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();