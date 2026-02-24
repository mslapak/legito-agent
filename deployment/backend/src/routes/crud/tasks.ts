import { createCrudRouter } from '../../utils/crud';

export const tasksRouter = createCrudRouter({
  table: 'public.tasks',
  insertCols: ['project_id', 'title', 'prompt', 'task_type', 'status', 'priority', 'browser_use_task_id', 'live_url', 'result', 'steps', 'step_count', 'screenshots', 'recordings', 'error_message', 'started_at', 'completed_at'],
  updateCols: ['title', 'prompt', 'status', 'priority', 'browser_use_task_id', 'live_url', 'result', 'steps', 'step_count', 'screenshots', 'recordings', 'error_message', 'started_at', 'completed_at'],
  userScoped: true,
  parentFilter: { param: 'project_id', column: 'project_id' },
});
