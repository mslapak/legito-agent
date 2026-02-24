import { createCrudRouter } from '../../utils/crud';

export const documentationVerificationsRouter = createCrudRouter({
  table: 'public.documentation_verifications',
  insertCols: ['project_id', 'documentation_source', 'documentation_url', 'documentation_preview', 'total_steps', 'passed_steps', 'failed_steps', 'status'],
  updateCols: ['total_steps', 'passed_steps', 'failed_steps', 'status', 'completed_at', 'documentation_preview'],
  userScoped: true,
  parentFilter: { param: 'project_id', column: 'project_id' },
});
