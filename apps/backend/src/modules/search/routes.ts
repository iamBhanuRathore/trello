import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin } from '../../middleware/auth';
import { performSearch, listSavedSearches, createSavedSearch, deleteSavedSearch } from './service';

export const searchRoutes = new Elysia({ prefix: '/search' })
  .use(authPlugin)

  .get('/', async ({ query: { q }, user }) => {
    if (!q || typeof q !== 'string') return [];
    return performSearch(db, user.organizationId, q);
  }, {
    query: t.Object({ q: t.String() })
  })

  .get('/saved', async ({ user }) => {
    return listSavedSearches(db, user.userId);
  })

  .post('/saved', async ({ user, body }) => {
    return createSavedSearch(db, user.userId, body as any);
  }, {
    body: t.Object({
      name: t.String(),
      query: t.String(),
      filters: t.Optional(t.Any())
    })
  })

  .delete('/saved/:id', async ({ user, params: { id } }) => {
    return deleteSavedSearch(db, user.userId, id);
  }, {
    params: t.Object({ id: t.String() })
  });
