import { createCrudRouter } from '../../utils/crud';

export const projectCredentialsRouter = createCrudRouter({
  table: 'public.project_credentials',
  insertCols: ['project_id', 'name', 'username', 'password', 'description'],
  updateCols: ['name', 'username', 'password', 'description'],
  userScoped: true,
  parentFilter: { param: 'project_id', column: 'project_id' },
});
