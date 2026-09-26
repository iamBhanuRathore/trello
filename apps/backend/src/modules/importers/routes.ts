import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import { importTrelloBoard, importGenericTasks } from './service';
import { ImportTasksBodySchema, ImportTrelloBodySchema } from './schema';

export const importerRoutes = new Elysia({ prefix: '/import', tags: ['Importers'] })
  .use(authPlugin)

  // POST /v1/import/projects/:projectId/trello
  .post(
    '/projects/:projectId/trello',
    async ({ params: { projectId }, body, user, set }) => {
      try {
        return await importTrelloBoard(db, user.organizationId, projectId, body.trelloData);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.create'),
      params: t.Object({ projectId: t.String() }),
      body: ImportTrelloBodySchema,
    }
  )

  // POST /v1/import/projects/:projectId/tasks
  .post(
    '/projects/:projectId/tasks',
    async ({ params: { projectId }, body, user, set }) => {
      try {
        return await importGenericTasks(db, user.organizationId, projectId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.create'),
      params: t.Object({ projectId: t.String() }),
      body: ImportTasksBodySchema,
    }
  );
