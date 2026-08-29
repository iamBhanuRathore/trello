import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
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
  .get(
    '/permissions',
    async ({ set }) => {
      try {
        return await getAvailablePermissions(db);
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.read'),
    }
  )

  // GET /v1/roles
  .get(
    '/',
    async ({ user, set }) => {
      try {
        return await listRoles(db, user.organizationId);
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.read'),
    }
  )

  // POST /v1/roles
  .post(
    '/',
    async ({ body, user, set }) => {
      try {
        return await createCustomRole(db, user.organizationId, body);
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      body: t.Object({
        name: t.String(),
        permissionIds: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // PATCH /v1/roles/:id
  .patch(
    '/:id',
    async ({ params: { id }, body, user, set }) => {
      try {
        return await updateCustomRole(db, user.organizationId, id, body);
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        permissionIds: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // DELETE /v1/roles/:id
  .delete(
    '/:id',
    async ({ params: { id }, user, set }) => {
      try {
        return await deleteCustomRole(db, user.organizationId, id);
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      params: t.Object({ id: t.String() }),
    }
  );
