import { createCrudRouter } from '../../utils/crud';

export const testCasesRouter = createCrudRouter({
  table: 'public.test_cases',
  insertCols: ['test_suite_id', 'title', 'prompt', 'expected_result', 'priority'],
  updateCols: ['title', 'prompt', 'expected_result', 'priority', 'test_suite_id'],
  userScoped: true,
  parentFilter: { param: 'test_suite_id', column: 'test_suite_id' },
});
