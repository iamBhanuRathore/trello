import Elysia, { t } from 'elysia';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { db } from '../../db/index';
import { handleRouteError } from '../../lib/errors';
import {
  createBoard,
  listBoards,
  getBoard,
  getBoardFull,
  updateBoard,
  deleteBoard,
  archiveBoard,
} from './service';
import {
  getBoardLabels,
  createBoardLabel,
  updateBoardLabel,
  deleteBoardLabel,
} from '../cards/service';

/** Board routes — /v1/boards/* */
export const boardRoutes = new Elysia({ prefix: '/boards', tags: ['Boards'] })
  .use(authPlugin)

  // GET /v1/boards?projectId=...
  .get(
    '/',
    async ({ query, user, set }) => {
      try {
        if (!query.projectId) throw new Error('projectId query parameter is required');
        return await listBoards(db, query.projectId, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.read'),
      query: t.Object({ projectId: t.String() }),
    }
  )

  // POST /v1/boards
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
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.create'),
      body: t.Object({
        projectId: t.String({ format: 'uuid' }),
        name: t.String(),
        background: t.Optional(t.String()),
      }),
    }
  )

  // GET /v1/boards/:id/full — aggregate board+lists+cards (kills board-page N+1).
  // Must be registered before /:id so "full" isn't captured as a param.
  .get(
    '/:id/full',
    async ({ params, user, set }) => {
      try {
        return await getBoardFull(db, params.id, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.read'),
    }
  )

  // GET /v1/boards/:id
  .get(
    '/:id',
    async ({ params, user, set }) => {
      try {
        return await getBoard(db, params.id, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.read'),
    }
  )

  // PATCH /v1/boards/:id
  .patch(
    '/:id',
    async ({ params, body, user, set }) => {
      try {
        return await updateBoard(db, params.id, user.organizationId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.update'),
      body: t.Object({ name: t.Optional(t.String()), background: t.Optional(t.String()) }),
    }
  )

  // DELETE /v1/boards/:id
  .delete(
    '/:id',
    async ({ params, user, set }) => {
      try {
        await deleteBoard(db, params.id, user.organizationId);
        return { success: true };
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.delete'),
    }
  )

  // POST /v1/boards/:id/archive
  .post(
    '/:id/archive',
    async ({ params, user, set }) => {
      try {
        return await archiveBoard(db, params.id, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.delete'),
    }
  )

  // GET /v1/boards/:id/labels
  .get(
    '/:id/labels',
    async ({ params, user, set }) => {
      try {
        return await getBoardLabels(db, params.id, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.read'),
    }
  )

  // POST /v1/boards/:id/labels
  .post(
    '/:id/labels',
    async ({ params, body, user, set }) => {
      try {
        return await createBoardLabel(db, params.id, user.organizationId, body.name, body.color);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.update'),
      body: t.Object({ name: t.String(), color: t.String() }),
    }
  )

  // PATCH /v1/boards/:id/labels/:labelId
  .patch(
    '/:id/labels/:labelId',
    async ({ params, body, user, set }) => {
      try {
        return await updateBoardLabel(
          db,
          params.labelId,
          user.organizationId,
          body.name,
          body.color
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('label.update'),
      body: t.Object({ name: t.Optional(t.String()), color: t.Optional(t.String()) }),
    }
  )

  // DELETE /v1/boards/:id/labels/:labelId
  .delete(
    '/:id/labels/:labelId',
    async ({ params, user, set }) => {
      try {
        await deleteBoardLabel(db, params.labelId, user.organizationId);
        return { success: true };
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('label.update'),
    }
  );
