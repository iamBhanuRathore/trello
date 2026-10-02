import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { db, disconnectDb } from './db/index';
import { runBootMigrations } from './db/bootstrap';
import { redisService, disconnectRedis } from './redis';
import { workerService } from './lib/workers';
import { healthRoutes } from './modules/health/routes';
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
await runBootMigrations(db);

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
    inFlight = Math.max(0, inFlight - 1);
  })

  // mapResponse fires for EVERY response (including short-circuited middleware & errors)
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

  // ── Global Error Handler ───────────────────────────────────────────────────
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

  // 3. Stop background workers, then close Redis + Database client pools
  workerService.stop();
  await Promise.allSettled([disconnectRedis(), disconnectDb()]);

  logger.info({}, 'Clean shutdown completed. Exiting.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export type App = typeof app;
