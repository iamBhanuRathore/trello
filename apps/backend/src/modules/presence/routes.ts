import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import {
  computeUserPresence,
  batchGetUsersPresenceScoped,
  setUserPresenceOverride,
  clearUserPresenceOverride,
  getUserWorkingHours,
  updateUserWorkingHours,
} from './presenceService';

export const presenceRoutes = new Elysia({ prefix: '/presence', tags: ['Presence'] })
  .use(authPlugin)

  // GET /v1/presence/users - Batch fetch presence (scoped to caller's org)
  .get(
    '/users',
    async ({ query, user, set }) => {
      try {
        if (!user.organizationId) {
          set.status = 400;
          return { error: 'Bad Request — no organization selected' };
        }
        // A presence panel is a handful of avatars; the id list was unbounded, so one
        // request could name thousands of users and fan out that many lookups.
        const MAX_PRESENCE_IDS = 200;
        const requested = query.ids ? query.ids.split(',').filter(Boolean) : [];
        const userIds = requested.slice(0, MAX_PRESENCE_IDS);
        return await batchGetUsersPresenceScoped(db, userIds, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      query: t.Object({
        ids: t.String(),
      }),
    }
  )

  // GET /v1/presence/me - Get current user presence
  .get('/me', async ({ user, set }) => {
    try {
      return await computeUserPresence(db, user.userId);
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  })

  // PUT /v1/presence/me - Set manual presence override
  .put(
    '/me',
    async ({ body, user, set }) => {
      try {
        return await setUserPresenceOverride(db, user.userId, body as any);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        status: t.Union([
          t.Literal('available'),
          t.Literal('busy'),
          t.Literal('away'),
          t.Literal('leave'),
          t.Literal('offline'),
        ]),
        customStatusText: t.Optional(t.Nullable(t.String())),
        expiresInMinutes: t.Optional(t.Nullable(t.Number())),
      }),
    }
  )

  // DELETE /v1/presence/me - Clear manual override (reverts to automated status)
  .delete('/me', async ({ user, set }) => {
    try {
      return await clearUserPresenceOverride(db, user.userId);
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  })

  // GET /v1/presence/working-hours - Get weekly schedule & timezone
  .get('/working-hours', async ({ user, set }) => {
    try {
      return await getUserWorkingHours(db, user.userId);
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  })

  // PUT /v1/presence/working-hours - Update weekly schedule & timezone
  .put(
    '/working-hours',
    async ({ body, user, set }) => {
      try {
        return await updateUserWorkingHours(db, user.userId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        timezone: t.String(),
        schedule: t.Any(),
      }),
    }
  );
