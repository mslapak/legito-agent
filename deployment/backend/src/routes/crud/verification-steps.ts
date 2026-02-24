import { createCrudRouter } from '../../utils/crud';

export const verificationStepsRouter = createCrudRouter({
  table: 'public.verification_steps',
  insertCols: ['verification_id', 'step_number', 'step_description', 'status', 'result', 'task_id'],
  updateCols: ['status', 'result', 'task_id', 'completed_at'],
  userScoped: false, // scoped via verification_id -> user check at app level
});
