import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import { listTrash, restoreItem, hardDeleteItem, emptyTrash } from './service';

export const trashRoutes = new Elysia({ prefix: '/trash' })
  .use(authPlugin)

  // GET /v1/trash — List all trashed items in user's org
  .get(
    '/',
    async ({ user, set }) => {
      try {
        return await listTrash(db, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.read'),
    }
  )

  // POST /v1/trash/restore — Restore a trashed item
  .post(
    '/restore',
    async ({ user, body, set }) => {
      try {
        return await restoreItem(db, user.organizationId, body.itemType as any, body.itemId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.read'),
      body: t.Object({
        itemType: t.Union([
          t.Literal('workspace'),
          t.Literal('project'),
          t.Literal('board'),
          t.Literal('card'),
        ]),
        itemId: t.String(),
      }),
    }
  )

  // DELETE /v1/trash/empty — Permanently empty the trash
  .delete(
    '/empty',
    async ({ user, set }) => {
      try {
        return await emptyTrash(db, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.delete'),
    }
  )

  // DELETE /v1/trash/:itemType/:itemId — Permanently delete a single item
  .delete(
    '/:itemType/:itemId',
    async ({ user, params, set }) => {
      try {
        return await hardDeleteItem(db, user.organizationId, params.itemType as any, params.itemId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.delete'),
      params: t.Object({
        itemType: t.String(),
        itemId: t.String(),
      }),
    }
  );
