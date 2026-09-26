import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import { getAuditLogs, recordAuditLog } from './service';

export const auditRoutes = new Elysia({ prefix: '/audit', tags: ['Audit'] })
  .use(authPlugin)

  // GET /v1/audit/logs
  .get(
    '/logs',
    async ({ query, user, set }) => {
      try {
        return await getAuditLogs(db, user.organizationId, {
          actorId: query.actorId,
          action: query.action,
          target: query.target,
          startDate: query.startDate,
          endDate: query.endDate,
          limit: query.limit ? Number(query.limit) : undefined,
          offset: query.offset ? Number(query.offset) : undefined,
        });
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.read'),
      query: t.Object({
        actorId: t.Optional(t.String()),
        action: t.Optional(t.String()),
        target: t.Optional(t.String()),
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    }
  )

  // POST /v1/audit/logs (manual client-triggered compliance audit event)
  .post(
    '/logs',
    async ({ body, user, headers, set }) => {
      try {
        const ip = headers['x-forwarded-for'] || '127.0.0.1';
        const userAgent = headers['user-agent'] || 'Boardly Dashboard';
        return await recordAuditLog(db, {
          organizationId: user.organizationId,
          actorId: user.userId,
          action: body.action,
          target: body.target,
          targetId: body.targetId,
          metadata: body.metadata,
          ipAddress: ip,
          userAgent: userAgent,
        });
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.read'),
      body: t.Object({
        action: t.String(),
        target: t.Optional(t.String()),
        targetId: t.Optional(t.String()),
        metadata: t.Optional(t.Any()),
      }),
    }
  );
