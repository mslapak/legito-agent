import { createCrudRouter } from '../../utils/crud';

export const testSuitesRouter = createCrudRouter({
  table: 'public.test_suites',
  insertCols: ['project_id', 'name', 'description'],
  updateCols: ['name', 'description', 'project_id'],
  userScoped: true,
  parentFilter: { param: 'project_id', column: 'project_id' },
});
