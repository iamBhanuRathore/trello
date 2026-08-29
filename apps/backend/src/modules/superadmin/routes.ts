import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePlatformAdmin } from '../../middleware/auth';
import {
  listTenants,
  updateTenantDatabase,
  listPlans,
  updatePlan,
  listPlatformUsers,
  getPlatformUser,
  forceLogoutPlatformUser,
} from './service';

export const superadminRoutes = new Elysia({ prefix: '/superadmin' })
  .use(authPlugin)
  .guard({ beforeHandle: requirePlatformAdmin() }, (app) =>
    app
      .get('/orgs', async () => {
        return listTenants(db);
      })
      .patch(
        '/orgs/:id/database',
        async ({ params, body }) => {
          return updateTenantDatabase(db, params.id, body);
        },
        {
          params: t.Object({
            id: t.String(),
          }),
          body: t.Object({
            isDedicatedDb: t.Boolean(),
            dedicatedDbUrl: t.Optional(t.Nullable(t.String())),
          }),
        }
      )
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
      )
      .get('/users', async () => {
        return listPlatformUsers(db);
      })
      .get(
        '/users/:id',
        async ({ params }) => {
          return getPlatformUser(db, params.id);
        },
        {
          params: t.Object({
            id: t.String(),
          }),
        }
      )
      .post(
        '/users/:id/force-logout',
        async ({ params, user }) => {
          return forceLogoutPlatformUser(db, params.id, user.userId);
        },
        {
          params: t.Object({
            id: t.String(),
          }),
        }
      )
  );
