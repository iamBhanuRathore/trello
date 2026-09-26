import Elysia, { t } from 'elysia';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { db } from '../../db/index';
import { handleRouteError } from '../../lib/errors';
import { listWebhooks, createWebhook, updateWebhook, deleteWebhook } from './service';

export const webhookRoutes = new Elysia({
  prefix: '/organizations/:organizationId/webhooks',
  tags: ['Webhooks'],
})
  .use(authPlugin)
  .guard({ beforeHandle: requirePermission('webhook.manage') }, (app) =>
    app
      .get('/', async ({ params, user, set }) => {
        try {
          if (user.organizationId !== params.organizationId) {
            set.status = 403;
            return { error: 'Forbidden' };
          }
          return await listWebhooks(db, params.organizationId);
        } catch (err: unknown) {
          return handleRouteError(err, set);
        }
      })

      .post(
        '/',
        async ({ params, body, user, set }) => {
          try {
            if (user.organizationId !== params.organizationId) {
              set.status = 403;
              return { error: 'Forbidden' };
            }
            return await createWebhook(db, params.organizationId, body);
          } catch (err: unknown) {
            return handleRouteError(err, set);
          }
        },
        {
          body: t.Object({
            url: t.String({ format: 'uri' }),
            events: t.Array(t.String()),
          }),
        }
      )

      .put(
        '/:id',
        async ({ params, body, user, set }) => {
          if (user.organizationId !== params.organizationId) {
            set.status = 403;
            return { error: 'Forbidden' };
          }
          try {
            return await updateWebhook(db, params.organizationId, params.id, body);
          } catch (err: unknown) {
            return handleRouteError(err, set);
          }
        },
        {
          body: t.Object({
            url: t.Optional(t.String({ format: 'uri' })),
            events: t.Optional(t.Array(t.String())),
            isEnabled: t.Optional(t.Boolean()),
          }),
        }
      )

      .delete('/:id', async ({ params, user, set }) => {
        if (user.organizationId !== params.organizationId) {
          set.status = 403;
          return { error: 'Forbidden' };
        }
        try {
          return await deleteWebhook(db, params.organizationId, params.id);
        } catch (err: unknown) {
          return handleRouteError(err, set);
        }
      })
  );
