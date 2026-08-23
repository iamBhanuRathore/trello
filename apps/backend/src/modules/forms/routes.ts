import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
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
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
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
        return await submitIntakeForm(db, slug, body);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ slug: t.String() }),
      body: t.Object({
        submittedByName: t.Optional(t.String()),
        submittedByEmail: t.Optional(t.String()),
        data: t.Record(t.String(), t.Any()),
      }),
    }
  )

  // ── Authenticated Board Form Management ────────────────────────────────────
  .use(authPlugin)

  // GET /v1/forms/boards/:boardId
  .use(requirePermission('board.read'))
  .get(
    '/boards/:boardId',
    async ({ params: { boardId }, user, set }) => {
      try {
        return await getFormsByBoard(db, user.organizationId, boardId);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ boardId: t.String() }),
    }
  )

  // POST /v1/forms
  .use(requirePermission('board.update'))
  .post(
    '/',
    async ({ body, user, set }) => {
      try {
        return await createIntakeForm(db, user.organizationId, body);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        boardId: t.String(),
        listId: t.String(),
        title: t.String(),
        description: t.Optional(t.String()),
        fields: t.Optional(t.Array(t.Any())),
        isPublished: t.Optional(t.Boolean()),
        defaultAssigneeId: t.Optional(t.String()),
        slaHours: t.Optional(t.Number()),
      }),
    }
  )

  // PATCH /v1/forms/:id
  .use(requirePermission('board.update'))
  .patch(
    '/:id',
    async ({ params: { id }, body, user, set }) => {
      try {
        return await updateIntakeForm(db, user.organizationId, id, body);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        title: t.Optional(t.String()),
        description: t.Optional(t.String()),
        listId: t.Optional(t.String()),
        fields: t.Optional(t.Array(t.Any())),
        isPublished: t.Optional(t.Boolean()),
        defaultAssigneeId: t.Optional(t.String()),
        slaHours: t.Optional(t.Number()),
      }),
    }
  )

  // DELETE /v1/forms/:id
  .use(requirePermission('board.update'))
  .delete(
    '/:id',
    async ({ params: { id }, user, set }) => {
      try {
        return await deleteIntakeForm(db, user.organizationId, id);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
    }
  );
