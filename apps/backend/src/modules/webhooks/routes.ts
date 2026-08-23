import Elysia, { t } from 'elysia';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { db } from '../../db/index';
import { listWebhooks, createWebhook, updateWebhook, deleteWebhook } from './service';

export const webhookRoutes = new Elysia({ prefix: '/organizations/:organizationId/webhooks', tags: ['Webhooks'] })
  .use(authPlugin)
  .use(requirePermission('webhook.manage'))
  
  .get('/', async ({ params, user, set }) => {
    if (user.organizationId !== params.organizationId) { set.status = 403; return { error: 'Forbidden' }; }
    return await listWebhooks(db, params.organizationId);
  })
  
  .post('/', async ({ params, body, user, set }) => {
    if (user.organizationId !== params.organizationId) { set.status = 403; return { error: 'Forbidden' }; }
    return await createWebhook(db, params.organizationId, body);
  }, {
    body: t.Object({
      url: t.String({ format: 'uri' }),
      events: t.Array(t.String()),
    })
  })
  
  .put('/:id', async ({ params, body, user, set }) => {
    if (user.organizationId !== params.organizationId) { set.status = 403; return { error: 'Forbidden' }; }
    try {
      return await updateWebhook(db, params.organizationId, params.id, body);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  }, {
    body: t.Object({
      url: t.Optional(t.String({ format: 'uri' })),
      events: t.Optional(t.Array(t.String())),
      isEnabled: t.Optional(t.Boolean()),
    })
  })
  
  .delete('/:id', async ({ params, user, set }) => {
    if (user.organizationId !== params.organizationId) { set.status = 403; return { error: 'Forbidden' }; }
    try {
      return await deleteWebhook(db, params.organizationId, params.id);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  });
