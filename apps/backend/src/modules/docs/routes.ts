import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import {
  createDocument,
  listProjectDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
  linkCardToDocument,
  unlinkCardFromDocument,
} from './service';

export const docRoutes = new Elysia({ tags: ['Docs'] })
  .use(authPlugin)

  // POST /v1/projects/:id/docs
  .post(
    '/projects/:id/docs',
    async ({ params: { id }, body, user, set }) => {
      try {
        return await createDocument(db, user.organizationId, id, user.userId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('project.update'),
      params: t.Object({ id: t.String() }),
      body: t.Object({
        title: t.String(),
        content: t.Optional(t.String()),
      }),
    }
  )

  // GET /v1/projects/:id/docs
  .get(
    '/projects/:id/docs',
    async ({ params: { id }, user, set }) => {
      try {
        return await listProjectDocuments(db, user.organizationId, id);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('project.read'),
      params: t.Object({ id: t.String() }),
    }
  )

  // GET /v1/docs/:id
  .get(
    '/docs/:id',
    async ({ params: { id }, user, set }) => {
      try {
        return await getDocument(db, user.organizationId, id);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('project.read'),
      params: t.Object({ id: t.String() }),
    }
  )

  // PATCH /v1/docs/:id
  .patch(
    '/docs/:id',
    async ({ params: { id }, body, user, set }) => {
      try {
        return await updateDocument(db, user.organizationId, id, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('project.update'),
      params: t.Object({ id: t.String() }),
      body: t.Object({
        title: t.Optional(t.String()),
        content: t.Optional(t.String()),
        isArchived: t.Optional(t.Boolean()),
      }),
    }
  )

  // DELETE /v1/docs/:id
  .delete(
    '/docs/:id',
    async ({ params: { id }, user, set }) => {
      try {
        return await deleteDocument(db, user.organizationId, id);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('project.update'),
      params: t.Object({ id: t.String() }),
    }
  )

  // POST /v1/docs/:id/cards/:cardId
  .post(
    '/docs/:id/cards/:cardId',
    async ({ params: { id, cardId }, user, set }) => {
      try {
        return await linkCardToDocument(db, user.organizationId, id, cardId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('project.update'),
      params: t.Object({
        id: t.String(),
        cardId: t.String(),
      }),
    }
  )

  // DELETE /v1/docs/:id/cards/:cardId
  .delete(
    '/docs/:id/cards/:cardId',
    async ({ params: { id, cardId }, user, set }) => {
      try {
        return await unlinkCardFromDocument(db, user.organizationId, id, cardId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('project.update'),
      params: t.Object({
        id: t.String(),
        cardId: t.String(),
      }),
    }
  );
