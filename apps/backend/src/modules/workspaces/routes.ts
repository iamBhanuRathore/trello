import Elysia, { t } from 'elysia';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { db } from '../../db/index';
import { createWorkspace, listWorkspaces, getWorkspace, updateWorkspace, deleteWorkspace } from './service';

/** Workspace routes — /v1/workspaces/* */
export const workspaceRoutes = new Elysia({ prefix: '/workspaces', tags: ['Workspaces'] })
  .use(authPlugin)

  // GET /v1/workspaces
  .use(requirePermission('workspace.read'))
  .get('/', async ({ user, set }) => {
    try {
      return await listWorkspaces(db, user.organizationId, user.userId, user.isPlatformAdmin);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  })

  // POST /v1/workspaces
  .use(requirePermission('workspace.create'))
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
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        name: t.String(),
        description: t.Optional(t.String()),
        visibility: t.Optional(t.String()),
      }),
    }
  )

  // GET /v1/workspaces/:id
  .use(requirePermission('workspace.read'))
  .get('/:id', async ({ params, user, set }) => {
    try {
      return await getWorkspace(db, params.id, user.organizationId);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  })

  // PATCH /v1/workspaces/:id
  .use(requirePermission('workspace.update'))
  .patch(
    '/:id',
    async ({ params, body, user, set }) => {
      try {
        return await updateWorkspace(db, params.id, user.organizationId, body);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({ name: t.Optional(t.String()), description: t.Optional(t.String()) }),
    }
  )

  // DELETE /v1/workspaces/:id
  .use(requirePermission('workspace.delete'))
  .delete('/:id', async ({ params, user, set }) => {
    try {
      await deleteWorkspace(db, params.id, user.organizationId);
      return { success: true };
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  });
