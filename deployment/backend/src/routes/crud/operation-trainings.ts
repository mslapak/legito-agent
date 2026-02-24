import { createCrudRouter } from '../../utils/crud';

export const operationTrainingsRouter = createCrudRouter({
  table: 'public.operation_trainings',
  insertCols: ['name', 'description', 'source_type', 'source_content', 'structured_instructions'],
  updateCols: ['name', 'description', 'source_type', 'source_content', 'structured_instructions'],
  userScoped: true,
});
