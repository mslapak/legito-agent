import { createCrudRouter } from '../../utils/crud';

export const operationTemplatesRouter = createCrudRouter({
  table: 'public.operation_templates',
  insertCols: ['name', 'description', 'prompt', 'steps'],
  updateCols: ['name', 'description', 'prompt', 'steps'],
  userScoped: true,
});
