import * as Sentry from '@sentry/react';
import axios from 'axios';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const RELEASE = import.meta.env.VITE_GIT_SHA as string | undefined;

export const SENTRY_ENABLED =
  !!DSN && (import.meta.env.PROD || import.meta.env.VITE_SENTRY_ENABLED === 'true');

const IGNORED_HTTP_STATUSES = new Set([401, 403, 404, 422]);

/** Free-tier quota guard — see the dashboard's lib/sentry.ts for the rationale. */
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
    sampleRate: 1.0,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
    tracesSampleRate: 0,
    // Distinguishes this surface from the end-user dashboard: platform-admin
    // events must never be filed against the customer-facing project.
    initialScope: { tags: { app: 'super-admin' } },
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
        networkDetailAllowUrls: [],
      }),
    ],
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      /^Non-Error promise rejection captured with value/,
      /extensions\//i,
      /^moz-extension:\/\//,
    ],
    denyUrls: [/chrome-extension:\/\//, /moz-extension:\/\//],
    beforeSend(event, hint) {
      if (overClientBudget()) return null;

      const err = hint.originalException;

      if (axios.isAxiosError(err)) {
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

      if (typeof navigator !== 'undefined' && !navigator.onLine) return null;

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
 * Explicit capture — these rejections are caught and toasted by callers, so
 * the global unhandledrejection handler never sees them.
 */
export function captureApiError(err: unknown, url: string): void {
  if (!SENTRY_ENABLED) return;
  Sentry.withScope((scope) => {
    scope.setTag('api_endpoint', url);
    scope.setLevel('error');
    Sentry.captureException(err);
  });
}

export function captureRenderError(err: unknown, componentStack: string | null | undefined): void {
  if (!SENTRY_ENABLED) return;
  Sentry.withScope((scope) => {
    if (componentStack) scope.setContext('react', { componentStack });
    Sentry.captureException(err);
  });
}
