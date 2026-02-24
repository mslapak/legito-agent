import { createCrudRouter } from '../../utils/crud';

export const testBatchRunsRouter = createCrudRouter({
  table: 'public.test_batch_runs',
  insertCols: ['test_ids', 'total_tests', 'batch_size', 'status'],
  updateCols: ['completed_tests', 'passed_tests', 'failed_tests', 'current_test_id', 'status', 'paused', 'error_message', 'started_at', 'completed_at'],
  userScoped: true,
});
