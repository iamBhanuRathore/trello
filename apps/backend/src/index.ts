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
import {
  projectAutomationRoutes,
  projectAutomationContextRoutes,
} from './modules/automations/project-routes';
import { setupAutomationEngine } from './modules/automations/service';
import { setupProjectAutomationEngine } from './modules/automations/project-engine';
import { integrationsRoutes } from './modules/integrations/routes';
import { reportsRoutes } from './modules/reports/routes';
import { timeTrackingRoutes } from './modules/timetracking/routes';
import { importerRoutes } from './modules/importers/routes';
import { roleRoutes } from './modules/roles/routes';
import { componentRoutes } from './modules/components/routes';
import { priorityRoutes } from './modules/priorities/routes';
import { auditRoutes } from './modules/audit/routes';
import { startRetentionJob } from './modules/audit/retention';
import { startRefreshTokenCleanup } from './modules/auth/cleanup';
import { docRoutes } from './modules/docs/routes';
import { formRoutes } from './modules/forms/routes';
import { ssoRoutes } from './modules/sso/routes';
import { developerRoutes } from './modules/developer/routes';
import { trashRoutes } from './modules/trash/routes';
import { billingRoutes } from './modules/billing/routes';
import { chatRoutes } from './modules/chat/routes';
import { mediaRoutes } from './modules/media/routes';
import { startScanWorker } from './modules/media/scan';
import { startMediaGC } from './modules/media/gc';
import { presenceRoutes } from './modules/presence/routes';
import { calendarRoutes, calendarCallbackRoutes } from './modules/calendar/routes';
import { gitRoutes, gitWebhookRoutes } from './modules/git/routes';
import { inboxRoutes } from './modules/inbox/routes';
import { inboundEmailRoutes, inboundTokenRoutes } from './modules/inbound/routes';

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

// Media scan-gate columns (0035): boot-time backstop so DBs that haven't run
// `db:migrate` yet don't crash on missing columns. Migrations are canonical.
for (const ddl of [
  `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'staged' NOT NULL`,
  `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "scan_status" varchar(16) DEFAULT 'pending' NOT NULL`,
  `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "scan_attempts" integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "scanned_at" timestamp`,
  `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "checksum_sha256" varchar(64)`,
  `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "declared_mime" varchar(100)`,
  `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "storage_key" text`,
  `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'staged' NOT NULL`,
  `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "scan_status" varchar(16) DEFAULT 'pending' NOT NULL`,
  `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "scan_attempts" integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "scanned_at" timestamp`,
  `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "checksum_sha256" varchar(64)`,
  `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "declared_mime" varchar(100)`,
  `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "storage_key" text`,
]) {
  db.execute(sql.raw(ddl)).catch(() => {});
}
// 0039: recover the object key for pre-gate rows from their stored public URL so
// the documented ready/pending legacy exception stays resolvable.
for (const ddl of [
  `UPDATE "attachments" SET "storage_key" = CASE WHEN "url" LIKE '%/orgs/%' THEN substring("url" from '/(orgs/.+)$') ELSE NULLIF(regexp_replace("url", '^.*(attachments/file/|key=)', ''), '') END WHERE "storage_key" IS NULL AND "url" IS NOT NULL AND ("url" LIKE '%/orgs/%' OR "url" LIKE '%attachments/file/%' OR "url" LIKE '%key=%')`,
  `UPDATE "chat_attachments" SET "storage_key" = CASE WHEN "file_url" LIKE '%/orgs/%' THEN substring("file_url" from '/(orgs/.+)$') ELSE NULLIF(regexp_replace("file_url", '^.*(attachments/file/|key=)', ''), '') END WHERE "storage_key" IS NULL AND "file_url" IS NOT NULL AND ("file_url" LIKE '%/orgs/%' OR "file_url" LIKE '%attachments/file/%' OR "file_url" LIKE '%key=%')`,
]) {
  db.execute(sql.raw(ddl)).catch(() => {});
}
// Inbox federation (0036): same backstop pattern as above.
for (const ddl of [
  `ALTER TABLE IF EXISTS "notifications" ADD COLUMN IF NOT EXISTS "snoozed_until" timestamp`,
  `ALTER TABLE IF EXISTS "notifications" ADD COLUMN IF NOT EXISTS "source" varchar(16) DEFAULT 'notification' NOT NULL`,
]) {
  db.execute(sql.raw(ddl)).catch(() => {});
}
db.execute(
  sql`CREATE TABLE IF NOT EXISTS "inbox_item_state" ("user_id" uuid NOT NULL REFERENCES "users"("id"), "source" varchar(16) NOT NULL, "ref_id" text NOT NULL, "snoozed_until" timestamp, "dismissed_at" timestamp, CONSTRAINT "inbox_item_state_pkey" PRIMARY KEY ("user_id","source","ref_id"))`
).catch(() => {});
// Inbound email tables (0037): same backstop pattern as above.
db.execute(
  sql`CREATE TABLE IF NOT EXISTS "inbound_email_tokens" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id"), "scope" varchar(16) NOT NULL, "ref_id" uuid NOT NULL, "token_hash" varchar(64) NOT NULL, "token_prefix" varchar(16) NOT NULL, "allowlist" text, "expires_at" timestamp, "revoked_at" timestamp, "created_by" uuid REFERENCES "users"("id"), "created_at" timestamp NOT NULL DEFAULT now())`
).catch(() => {});
db.execute(
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "inbound_token_hash_idx" ON "inbound_email_tokens" USING btree ("token_hash")`
).catch(() => {});
db.execute(
  sql`CREATE TABLE IF NOT EXISTS "inbound_emails" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "message_id" varchar(1024) NOT NULL, "organization_id" uuid NOT NULL REFERENCES "organizations"("id"), "token_id" uuid REFERENCES "inbound_email_tokens"("id"), "from_address" varchar(320), "to_address" varchar(320), "subject" varchar(500), "status" varchar(16) NOT NULL DEFAULT 'received', "result" jsonb NOT NULL DEFAULT '{}', "raw_email" text, "raw_truncated" boolean NOT NULL DEFAULT false, "failed_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now())`
).catch(() => {});
db.execute(
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "inbound_emails_message_idx" ON "inbound_emails" USING btree ("organization_id","message_id")`
).catch(() => {});
db.execute(
  sql`ALTER TABLE IF EXISTS "inbound_emails" ADD COLUMN IF NOT EXISTS "raw_email" text`
).catch(() => {});
db.execute(
  sql`ALTER TABLE IF EXISTS "inbound_emails" ADD COLUMN IF NOT EXISTS "raw_truncated" boolean NOT NULL DEFAULT false`
).catch(() => {});
db.execute(
  sql`ALTER TABLE IF EXISTS "inbound_emails" ADD COLUMN IF NOT EXISTS "failed_at" timestamp`
).catch(() => {});
// Sliding refresh families (0033): same backstop pattern as above.
for (const ddl of [
  `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "family_id" uuid`,
  `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "parent_hash" varchar(255)`,
  `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "replaced_by_hash" varchar(255)`,
  `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "absolute_expires_at" timestamp`,
  `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp`,
  `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "grace_uses" integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "ua_hash" varchar(64)`,
  `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "ip_hash" varchar(64)`,
]) {
  db.execute(sql.raw(ddl)).catch(() => {});
}
db.execute(
  sql`UPDATE "refresh_tokens" SET "family_id" = gen_random_uuid() WHERE "family_id" IS NULL`
).catch(() => {});
db.execute(
  sql`UPDATE "refresh_tokens" SET "absolute_expires_at" = "expires_at" WHERE "absolute_expires_at" IS NULL`
).catch(() => {});

// Setup event listeners
setupNotificationListeners(db);
setupWebhookDispatcher(db);
setupAutomationEngine(db);
setupProjectAutomationEngine(db);

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
      // Balance the onRequest increment: Elysia never fires onAfterResponse
      // for onRequest early-returns (verified), so without this every CORS
      // preflight leaks +1 and the shutdown drain always hits its deadline.
      inFlight = Math.max(0, inFlight - 1);
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
      .use(projectAutomationRoutes)
      .use(projectAutomationContextRoutes)
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
      .use(mediaRoutes)
      .use(presenceRoutes)
      .use(calendarRoutes)
      .use(calendarCallbackRoutes)
      .use(gitRoutes)
      .use(gitWebhookRoutes)
      .use(inboxRoutes)
      .use(inboundEmailRoutes)
      .use(inboundTokenRoutes)
  )
  .listen(env.PORT);

// Initialize the WebSocket event bus with the Bun server instance
if (app.server) {
  setupRealtimeEventBus(app.server);
}

// Append-only log retention (audit/activity/notifications) — see modules/audit/retention.ts
const stopRetentionJob = startRetentionJob(db);

// Expired refresh-token families — see modules/auth/cleanup.ts
const stopRefreshTokenCleanup = startRefreshTokenCleanup(db);

// Media virus-scan worker + staged-upload GC (5.5; no-ops when SCAN_MODE=disabled).
const stopScanWorker = startScanWorker(db);
const stopMediaGC = startMediaGC(db);

// 5.5 bucket lockdown (advisory until cutover): all reads are presigned, so
// the bucket must not grant public-read. Flip to enforced once the cutover
// runbook confirms zero direct-URL traffic (see Decisions.md).
if (process.env['STORAGE_BUCKET']) {
  logger.warn(
    { bucket: process.env['STORAGE_BUCKET'] },
    'Advisory: remove public-read from the uploads bucket — reads are presigned-only'
  );
}

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
  stopRefreshTokenCleanup();
  stopScanWorker();
  stopMediaGC();
  await Promise.allSettled([disconnectRedis(), disconnectDb()]);

  logger.info({}, 'Clean shutdown completed. Exiting.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export type App = typeof app;
