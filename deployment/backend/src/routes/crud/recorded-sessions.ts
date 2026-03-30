import { createCrudRouter } from '../../utils/crud';

export const recordedSessionsRouter = createCrudRouter({
  table: 'public.recorded_sessions',
  insertCols: ['project_id', 'title', 'browser_use_task_id', 'task_id', 'recorded_steps', 'generated_test_ids', 'status', 'completed_at'],
  updateCols: ['title', 'recorded_steps', 'generated_test_ids', 'status', 'completed_at'],
  userScoped: true,
  parentFilter: { param: 'project_id', column: 'project_id' },
});
