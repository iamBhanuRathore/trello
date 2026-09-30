import Elysia, { t } from 'elysia';
import { authPlugin } from '../../middleware/auth';
import { db } from '../../db/index';
import { handleRouteError } from '../../lib/errors';
import {
  listNotifications,
  getNeedsAction,
  getUnreadCount,
  markAsRead,
  markUnread,
  setStarred,
  bulkMarkRead,
  bulkArchive,
  bulkUnarchive,
  markAllAsRead,
  getPreferences,
  updatePreferences,
  registerPushDevice,
  unregisterPushDevice,
  getUserPushDevices,
} from './service';

const ListQuery = t.Object({
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
  unreadOnly: t.Optional(t.String()),
  starredOnly: t.Optional(t.String()),
  importantOnly: t.Optional(t.String()),
  archived: t.Optional(t.String()),
  // Repeated `?types=a&types=b` arrives as an array; single as a string.
  types: t.Optional(t.Union([t.String(), t.Array(t.String())])),
  q: t.Optional(t.String()),
});

const IdsBody = t.Object({
  ids: t.Array(t.String(), { maxItems: 100 }),
});

function flag(v: string | undefined): boolean {
  return v === 'true' || v === '1';
}

export const notificationRoutes = new Elysia({ prefix: '/notifications', tags: ['Notifications'] })
  .use(authPlugin)

  .get(
    '/',
    async ({ user, query, set }) => {
      try {
        const rawTypes = query.types;
        const types = Array.isArray(rawTypes)
          ? rawTypes
          : typeof rawTypes === 'string'
            ? [rawTypes]
            : undefined;
        const archivedRaw = query.archived;
        const archived =
          archivedRaw === 'only' || archivedRaw === 'include' ? archivedRaw : 'exclude';
        return await listNotifications(db, user.userId, user.organizationId, {
          limit: query.limit ? Number(query.limit) : undefined,
          cursor: query.cursor ?? null,
          unreadOnly: flag(query.unreadOnly),
          starredOnly: flag(query.starredOnly),
          importantOnly: flag(query.importantOnly),
          archived,
          types,
          q: query.q,
        });
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { query: ListQuery }
  )

  // Needs-action strip — unread important rows across all pages + total.
  .get(
    '/needs-action',
    async ({ user, query, set }) => {
      try {
        const limit = query.limit ? Number(query.limit) : 5;
        return await getNeedsAction(db, user.userId, user.organizationId, limit);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { query: t.Object({ limit: t.Optional(t.String()) }) }
  )

  // Badge count — excludes archived rows the user can't see.
  .get('/unread-count', async ({ user, set }) => {
    try {
      const unreadCount = await getUnreadCount(db, user.userId, user.organizationId);
      return { unreadCount };
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  })

  .patch('/:id/read', async ({ params, user, set }) => {
    try {
      return await markAsRead(db, params.id, user.userId, user.organizationId);
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  })

  .patch('/:id/unread', async ({ params, user, set }) => {
    try {
      return await markUnread(db, params.id, user.userId, user.organizationId);
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  })

  .patch(
    '/:id/star',
    async ({ params, user, body, set }) => {
      try {
        return await setStarred(db, params.id, user.userId, user.organizationId, body.starred);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { body: t.Object({ starred: t.Boolean() }) }
  )

  .post(
    '/read-many',
    async ({ user, body, set }) => {
      try {
        return await bulkMarkRead(db, body.ids, user.userId, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { body: IdsBody }
  )

  .post(
    '/archive-many',
    async ({ user, body, set }) => {
      try {
        return await bulkArchive(db, body.ids, user.userId, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { body: IdsBody }
  )

  .post(
    '/unarchive-many',
    async ({ user, body, set }) => {
      try {
        return await bulkUnarchive(db, body.ids, user.userId, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { body: IdsBody }
  )

  // Whole-organization scope, labeled as such in the UI.
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
