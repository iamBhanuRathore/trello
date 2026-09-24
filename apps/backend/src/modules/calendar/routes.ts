import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import { env } from '../../lib/env';
import {
  connectionStatus,
  getAuthUrlForUser,
  handleGoogleCallback,
  disconnectCalendar,
  pullExternalEvents,
  pushAllScheduled,
  scheduleCard,
  getCalendarFeed,
} from './service';

export const calendarRoutes = new Elysia({ prefix: '/calendar', tags: ['Calendar'] })
  .use(authPlugin)

  // GET /v1/calendar/google/status - Connection state for current user
  .get('/google/status', async ({ user, set }) => {
    try {
      return await connectionStatus(db, user.userId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  })

  // GET /v1/calendar/google/auth-url - Start OAuth connect flow
  .get('/google/auth-url', async ({ user, set }) => {
    try {
      return { url: getAuthUrlForUser(user.userId, user.organizationId) };
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  })

  // DELETE /v1/calendar/google - Disconnect + remove pushed-event links
  .delete('/google', async ({ user, set }) => {
    try {
      return await disconnectCalendar(db, user.userId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  })

  // GET /v1/calendar/events - Merged feed (tasks, sprints, milestones, Google)
  .get(
    '/events',
    async ({ query, user, set }) => {
      try {
        return await getCalendarFeed(db, user.organizationId, user.userId, {
          from: query.from,
          to: query.to,
        });
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      query: t.Object({
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
    }
  )

  // POST /v1/calendar/sync/pull - Pull Google events (overlay refresh)
  .post('/sync/pull', async ({ user, set }) => {
    try {
      return await pullExternalEvents(db, user.userId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  })

  // POST /v1/calendar/sync/push - Push my scheduled tasks to Google
  .post('/sync/push', async ({ user, set }) => {
    try {
      return await pushAllScheduled(db, user.userId, user.organizationId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  })

  // PATCH /v1/calendar/cards/:id/schedule - Time-block a task
  .patch(
    '/cards/:id/schedule',
    async ({ params: { id }, body, user, set }) => {
      try {
        return await scheduleCard(db, id, user.organizationId, user.userId, body);
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      params: t.Object({ id: t.String() }),
      body: t.Object({
        start: t.Optional(t.Union([t.String(), t.Null()])),
        end: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    }
  );

/**
 * Public OAuth redirect target. Browser redirects carry no Bearer token,
 * so this MUST stay outside authPlugin — the HMAC-bound `state` param
 * already identifies the initiating user. Google errors (e.g.
 * access_denied, redirect_uri_mismatch) arrive without a `code` and are
 * forwarded to the dashboard as ?error= for display.
 */
export const calendarCallbackRoutes = new Elysia({ prefix: '/calendar', tags: ['Calendar'] }).get(
  '/google/callback',
  async ({ query, set }) => {
    if (query.error) {
      const message = encodeURIComponent(
        query.error_description || query.error || 'Google authorization failed'
      );
      set.status = 302;
      set.headers['location'] = `${env.DASHBOARD_URL.split(',')[0]}/calendar?error=${message}`;
      return 'Authorization failed — redirecting to Boardly…';
    }
    try {
      await handleGoogleCallback(db, query.code || '', query.state || '');
      set.status = 302;
      set.headers['location'] = `${env.DASHBOARD_URL.split(',')[0]}/calendar?connected=1`;
      return 'Connected — redirecting to Boardly…';
    } catch (err: any) {
      const message = encodeURIComponent(err?.message || 'Calendar connect failed');
      set.status = 302;
      set.headers['location'] = `${env.DASHBOARD_URL.split(',')[0]}/calendar?error=${message}`;
      return 'Connection failed — redirecting to Boardly…';
    }
  },
  {
    query: t.Object({
      code: t.Optional(t.String()),
      state: t.Optional(t.String()),
      error: t.Optional(t.String()),
      error_description: t.Optional(t.String()),
    }),
  }
);
