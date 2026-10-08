import * as Sentry from '@sentry/react';
import axios from 'axios';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const RELEASE = import.meta.env.VITE_GIT_SHA as string | undefined;

export const SENTRY_ENABLED =
  !!DSN && (import.meta.env.PROD || import.meta.env.VITE_SENTRY_ENABLED === 'true');

/**
 * HTTP statuses that are part of normal operation and must never become an
 * issue: auth expiry (401), permission and quota denial (403), a deleted or
 * mistyped resource (404), and schema validation (422). The API returns all of
 * these as clean shapes the UI already renders.
 */
const IGNORED_HTTP_STATUSES = new Set([401, 403, 404, 422]);

/**
 * Free-tier quota guard: 10 events/minute per tab.
 *
 * A single incident (a bad deploy, a dead backend) turns one logical fault
 * into thousands of events — every render that throws, every poll that fails,
 * every queued action that retries. The free plan allows ~5k errors and 50
 * replays per month, so an unguarded loop exhausts it in minutes and the quota
 * is gone precisely when the next incident happens.
 */
const CLIENT_EVENT_BUDGET = 10;
const CLIENT_EVENT_WINDOW_MS = 60_000;
let windowStart = 0;
let windowCount = 0;

function overClientBudget(): boolean {
  const now = Date.now();
  if (now - windowStart > CLIENT_EVENT_WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  return windowCount > CLIENT_EVENT_BUDGET;
}

export function initSentry(): void {
  if (!SENTRY_ENABLED || !DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    release: RELEASE || undefined,
    // Free tier: full error reporting, replays only when something breaks,
    // no performance tracing (traces are billed separately and unused here).
    sampleRate: 1.0,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
    tracesSampleRate: 0,
    integrations: [
      Sentry.replayIntegration({
        // Boardly holds board, card, chat and billing content. Mask every
        // text node, block every media element, and never let an option flip
        // maskAllInputs off — an unmasked input is a customer's data on a
        // third-party server. Request bodies are not captured either.
        maskAllText: true,
        blockAllMedia: true,
        networkDetailAllowUrls: [],
      }),
    ],
    // ResizeObserver loop noise is a browser quirk, not an app defect.
    // Extension errors originate outside our code and cannot be fixed here.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      /^Non-Error promise rejection captured with value/,
      /extensions\//i,
      /^moz-extension:\/\//,
    ],
    // Same rationale as ignoreErrors, enforced before the event is built.
    denyUrls: [/chrome-extension:\/\//, /moz-extension:\/\//],
    beforeSend(event, hint) {
      if (overClientBudget()) return null;

      const err = hint.originalException;

      if (axios.isAxiosError(err)) {
        // A cancelled request is a deliberate abort (query cancellation on
        // navigation, superseded refresh) — never a fault.
        if (
          err.code === 'ERR_CANCELED' ||
          err.name === 'CanceledError' ||
          err.name === 'AbortError'
        ) {
          return null;
        }
        const status = err.response?.status;
        if (status !== undefined && IGNORED_HTTP_STATUSES.has(status)) return null;
      }

      // Offline is a client condition we already surface in the UI.
      if (typeof navigator !== 'undefined' && !navigator.onLine) return null;

      // A stale chunk after a deploy is the single most actionable signal a
      // dashboard can emit, and it recurs on identical text across users.
      // Fingerprinting collapses those into one issue instead of thousands
      // that each burn quota and none of which is individually ranked.
      const message = event.exception?.values?.[0]?.value ?? '';
      if (
        /Loading chunk|Failed to fetch dynamically imported module|ChunkLoadError/i.test(message)
      ) {
        event.fingerprint = ['chunk-load-failed'];
      }

      return event;
    },
  });
}

/**
 * Captures an API failure at the call site.
 *
 * The interceptor in `lib/api.ts` must send explicitly rather than relying on
 * the global `unhandledrejection` handler: those rejections are consumed by the
 * query/mutation layer and toasted to the user, so they never become unhandled
 * and the handler never sees them. A bare `setTag` is equally wrong here — it
 * writes to the global scope and sticks to every later event, mislabelling
 * unrelated errors with whichever endpoint failed last.
 */
export function captureApiError(err: unknown, url: string): void {
  if (!SENTRY_ENABLED) return;
  Sentry.withScope((scope) => {
    scope.setTag('api_endpoint', url);
    scope.setLevel('error');
    Sentry.captureException(err);
  });
}

/**
 * Captures a render/lifecycle crash with its component stack attached. Called
 * from RootErrorBoundary's componentDidCatch — a boundary catches the throw, so
 * it never reaches the global handlers.
 */
export function captureRenderError(err: unknown, componentStack: string | null | undefined): void {
  if (!SENTRY_ENABLED) return;
  Sentry.withScope((scope) => {
    if (componentStack) scope.setContext('react', { componentStack });
    Sentry.captureException(err);
  });
}
