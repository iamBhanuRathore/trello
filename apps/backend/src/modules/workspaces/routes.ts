import Elysia, { t } from 'elysia';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { db } from '../../db/index';
import { handleRouteError } from '../../lib/errors';
import {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getWorkspaceTree,
} from './service';

/** Workspace routes — /v1/workspaces/* */
export const workspaceRoutes = new Elysia({ prefix: '/workspaces', tags: ['Workspaces'] })
  .use(authPlugin)

  // GET /v1/workspaces/tree — aggregate workspaces→projects→boards (kills N+1).
  // Must be registered before /:id so "tree" isn't captured as a param.
  .get(
    '/tree',
    async ({ user, set }) => {
      try {
        return await getWorkspaceTree(db, user.organizationId, user.userId, user.isPlatformAdmin);
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('workspace.read'),
    }
  )

  // GET /v1/workspaces
  .get(
    '/',
    async ({ user, set }) => {
      try {
        return await listWorkspaces(db, user.organizationId, user.userId, user.isPlatformAdmin);
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('workspace.read'),
    }
  )

  // POST /v1/workspaces
  .post(
    '/',
    async ({ body, user, set }) => {
      try {
        return await createWorkspace(db, {
          organizationId: user.organizationId,
          name: body.name,
          description: body.description,
          visibility: body.visibility as any,
          creatorId: user.userId,
        });
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('workspace.create'),
      body: t.Object({
        name: t.String(),
        description: t.Optional(t.String()),
        visibility: t.Optional(t.String()),
      }),
    }
  )

  // GET /v1/workspaces/:id
  .get(
    '/:id',
    async ({ params, user, set }) => {
      try {
        return await getWorkspace(db, params.id, user.organizationId);
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('workspace.read'),
    }
  )

  // PATCH /v1/workspaces/:id
  .patch(
    '/:id',
    async ({ params, body, user, set }) => {
      try {
        return await updateWorkspace(db, params.id, user.organizationId, body);
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('workspace.update'),
      body: t.Object({ name: t.Optional(t.String()), description: t.Optional(t.String()) }),
    }
  )

  // DELETE /v1/workspaces/:id
  .delete(
    '/:id',
    async ({ params, user, set }) => {
      try {
        await deleteWorkspace(db, params.id, user.organizationId);
        return { success: true };
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('workspace.delete'),
    }
  );
