import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import {
  logTime,
  getCardTimeLogs,
  deleteTimeLog,
  getTimesheet,
} from './service';

export const timeTrackingRoutes = new Elysia({ prefix: '/time-tracking', tags: ['TimeTracking'] })
  .use(authPlugin)

  // POST /v1/time-tracking/cards/:cardId
  .use(requirePermission('card.time_log.create'))
  .post(
    '/cards/:cardId',
    async ({ params: { cardId }, body, user, set }) => {
      try {
        return await logTime(db, user.organizationId, user.userId, {
          cardId,
          minutes: body.minutes,
          description: body.description,
          loggedDate: body.loggedDate,
          isBillable: body.isBillable,
        });
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ cardId: t.String() }),
      body: t.Object({
        minutes: t.Number(),
        description: t.Optional(t.String()),
        loggedDate: t.Optional(t.String()),
        isBillable: t.Optional(t.Boolean()),
      }),
    }
  )

  // GET /v1/time-tracking/cards/:cardId
  .use(requirePermission('card.read'))
  .get(
    '/cards/:cardId',
    async ({ params: { cardId }, user, set }) => {
      try {
        return await getCardTimeLogs(db, user.organizationId, cardId);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ cardId: t.String() }),
    }
  )

  // DELETE /v1/time-tracking/logs/:id
  .use(requirePermission('card.time_log.delete'))
  .delete(
    '/logs/:id',
    async ({ params: { id }, user, set }) => {
      try {
        return await deleteTimeLog(db, user.organizationId, user.userId, id);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
    }
  )

  // GET /v1/time-tracking/timesheet
  .use(requirePermission('org.read'))
  .get(
    '/timesheet',
    async ({ query, user, set }) => {
      try {
        return await getTimesheet(db, user.organizationId, {
          userId: query.userId,
          projectId: query.projectId,
          startDate: query.startDate,
          endDate: query.endDate,
        });
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      query: t.Object({
        userId: t.Optional(t.String()),
        projectId: t.Optional(t.String()),
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
    }
  );
