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
  assignTeamRole,
  removeTeamRole,
  listMemberTeamRoles,
} from './service';

export const roleRoutes = new Elysia({ prefix: '/roles', tags: ['Roles'] })
  .use(authPlugin)

  // GET /v1/roles/permissions
  .get(
    '/permissions',
    async ({ set }) => {
      try {
        return await getAvailablePermissions(db);
      } catch (err: unknown) {
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
      } catch (err: unknown) {
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
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      body: t.Object({
        name: t.String(),
        description: t.Optional(t.String()),
        isDefault: t.Optional(t.Boolean()),
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
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        isDefault: t.Optional(t.Boolean()),
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
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      params: t.Object({ id: t.String() }),
    }
  )

  // GET /v1/roles/members/:userId — team roles held by a member
  .get(
    '/members/:userId',
    async ({ params: { userId }, user, set }) => {
      try {
        return await listMemberTeamRoles(db, user.organizationId, userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.read'),
      params: t.Object({ userId: t.String({ format: 'uuid' }) }),
    }
  )

  // POST /v1/roles/members/:userId — attach a team role (company admin)
  .post(
    '/members/:userId',
    async ({ params: { userId }, body, user, set }) => {
      try {
        return await assignTeamRole(db, user.organizationId, userId, body.roleId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      params: t.Object({ userId: t.String({ format: 'uuid' }) }),
      body: t.Object({ roleId: t.String({ format: 'uuid' }) }),
    }
  )

  // DELETE /v1/roles/members/:userId/:roleId — detach a team role
  .delete(
    '/members/:userId/:roleId',
    async ({ params: { userId, roleId }, user, set }) => {
      try {
        return await removeTeamRole(db, user.organizationId, userId, roleId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      params: t.Object({
        userId: t.String({ format: 'uuid' }),
        roleId: t.String({ format: 'uuid' }),
      }),
    }
  );
