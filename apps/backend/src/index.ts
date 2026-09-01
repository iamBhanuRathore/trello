import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { db } from './db/index';
import { healthRoutes } from './modules/health/routes';
import { authRoutes } from './modules/auth/routes';
import { orgRoutes, inviteRoutes } from './modules/organizations/routes';
import { workspaceRoutes } from './modules/workspaces/routes';
import { projectRoutes } from './modules/projects/routes';
import { boardRoutes } from './modules/boards/routes';
import { listRoutes } from './modules/lists/routes';
import { cardRoutes } from './modules/cards/routes';
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
import { auditRoutes } from './modules/audit/routes';
import { docRoutes } from './modules/docs/routes';
import { formRoutes } from './modules/forms/routes';
import { ssoRoutes } from './modules/sso/routes';
import { developerRoutes } from './modules/developer/routes';
import { trashRoutes } from './modules/trash/routes';
import { billingRoutes } from './modules/billing/routes';

import { formatErrorResponse } from './lib/errors';
import { sql } from 'drizzle-orm';

// Ensure enum values and schema columns are up to date in the database on boot
db.execute(sql`ALTER TYPE "org_member_role" ADD VALUE IF NOT EXISTS 'viewer'`).catch(() => {});
db.execute(sql`ALTER TABLE IF EXISTS "sso_configurations" ADD COLUMN IF NOT EXISTS "workos_organization_id" varchar(255)`).catch(() => {});
db.execute(sql`ALTER TABLE IF EXISTS "sso_configurations" ADD COLUMN IF NOT EXISTS "workos_connection_id" varchar(255)`).catch(() => {});

// Setup event listeners
setupNotificationListeners(db);
setupWebhookDispatcher(db);
setupAutomationEngine(db);

const allowedOrigins = [
  ...(env.DASHBOARD_URL?.split(',').map((s) => s.trim()) || [])
];

const isAllowedOrigin = (origin: string | null): boolean => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  // Always permit local development hosts regardless of port/protocol/127.0.0.1 vs localhost
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
};

const app = new Elysia()
  // ── Global middleware ──────────────────────────────────────────────────────
  .use(
    cors({
      origin: (request: Request): boolean => {
        const origin = request.headers.get('origin');
        return isAllowedOrigin(origin);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
      allowedHeaders: true,
      exposeHeaders: true,
      maxAge: 86400,
    })
  )
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
  .onError(({ error, code, set }) => {
    if (code === 'VALIDATION') {
      set.status = 422;
      return {
        error: 'Validation failed',
        details: error.message,
      };
    }

    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { error: 'Resource not found' };
    }

    const { status, body } = formatErrorResponse(error);
    set.status = status;
    return body;
  })

  // ── Request logging ────────────────────────────────────────────────────────
  .onRequest(({ request }) => {
    logger.info({ method: request.method, url: request.url }, 'Incoming request');
  })

  // ── Routes (versioned under /v1) ───────────────────────────────────────────
  .use(healthRoutes)
  .group('/v1', (app) =>
    app
      .use(authRoutes)
      .use(inviteRoutes)
      .use(orgRoutes)
      .use(workspaceRoutes)
      .use(projectRoutes)
      .use(boardRoutes)
      .use(listRoutes)
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
      .use(auditRoutes)
      .use(docRoutes)
      .use(formRoutes)
      .use(ssoRoutes)
      .use(developerRoutes)
      .use(trashRoutes)
      .use(billingRoutes)
  )
  .listen(env.PORT);

// Initialize the WebSocket event bus with the Bun server instance
if (app.server) {
  setupRealtimeEventBus(app.server);
}

logger.info(
  { host: app.server?.hostname, port: app.server?.port },
  '🚀 Boardly API is running'
);

export type App = typeof app;
