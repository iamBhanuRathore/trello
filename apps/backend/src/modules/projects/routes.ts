import Elysia, { t } from 'elysia';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { db } from '../../db/index';
import { createProject, listProjects, getProject, updateProject, deleteProject } from './service';

/** Project routes — /v1/projects/* */
export const projectRoutes = new Elysia({ prefix: '/projects', tags: ['Projects'] })
  .use(authPlugin)

  // GET /v1/projects?workspaceId=...
  .use(requirePermission('project.read'))
  .get('/', async ({ query, user, set }) => {
    try {
      if (!query.workspaceId) throw new Error('workspaceId query parameter is required');
      return await listProjects(db, query.workspaceId, user.organizationId);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  }, {
    query: t.Object({ workspaceId: t.String() })
  })

  // POST /v1/projects
  .use(requirePermission('project.create'))
  .post(
    '/',
    async ({ body, user, set }) => {
      try {
        return await createProject(db, {
          organizationId: user.organizationId,
          workspaceId: body.workspaceId,
          name: body.name,
          description: body.description,
          startDate: body.startDate,
          endDate: body.endDate,
        });
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        workspaceId: t.String({ format: 'uuid' }),
        name: t.String(),
        description: t.Optional(t.String()),
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
    }
  )

  // GET /v1/projects/:id
  .use(requirePermission('project.read'))
  .get('/:id', async ({ params, user, set }) => {
    try {
      return await getProject(db, params.id, user.organizationId);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  })

  // PATCH /v1/projects/:id
  .use(requirePermission('project.update'))
  .patch(
    '/:id',
    async ({ params, body, user, set }) => {
      try {
        return await updateProject(db, params.id, user.organizationId, body);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({ 
        name: t.Optional(t.String()), 
        status: t.Optional(t.Union([t.Literal('active'), t.Literal('on_hold'), t.Literal('completed'), t.Literal('archived')])),
        description: t.Optional(t.String())
      }),
    }
  )

  // DELETE /v1/projects/:id
  .use(requirePermission('project.delete'))
  .delete('/:id', async ({ params, user, set }) => {
    try {
      await deleteProject(db, params.id, user.organizationId);
      return { success: true };
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  });
