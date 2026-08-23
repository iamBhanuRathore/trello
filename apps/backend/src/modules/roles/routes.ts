import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import {
  listRoles,
  getAvailablePermissions,
  createCustomRole,
  updateCustomRole,
  deleteCustomRole,
} from './service';

export const roleRoutes = new Elysia({ prefix: '/roles', tags: ['Roles'] })
  .use(authPlugin)

  // GET /v1/roles/permissions
  .use(requirePermission('org.read'))
  .get('/permissions', async ({ set }) => {
    try {
      return await getAvailablePermissions(db);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  })

  // GET /v1/roles
  .use(requirePermission('org.read'))
  .get('/', async ({ user, set }) => {
    try {
      return await listRoles(db, user.organizationId);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  })

  // POST /v1/roles
  .use(requirePermission('org.update'))
  .post(
    '/',
    async ({ body, user, set }) => {
      try {
        return await createCustomRole(db, user.organizationId, body);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        name: t.String(),
        permissionIds: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // PATCH /v1/roles/:id
  .use(requirePermission('org.update'))
  .patch(
    '/:id',
    async ({ params: { id }, body, user, set }) => {
      try {
        return await updateCustomRole(db, user.organizationId, id, body);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        permissionIds: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // DELETE /v1/roles/:id
  .use(requirePermission('org.update'))
  .delete(
    '/:id',
    async ({ params: { id }, user, set }) => {
      try {
        return await deleteCustomRole(db, user.organizationId, id);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
    }
  );
