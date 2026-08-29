import Elysia, { t } from 'elysia';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { db } from '../../db/index';
import { handleRouteError } from '../../lib/errors';
import { createList, listLists, updateList, deleteList } from './service';

/** List routes — /v1/lists/* */
export const listRoutes = new Elysia({ prefix: '/lists', tags: ['Lists'] })
  .use(authPlugin)

  // GET /v1/lists?boardId=...
  .get(
    '/',
    async ({ query, user, set }) => {
      try {
        if (!query.boardId) throw new Error('boardId query parameter is required');
        return await listLists(db, query.boardId, user.organizationId);
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.read'),
      query: t.Object({ boardId: t.String() }),
    }
  )

  // POST /v1/lists
  .post(
    '/',
    async ({ body, user, set }) => {
      try {
        return await createList(db, user.organizationId, {
          boardId: body.boardId,
          name: body.name,
          position: body.position,
        });
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('list.create'),
      body: t.Object({
        boardId: t.String({ format: 'uuid' }),
        name: t.String(),
        position: t.Optional(t.Number()),
      }),
    }
  )

  // PATCH /v1/lists/:id
  .patch(
    '/:id',
    async ({ params, body, user, set }) => {
      try {
        return await updateList(db, params.id, user.organizationId, body);
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('list.update'),
      body: t.Object({ name: t.Optional(t.String()), position: t.Optional(t.Number()), isArchived: t.Optional(t.Boolean()) }),
    }
  )

  // DELETE /v1/lists/:id
  .delete(
    '/:id',
    async ({ params, user, set }) => {
      try {
        await deleteList(db, params.id, user.organizationId);
        return { success: true };
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('list.delete'),
    }
  );
