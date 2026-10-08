import * as Sentry from '@sentry/bun';
import { env } from './env';
import { logger } from './logger';

/**
 * Backend error monitoring.
 *
 * Free-tier frugality is deliberate (docs/Decisions.md): errors at 1.0,
 * zero performance tracing, and no replay (replay is a browser-only concept).
 * The client is a strict no-op unless a DSN is present, so every call site can
 * capture unconditionally.
 */
export const SENTRY_ENABLED =
  !!env.SENTRY_DSN && (env.NODE_ENV === 'production' || env.SENTRY_ENABLED);

if (SENTRY_ENABLED) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: env.GIT_SHA || undefined,
    sampleRate: 1.0,
    tracesSampleRate: 0,
    // Bun's global error integrations (onUncaughtException /
    // onUnhandledRejection) ship enabled by default and cover the
    // process-level paths. Do not register our own process.on handlers — that
    // would double-capture every crash.
    integrations: [],
    beforeSend(event) {
      // Connection refusals and DNS failures are infrastructure noise, not
      // application defects; they surface on the deployment health checks.
      if (event.exception?.values?.some((v) => v.type === 'ConnectionRefused')) {
        return null;
      }
      return event;
    },
  });
}

export interface ServerErrorContext {
  userId?: string;
  orgId?: string;
  route?: string;
}

/**
 * Throttle for background captures, keyed by route tag.
 *
 * The housekeeping jobs run on fixed intervals — the media scanner ticks
 * every 5s, retention every 6h — and a persistent failure (bad DB grant, S3
 * outage) would otherwise emit an event every tick and exhaust the free-tier
 * quota on the first bad deploy, exactly when the events matter most. Request
 * errors are NOT throttled: they arrive at human rate and carry the request's
 * identity, which is what makes them actionable.
 */
const BACKGROUND_ROUTE_LIMIT = 5;
const BACKGROUND_ROUTE_WINDOW_MS = 60 * 60 * 1000;
const backgroundRouteSeen = new Map<string, { count: number; resetAt: number }>();

function isBackgroundRoute(route: string | undefined): boolean {
  return !!route && (route === 'boot' || route.startsWith('worker:'));
}

function backgroundQuotaExhausted(route: string): boolean {
  const now = Date.now();
  const seen = backgroundRouteSeen.get(route);
  if (!seen || seen.resetAt <= now) {
    backgroundRouteSeen.set(route, { count: 1, resetAt: now + BACKGROUND_ROUTE_WINDOW_MS });
    return false;
  }
  seen.count += 1;
  return seen.count > BACKGROUND_ROUTE_LIMIT;
}

/**
 * Captures a server-side error with request context attached.
 *
 * Uses an isolation scope, never the global scope: a Bun process serves every
 * request concurrently, so a global setUser would leak one tenant's identity
 * onto another tenant's events. The isolation scope is discarded after this
 * call returns.
 */
export function captureServerError(err: unknown, ctx: ServerErrorContext = {}): void {
  if (!SENTRY_ENABLED) return;
  if (isBackgroundRoute(ctx.route) && backgroundQuotaExhausted(ctx.route!)) {
    logger.warn({ route: ctx.route }, 'Sentry background capture throttled');
    return;
  }
  Sentry.withIsolationScope((scope) => {
    if (ctx.userId) scope.setUser({ id: ctx.userId });
    if (ctx.orgId) scope.setTag('org_id', ctx.orgId);
    if (ctx.route) scope.setTag('route', ctx.route);
    scope.setLevel('error');
    Sentry.captureException(err);
  });
}

/**
 * Flushes buffered events before the process exits. The SDK batches and
 * transmits asynchronously, so without this the last event before a crash or
 * deploy is the one most likely to be lost.
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!SENTRY_ENABLED) return;
  try {
    await Sentry.close(timeoutMs);
  } catch {
    // A failed flush must never block shutdown.
  }
}
