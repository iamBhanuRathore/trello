// Document headers (CSP, framing, HSTS, COOP) live in
// apps/dashboard/vercel.json — the backend never serves HTML. These cover
// JSON API responses only, applied from the mapResponse hook in index.ts.
//
// NOTE: keep this a plain function, not an Elysia plugin. Both
// `new Elysia().mapResponse(...)` instances and loose function-form plugins
// fail to propagate (verified empirically), and loose generics poison the
// App type that Eden Treaty infers the dashboard client from.
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
};

export function applySecurityHeaders(set: { headers?: unknown }): void {
  if (set.headers == null || typeof set.headers !== 'object') set.headers = {};
  Object.assign(set.headers as Record<string, string>, SECURITY_HEADERS);
}
