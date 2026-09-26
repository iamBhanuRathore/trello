import Elysia, { t } from 'elysia';
import { authPlugin } from '../../middleware/auth';
import { db } from '../../db/index';
import { handleRouteError } from '../../lib/errors';
import {
  listNotifications,
  markAsRead,
  markAllAsRead,
  getPreferences,
  updatePreferences,
  registerPushDevice,
  unregisterPushDevice,
  getUserPushDevices,
} from './service';

export const notificationRoutes = new Elysia({ prefix: '/notifications', tags: ['Notifications'] })
  .use(authPlugin)

  .get('/', async ({ user, set }) => {
    try {
      const res = await listNotifications(db, user.userId, user.organizationId);
      return res;
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  })

  .patch('/:id/read', async ({ params, user, set }) => {
    try {
      return await markAsRead(db, params.id, user.userId);
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  })

  .post('/read-all', async ({ user, set }) => {
    try {
      return await markAllAsRead(db, user.userId, user.organizationId);
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  })

  .get('/preferences', async ({ user, set }) => {
    try {
      return await getPreferences(db, user.userId, user.organizationId);
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  })

  .put(
    '/preferences',
    async ({ user, body, set }) => {
      try {
        return await updatePreferences(db, user.userId, user.organizationId, body.preferences);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        preferences: t.Array(
          t.Object({
            eventType: t.String(),
            channel: t.Union([t.Literal('in_app'), t.Literal('email'), t.Literal('push')]),
            frequency: t.Union([
              t.Literal('instant'),
              t.Literal('digest_daily'),
              t.Literal('digest_weekly'),
              t.Literal('off'),
            ]),
            quietHoursStart: t.Optional(t.Union([t.Number(), t.Null()])),
            quietHoursEnd: t.Optional(t.Union([t.Number(), t.Null()])),
          })
        ),
      }),
    }
  )

  // ── Mobile Push Device Management ──────────────────────────────────────────
  .get('/push-devices', async ({ user, set }) => {
    try {
      return await getUserPushDevices(db, user.userId);
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  })

  .post(
    '/push-devices',
    async ({ user, body, set }) => {
      try {
        return await registerPushDevice(db, user.userId, user.organizationId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        platform: t.Optional(t.String()),
        token: t.String(),
        deviceName: t.Optional(t.String()),
      }),
    }
  )

  .delete('/push-devices/:token', async ({ user, params, set }) => {
    try {
      return await unregisterPushDevice(db, user.userId, params.token);
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  })

  .post('/digest', async ({ set }) => {
    try {
      // For testing/mocking the digest cron execution
      const { processNotificationDigests } = await import('./digest.cron');
      await processNotificationDigests();
      return { success: true };
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  });
