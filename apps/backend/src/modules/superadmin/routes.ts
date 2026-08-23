import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { requirePlatformAdmin } from '../../middleware/auth';
import { listTenants, listPlans, updatePlan } from './service';

export const superadminRoutes = new Elysia({ prefix: '/superadmin' })
  .use(requirePlatformAdmin())

  .get('/orgs', async () => {
    return listTenants(db);
  })

  .get('/plans', async () => {
    return listPlans(db);
  })

  .patch(
    '/plans/:id',
    async ({ params, body }) => {
      return updatePlan(db, params.id, body);
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        maxWorkspaces: t.Optional(t.Number()),
        maxBoards: t.Optional(t.Number()),
        maxStorageGb: t.Optional(t.Number()),
        maxSeats: t.Optional(t.Number()),
        featureFlags: t.Optional(t.Any()),
      }),
    }
  );
