import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import {
  listPriorities,
  createPriority,
  updatePriority,
  deletePriority,
  setDefaultPriority,
} from './service';

const colorSchema = t.String({ minLength: 4, maxLength: 16 });

export const priorityRoutes = new Elysia({ prefix: '/priorities', tags: ['Priorities'] })
  .use(authPlugin)

  // GET /v1/priorities - Org priority levels with colors (lazy-seeds defaults)
  .get(
    '/',
    async ({ user, set }) => {
      try {
        return await listPriorities(db, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.read'),
    }
  )

  // POST /v1/priorities - Add a priority level
  .post(
    '/',
    async ({ body, user, set }) => {
      try {
        return await createPriority(db, user.organizationId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 60 }),
        color: t.Optional(colorSchema),
      }),
    }
  )

  // PATCH /v1/priorities/:id - Rename / recolor / reorder
  .patch(
    '/:id',
    async ({ params: { id }, body, user, set }) => {
      try {
        return await updatePriority(db, user.organizationId, id, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 60 })),
        color: t.Optional(colorSchema),
        rank: t.Optional(t.Number({ minimum: 0 })),
      }),
    }
  )

  // POST /v1/priorities/:id/default - Mark as default for new cards
  .post(
    '/:id/default',
    async ({ params: { id }, user, set }) => {
      try {
        return await setDefaultPriority(db, user.organizationId, id);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      params: t.Object({ id: t.String() }),
    }
  )

  // DELETE /v1/priorities/:id - Remove (cards reassigned to default)
  .delete(
    '/:id',
    async ({ params: { id }, user, set }) => {
      try {
        return await deletePriority(db, user.organizationId, id);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      params: t.Object({ id: t.String() }),
    }
  );
