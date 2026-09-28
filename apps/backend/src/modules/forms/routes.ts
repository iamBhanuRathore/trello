import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import { assertBoundedJson } from '../../lib/bounded-json';
import {
  createIntakeForm,
  getFormsByBoard,
  getPublicFormBySlug,
  updateIntakeForm,
  deleteIntakeForm,
  submitIntakeForm,
} from './service';

export const formRoutes = new Elysia({ prefix: '/forms', tags: ['Forms'] })
  // ── Public Endpoints (No Auth) ─────────────────────────────────────────────
  .get(
    '/public/:slug',
    async ({ params: { slug }, set }) => {
      try {
        return await getPublicFormBySlug(db, slug);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ slug: t.String() }),
    }
  )

  .post(
    '/public/:slug/submit',
    async ({ params: { slug }, body, set }) => {
      try {
        assertBoundedJson(body.data, { maxBytes: 200_000, maxKeys: 300, maxStringLength: 20000 });
        return await submitIntakeForm(db, slug, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ slug: t.String({ minLength: 1, maxLength: 120 }) }),
      body: t.Object({
        submittedByName: t.Optional(t.String({ maxLength: 200 })),
        submittedByEmail: t.Optional(t.String({ maxLength: 320 })),
        data: t.Record(t.String(), t.Any()),
      }),
    }
  )

  // ── Authenticated Board Form Management ────────────────────────────────────
  .use(authPlugin)

  // GET /v1/forms/boards/:boardId
  .get(
    '/boards/:boardId',
    async ({ params: { boardId }, user, set }) => {
      try {
        return await getFormsByBoard(db, user.organizationId, boardId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.read'),
      params: t.Object({ boardId: t.String() }),
    }
  )

  // POST /v1/forms
  .post(
    '/',
    async ({ body, user, set }) => {
      try {
        if (body.fields !== undefined) {
          assertBoundedJson(body.fields, { maxBytes: 200_000, maxKeys: 300 });
        }
        return await createIntakeForm(db, user.organizationId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.update'),
      body: t.Object({
        boardId: t.String(),
        listId: t.String(),
        title: t.String({ minLength: 1, maxLength: 300 }),
        description: t.Optional(t.String({ maxLength: 10000 })),
        fields: t.Optional(t.Array(t.Any())),
        isPublished: t.Optional(t.Boolean()),
        defaultAssigneeId: t.Optional(t.String()),
        slaHours: t.Optional(t.Number({ minimum: 0, maximum: 8760 })),
      }),
    }
  )

  // PATCH /v1/forms/:id
  .patch(
    '/:id',
    async ({ params: { id }, body, user, set }) => {
      try {
        if (body.fields !== undefined) {
          assertBoundedJson(body.fields, { maxBytes: 200_000, maxKeys: 300 });
        }
        return await updateIntakeForm(db, user.organizationId, id, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.update'),
      params: t.Object({ id: t.String() }),
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 300 })),
        description: t.Optional(t.String({ maxLength: 10000 })),
        listId: t.Optional(t.String()),
        fields: t.Optional(t.Array(t.Any())),
        isPublished: t.Optional(t.Boolean()),
        defaultAssigneeId: t.Optional(t.String()),
        slaHours: t.Optional(t.Number({ minimum: 0, maximum: 8760 })),
      }),
    }
  )

  // DELETE /v1/forms/:id
  .delete(
    '/:id',
    async ({ params: { id }, user, set }) => {
      try {
        return await deleteIntakeForm(db, user.organizationId, id);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.update'),
      params: t.Object({ id: t.String() }),
    }
  );
