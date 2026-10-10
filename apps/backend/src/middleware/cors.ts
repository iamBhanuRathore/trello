import { env } from '../lib/env';
import { warnSwallowed } from '../lib/errors';

const allowedOrigins = [...(env.DASHBOARD_URL?.split(',').map((s) => s.trim()) || [])];

/**
 * Validates whether the incoming Origin header is permitted.
 *
 * Fail-closed: an empty allowlist permits nothing (no localhost fallback).
 * The Dashboard URLs already include the local dev ports, so dev works without
 * a wildcard; set ALLOW_ANY_ORIGIN=1 only for exotic origins.
 */
export const isAllowedOrigin = (origin: string | null): boolean => {
  if (!origin) return false;
  if (env.ALLOW_ANY_ORIGIN) return true;
  // Strict allowlist from DASHBOARD_URL. No LAN/private-range bypass: a reflected
  // origin combined with allow-credentials would hand credentialed access to any
  // private-network page (CSRF-adjacent). Non-browser clients don't need ACAO.
  return allowedOrigins.includes(origin);
};

/**
 * Resolves the appropriate Access-Control-Allow-Origin value based on the request.
 * Returns '' when nothing matches — fail-closed (browsers reject an empty ACAO
 * with credentials) instead of reflecting a fallback origin.
 */
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
    } catch (err) {
      // Client-controlled input: malformed values are routine, not attacks.
      warnSwallowed(err, 'cors.refererParse');
    }
  }
  return '';
};

/**
 * Attaches spec-compliant CORS headers to a response header dictionary.
 */
export const applyCorsHeaders = (headers: Record<string, any>, request: Request): void => {
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
