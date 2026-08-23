import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { listTrash, restoreItem, hardDeleteItem, emptyTrash } from './service';

export const trashRoutes = new Elysia({ prefix: '/trash' })
  .use(authPlugin)

  // GET /v1/trash — List all trashed items in user's org
  .use(requirePermission('org.read'))
  .get('/', async ({ user, set }) => {
    try {
      return await listTrash(db, user.organizationId);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  })

  // POST /v1/trash/restore — Restore a trashed item
  .use(requirePermission('org.update'))
  .post(
    '/restore',
    async ({ user, body, set }) => {
      try {
        return await restoreItem(db, user.organizationId, body.itemType as any, body.itemId);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
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
  .use(requirePermission('org.delete'))
  .delete('/empty', async ({ user, set }) => {
    try {
      return await emptyTrash(db, user.organizationId);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  })

  // DELETE /v1/trash/:itemType/:itemId — Permanently delete a single item
  .use(requirePermission('org.delete'))
  .delete(
    '/:itemType/:itemId',
    async ({ user, params, set }) => {
      try {
        return await hardDeleteItem(
          db,
          user.organizationId,
          params.itemType as any,
          params.itemId
        );
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({
        itemType: t.String(),
        itemId: t.String(),
      }),
    }
  );
