// Imported for its side effect: must initialize before any other module so
// the SDK's global handlers are installed before user code can throw.
import './lib/sentry';
import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import type { AuthContext } from './middleware/auth';
import { captureServerError, flushSentry } from './lib/sentry';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { db, disconnectDb } from './db/index';
import { runBootMigrations } from './db/bootstrap';
import { ensurePermissionsSeeded } from './modules/roles/service';
import { redisService, disconnectRedis } from './redis';
import { workerService } from './lib/workers';
import { healthRoutes } from './modules/health/routes';
import { applySecurityHeaders } from './lib/security-headers';
import { setupRealtimeEventBus } from './modules/realtime/routes';
import { v1Routes } from './routes/v1';
import { applyCorsHeaders, isAllowedOrigin, resolveOrigin } from './middleware/cors';
import { formatErrorResponse, formatValidationError } from './lib/errors';

// Re-export CORS helpers for backward compatibility
export { isAllowedOrigin, resolveOrigin, applyCorsHeaders };

// In-flight request tracking for graceful draining
let inFlight = 0;
let shuttingDown = false;

// 1. Ensure enum values and schema columns are up to date on boot
await runBootMigrations(db).catch((err: unknown) => {
  captureServerError(err, { route: 'boot' });
  throw err;
});

// 1b. Seed the permission registry once per process. The auth middleware resolves
// permissions on every authenticated request and must never write to the DB
// on that path.
await ensurePermissionsSeeded(db).catch((err: unknown) => {
  // Non-fatal: the resolver falls back to its DB path. Capture it anyway —
  // a permissions registry that silently fails to seed is a real defect.
  captureServerError(err, { route: 'boot' });
  logger.error({ err }, 'Permission registry seed failed at boot');
});

// 2. Initialize Redis Pub/Sub cluster connection
await redisService.connect();

// 3. Setup event listeners and recurring background workers
workerService.start(db);

// 4. Initialize Elysia Application
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
      // Elysia never fires onAfterResponse for onRequest early-returns
      inFlight = Math.max(0, inFlight - 1);
      return new Response(null, { status: 204, headers });
    }
    return undefined;
  })
  .onAfterResponse(() => {
    // The single decrement point for every request.
    //
    // onAfterResponse fires for successful responses AND for responses produced
    // by onError (verified: a thrown handler fires onRequest -> onError ->
    // onAfterResponse, as does an unmatched route). The old code also decremented
    // inside onError, so every error decremented twice. The Math.max(0, …) clamp
    // hid that, but it made the shutdown drain below believe the server was idle
    // while requests were still running — so a deploy could sever live requests.
    inFlight = Math.max(0, inFlight - 1);
  })

  // mapResponse fires for EVERY response (including short-circuited middleware & errors)
  .mapResponse(({ request, set }) => {
    if (!set.headers) set.headers = {};
    applyCorsHeaders(set.headers as Record<string, any>, request);
    applySecurityHeaders(set);
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

  // ── Global Error Handler ───────────────────────────────────────────────────
  .onError((ctx) => {
    const { error, code, set, request } = ctx;
    // No inFlight decrement here on purpose: onAfterResponse always follows an
    // error response, so decrementing in both places double-counted every error.

    if (!set.headers) set.headers = {};
    applyCorsHeaders(set.headers as Record<string, any>, request);

    // Elysia's VALIDATION/NOT_FOUND codes return clean shapes below. They are
    // handled first, and on purpose: formatErrorResponse() logs anything that
    // isn't a recognized shape at error level, so calling it before these
    // branches would double-log every rejected request.
    if (code === 'VALIDATION') {
      set.status = 422;
      return formatValidationError(error);
    }

    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { error: 'Resource not found' };
    }

    // 4xx are the client's problem and are already returned as clean API
    // shapes — only 5xx is a server defect worth an event. The status is the
    // one this same response returns, so the two can never disagree.
    const { status, body } = formatErrorResponse(error);
    if (status >= 500) {
      // `user` is set by the auth middleware's global derive and is absent on
      // public routes. Typed partial access — Elysia widens derive values on
      // an un-annotated onError hook, so it is asserted explicitly here.
      const auth = (ctx as Partial<{ user: AuthContext }>).user;
      captureServerError(error, {
        userId: auth?.userId,
        orgId: auth?.organizationId,
        route: request.url,
      });
    }

    set.status = status;
    return body;
  })

  // ── Route Mounting ─────────────────────────────────────────────────────────
  .use(healthRoutes)
  .group('/v1', (app) => app.use(v1Routes))
  .listen(env.PORT);

// Initialize the WebSocket event bus with the Bun server instance
if (app.server) {
  setupRealtimeEventBus(app.server);
}

// Storage bucket advisory
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

  // 3. Flush buffered error events BEFORE tearing down the process, otherwise
  // the crash-time event — the one that motivated the deploy — is the one that
  // never ships.
  await flushSentry();

  // 4. Stop background workers, then close Redis + Database client pools
  workerService.stop();
  await Promise.allSettled([disconnectRedis(), disconnectDb()]);

  logger.info({}, 'Clean shutdown completed. Exiting.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export type App = typeof app;
