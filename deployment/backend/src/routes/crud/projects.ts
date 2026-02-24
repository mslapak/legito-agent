import { createCrudRouter } from '../../utils/crud';

export const projectsRouter = createCrudRouter({
  table: 'public.projects',
  insertCols: ['name', 'description', 'base_url', 'setup_prompt', 'browser_profile_id', 'max_steps', 'record_video', 'batch_delay_seconds'],
  updateCols: ['name', 'description', 'base_url', 'setup_prompt', 'browser_profile_id', 'max_steps', 'record_video', 'batch_delay_seconds'],
  userScoped: true,
});
