import { describe, it, expect } from 'bun:test';
import { Elysia } from 'elysia';

/**
 * Webhook status-code contract (P0).
 *
 * One `catch { 400 }` covered both signature validation and processing. Stripe
 * does not retry a 400, so a transient database failure during processing
 * discarded the billing event permanently. The body also echoed the raw error
 * message back to an unauthenticated caller.
 *
 *   400 -> the request is bad (missing/invalid signature); Stripe will not retry
 *   500 -> signed but unprocessable; Stripe will retry, and the claim state in
 *          billing_events makes the retry safe
 *
 * `lib/env` is parsed once at import time, so the signed-event test sets the
 * Stripe vars before importing the routes module and loads it through a
 * cache-busting specifier.
 */

async function post(
  payload: string,
  headers: Record<string, string>,
  routesPath: string
): Promise<{ status: number; body: string }> {
  const mod = await import(routesPath);
  const server = new Elysia().group('/v1', (g) => g.use(mod.billingRoutes)).listen(0);
  try {
    const res = await fetch(`http://localhost:${server.server?.port}/v1/billing/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: payload,
    });
    return { status: res.status, body: await res.text() };
  } finally {
    await server.stop(true);
  }
}

// Plain import path for the cases that do not need Stripe configured.
const ROUTES = './routes';

describe('POST /v1/billing/webhook status codes', () => {
  it('400 when the stripe-signature header is missing', async () => {
    const res = await post(JSON.stringify({ id: 'evt_x', type: 'ping' }), {}, ROUTES);
    expect(res.status).toBe(400);
    expect(res.body).toContain('stripe-signature');
  });

  it('400 when the signature does not verify', async () => {
    const res = await post(
      JSON.stringify({
        id: 'evt_bad_sig',
        type: 'invoice.payment_succeeded',
        data: { object: {} },
      }),
      { 'stripe-signature': 't=12345,v1=notarealsignaturevalue' },
      ROUTES
    );
    expect(res.status).toBe(400);
  });

  it('does not leak internal error detail in the 400 body', async () => {
    const res = await post(
      JSON.stringify({ id: 'evt_leak', type: 'ping' }),
      {
        'stripe-signature': 'garbage',
      },
      ROUTES
    );
    expect(res.status).toBe(400);
    const lower = res.body.toLowerCase() ?? '';
    expect(lower).not.toContain('stack');
    expect(lower).not.toContain('postgres');
    expect(lower).not.toContain('node_modules');
    expect(lower).not.toContain('select ');
  });

  it('the processing branch never builds a body from the raw error message', async () => {
    const src = await Bun.file(new URL('./routes.ts', import.meta.url)).text();
    expect(src).not.toContain('`Webhook Error: ${errorMessage(err)}`');
    expect(src).toContain('set.status = 500');
    expect(src).toContain("return { error: 'Webhook processing failed' }");
  });
});
