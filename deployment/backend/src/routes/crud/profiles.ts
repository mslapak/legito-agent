import { createCrudRouter } from '../../utils/crud';

export const profilesRouter = createCrudRouter({
  table: 'public.profiles',
  insertCols: ['email', 'full_name', 'avatar_url'],
  updateCols: ['email', 'full_name', 'avatar_url'],
  userScoped: true,
});
