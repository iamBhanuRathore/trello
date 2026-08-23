import Elysia, { t } from 'elysia';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { db } from '../../db/index';
import { createBoard, listBoards, getBoard, updateBoard, deleteBoard, archiveBoard } from './service';
import { getBoardLabels, createBoardLabel } from '../cards/service';

/** Board routes — /v1/boards/* */
export const boardRoutes = new Elysia({ prefix: '/boards', tags: ['Boards'] })
  .use(authPlugin)

  // GET /v1/boards?projectId=...
  .use(requirePermission('board.read'))
  .get('/', async ({ query, user, set }) => {
    try {
      if (!query.projectId) throw new Error('projectId query parameter is required');
      return await listBoards(db, query.projectId, user.organizationId);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  }, {
    query: t.Object({ projectId: t.String() })
  })

  // POST /v1/boards
  .use(requirePermission('board.create'))
  .post(
    '/',
    async ({ body, user, set }) => {
      try {
        return await createBoard(db, {
          organizationId: user.organizationId,
          projectId: body.projectId,
          name: body.name,
          background: body.background,
        });
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        projectId: t.String({ format: 'uuid' }),
        name: t.String(),
        background: t.Optional(t.String()),
      }),
    }
  )

  // GET /v1/boards/:id
  .use(requirePermission('board.read'))
  .get('/:id', async ({ params, user, set }) => {
    try {
      return await getBoard(db, params.id, user.organizationId);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  })

  // PATCH /v1/boards/:id
  .use(requirePermission('board.update'))
  .patch(
    '/:id',
    async ({ params, body, user, set }) => {
      try {
        return await updateBoard(db, params.id, user.organizationId, body);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({ name: t.Optional(t.String()), background: t.Optional(t.String()) }),
    }
  )

  // DELETE /v1/boards/:id
  .use(requirePermission('board.delete'))
  .delete('/:id', async ({ params, user, set }) => {
    try {
      await deleteBoard(db, params.id, user.organizationId);
      return { success: true };
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  })

  // POST /v1/boards/:id/archive
  .use(requirePermission('board.archive'))
  .post('/:id/archive', async ({ params, user, set }) => {
    try {
      return await archiveBoard(db, params.id, user.organizationId);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  })

  // GET /v1/boards/:id/labels
  .use(requirePermission('board.read'))
  .get('/:id/labels', async ({ params }) => {
    return await getBoardLabels(db, params.id);
  })

  // POST /v1/boards/:id/labels
  .use(requirePermission('board.update'))
  .post('/:id/labels', async ({ params, body }) => {
    return await createBoardLabel(db, params.id, body.name, body.color);
  }, {
    body: t.Object({ name: t.String(), color: t.String() })
  });
