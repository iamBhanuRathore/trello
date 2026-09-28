import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { db, disconnectDb } from './db/index';
import { connectRedis, disconnectRedis } from './redis';
import { rateLimiterMiddleware } from './middleware/rateLimiter';
import { healthRoutes } from './modules/health/routes';
import { authRoutes } from './modules/auth/routes';
import { orgRoutes, inviteRoutes } from './modules/organizations/routes';
import { workspaceRoutes } from './modules/workspaces/routes';
import { projectRoutes } from './modules/projects/routes';
import { boardRoutes } from './modules/boards/routes';
import { listRoutes } from './modules/lists/routes';
import { cardRoutes, cardPublicRoutes } from './modules/cards/routes';
import { realtimeRoutes, setupRealtimeEventBus } from './modules/realtime/routes';
import { notificationRoutes } from './modules/notifications/routes';
import { setupNotificationListeners } from './modules/notifications/service';
import { superadminRoutes } from './modules/superadmin/routes';
import { stageRoutes } from './modules/stages/routes';
import { sprintRoutes } from './modules/sprints/routes';
import { phaseRoutes } from './modules/phases/routes';
import { searchRoutes } from './modules/search/routes';
import { webhookRoutes } from './modules/webhooks/routes';
import { setupWebhookDispatcher } from './modules/webhooks/service';
import { automationRoutes } from './modules/automations/routes';
import { setupAutomationEngine } from './modules/automations/service';
import { integrationsRoutes } from './modules/integrations/routes';
import { reportsRoutes } from './modules/reports/routes';
import { timeTrackingRoutes } from './modules/timetracking/routes';
import { importerRoutes } from './modules/importers/routes';
import { roleRoutes } from './modules/roles/routes';
import { componentRoutes } from './modules/components/routes';
import { priorityRoutes } from './modules/priorities/routes';
import { auditRoutes } from './modules/audit/routes';
import { startRetentionJob } from './modules/audit/retention';
import { docRoutes } from './modules/docs/routes';
import { formRoutes } from './modules/forms/routes';
import { ssoRoutes } from './modules/sso/routes';
import { developerRoutes } from './modules/developer/routes';
import { trashRoutes } from './modules/trash/routes';
import { billingRoutes } from './modules/billing/routes';
import { chatRoutes } from './modules/chat/routes';
import { presenceRoutes } from './modules/presence/routes';
import { calendarRoutes, calendarCallbackRoutes } from './modules/calendar/routes';
import { gitRoutes, gitWebhookRoutes } from './modules/git/routes';

import { formatErrorResponse, formatValidationError } from './lib/errors';
import { sql } from 'drizzle-orm';

// In-flight request tracking for graceful draining
let inFlight = 0;
let shuttingDown = false;

// Ensure enum values and schema columns are up to date in the database on boot
db.execute(sql`ALTER TYPE "org_member_role" ADD VALUE IF NOT EXISTS 'viewer'`).catch(() => {});
db.execute(
  sql`ALTER TABLE IF EXISTS "sso_configurations" ADD COLUMN IF NOT EXISTS "workos_organization_id" varchar(255)`
).catch(() => {});
db.execute(
  sql`ALTER TABLE IF EXISTS "sso_configurations" ADD COLUMN IF NOT EXISTS "workos_connection_id" varchar(255)`
).catch(() => {});

// Setup event listeners
setupNotificationListeners(db);
setupWebhookDispatcher(db);
setupAutomationEngine(db);

// Initialize Redis Pub/Sub cluster connection
await connectRedis();

const allowedOrigins = [...(env.DASHBOARD_URL?.split(',').map((s) => s.trim()) || [])];

export const isAllowedOrigin = (origin: string | null): boolean => {
  if (!origin) return false;
  // Dev/test convenience only — production uses the strict allowlist below.
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') return true;
  // Strict allowlist from DASHBOARD_URL. No LAN/private-range bypass: a reflected
  // origin combined with allow-credentials would hand credentialed access to any
  // private-network page (CSRF-adjacent). Non-browser clients don't need ACAO.
  if (allowedOrigins.includes(origin)) return true;
  return false;
};

export const resolveOrigin = (request: Request): string => {
  const origin = request.headers.get('origin');
  if (origin && isAllowedOrigin(origin)) {
    return origin;
  }
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (isAllowedOrigin(refOrigin)) {
        return refOrigin;
      }
    } catch {}
  }
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    return 'http://localhost:5173';
  }
  return allowedOrigins[0] || 'http://localhost:5173';
};

export const applyCorsHeaders = (headers: Record<string, any>, request: Request) => {
  const origin = resolveOrigin(request);
  headers['access-control-allow-origin'] = origin;
  headers['access-control-allow-credentials'] = 'true';
  headers['access-control-allow-methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD';

  // Fixed allow-headers list: never reflect access-control-request-headers
  // alongside allow-credentials (lets a permitted origin smuggle exotic headers).
  headers['access-control-allow-headers'] =
    'Content-Type, Authorization, x-organization-id, x-requested-with, Accept, Origin, baggage, sentry-trace, Cache-Control, Pragma, sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform';

  // Chromium & Brave Private Network Access (PNA) preflight support
  if (
    request.headers.get('access-control-request-private-network') === 'true' ||
    env.NODE_ENV === 'development' ||
    env.NODE_ENV === 'test'
  ) {
    headers['access-control-allow-private-network'] = 'true';
  }

  headers['access-control-expose-headers'] =
    'Content-Length, Content-Type, Date, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After, X-Total-Count';
  headers['vary'] = 'Origin';
};

export const app = new Elysia()
  // ── In-flight Tracking, CORS Preflight & Logging ───────────────────────────
  .onRequest(({ request }): Response | void => {
    inFlight++;
    logger.info({ method: request.method, url: request.url, inFlight }, 'Incoming request');

    if (request.method === 'OPTIONS') {
      const maxAge = env.NODE_ENV === 'development' || env.NODE_ENV === 'test' ? '0' : '86400';
      const headers: Record<string, string> = {
        'access-control-max-age': maxAge,
      };
      applyCorsHeaders(headers, request);
      return new Response(null, { status: 204, headers });
    }
    return undefined;
  })
  .onAfterResponse(() => {
    inFlight = Math.max(0, inFlight - 1);
  })

  // mapResponse fires for EVERY response — including ones short-circuited by
  // beforeHandle (auth, rate-limiter, permission checks) and handlers returning errors.
  .mapResponse(({ request, set }) => {
    if (!set.headers) set.headers = {};
    applyCorsHeaders(set.headers as Record<string, any>, request);
  })
  .use(
    swagger({
      path: '/docs',
      documentation: {
        info: {
          title: 'Boardly API',
          version: '1.0.0',
          description: 'Multi-tenant Trello/Jira-competitor SaaS API',
        },
        tags: [
          { name: 'Health', description: 'System health checks' },
          { name: 'Auth', description: 'Authentication & session management' },
          { name: 'Organizations', description: 'Multi-tenant org management' },
          { name: 'Workspaces', description: 'Workspace management' },
          { name: 'Projects', description: 'Project management' },
          { name: 'Boards', description: 'Board management' },
          { name: 'Lists', description: 'List (column) management' },
          { name: 'Cards', description: 'Card (task) management' },
          { name: 'Notifications', description: 'Notifications management' },
        ],
      },
    })
  )

  // ── Global error handler ───────────────────────────────────────────────────
  .onError(({ error, code, set, request }) => {
    inFlight = Math.max(0, inFlight - 1);

    if (!set.headers) set.headers = {};
    applyCorsHeaders(set.headers as Record<string, any>, request);

    if (code === 'VALIDATION') {
      set.status = 422;
      return formatValidationError(error);
    }

    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { error: 'Resource not found' };
    }

    const { status, body } = formatErrorResponse(error);
    set.status = status;
    return body;
  })

  // ── Routes (versioned under /v1) ───────────────────────────────────────────
  .use(healthRoutes)
  .group('/v1', (app) =>
    app
      .use(rateLimiterMiddleware())
      .use(authRoutes)
      .use(inviteRoutes)
      .use(orgRoutes)
      .use(workspaceRoutes)
      .use(projectRoutes)
      .use(boardRoutes)
      .use(listRoutes)
      .use(cardPublicRoutes)
      .use(cardRoutes)
      .use(realtimeRoutes)
      .use(notificationRoutes)
      .use(superadminRoutes)
      .use(stageRoutes)
      .use(sprintRoutes)
      .use(phaseRoutes)
      .use(searchRoutes)
      .use(webhookRoutes)
      .use(automationRoutes)
      .use(integrationsRoutes)
      .use(reportsRoutes)
      .use(timeTrackingRoutes)
      .use(importerRoutes)
      .use(roleRoutes)
      .use(componentRoutes)
      .use(priorityRoutes)
      .use(auditRoutes)
      .use(docRoutes)
      .use(formRoutes)
      .use(ssoRoutes)
      .use(developerRoutes)
      .use(trashRoutes)
      .use(billingRoutes)
      .use(chatRoutes)
      .use(presenceRoutes)
      .use(calendarRoutes)
      .use(calendarCallbackRoutes)
      .use(gitRoutes)
      .use(gitWebhookRoutes)
  )
  .listen(env.PORT);

// Initialize the WebSocket event bus with the Bun server instance
if (app.server) {
  setupRealtimeEventBus(app.server);
}

// Append-only log retention (audit/activity/notifications) — see modules/audit/retention.ts
const stopRetentionJob = startRetentionJob(db);

logger.info({ host: app.server?.hostname, port: app.server?.port }, '🚀 Boardly API is running');

// ── Graceful Shutdown & Drain Handler ─────────────────────────────────────────
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal, inFlight }, 'Draining in-flight requests and shutting down gracefully...');

  // 1. Stop accepting new connections
  if (app.server) {
    try {
      app.server.stop(true);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: errMsg }, 'Error stopping HTTP listener');
    }
  }

  // 2. Drain in-flight requests (max 25s deadline — fits inside K8s 45s terminationGracePeriod)
  const deadline = Date.now() + 25_000;
  while (inFlight > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }

  if (inFlight > 0) {
    logger.warn({ inFlight }, 'Drain deadline reached with requests still pending');
  } else {
    logger.info({}, 'All in-flight requests drained successfully');
  }

  // 3. Stop housekeeping timers, then close Redis + Database client pools
  stopRetentionJob();
  await Promise.allSettled([disconnectRedis(), disconnectDb()]);

  logger.info({}, 'Clean shutdown completed. Exiting.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export type App = typeof app;
