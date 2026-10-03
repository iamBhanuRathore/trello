import { describe, it, expect, mock } from 'bun:test';
import { Elysia } from 'elysia';

/**
 * The processing-failure half of the webhook status contract.
 *
 * `lib/stripe` is stubbed so a legitimately signed event reaches the handler and
 * then fails for a purely local reason — no Stripe credentials, no network, and
 * no test secret to manage. `lib/env` is parsed once at module load, which is why
 * this lives in its own file.
 *
 * Pre-fix, the single `catch { 400 }` answered 400 here. Stripe does not retry a
 * 400, so one transient failure discarded the billing event for good.
 */

/** Every subscription lookup fails: this is the "signed, cannot process" case. */
mock.module('../../lib/stripe', () => ({
  stripe: () => {
    throw Object.assign(new Error('ECONNREFUSED 10.0.0.5:5432 — connection terminated'), {
      cause: 'db',
    });
  },
  constructWebhookEvent: (payload: string) => JSON.parse(payload),
  getOrCreateStripeCustomer: async () => ({ customerId: 'cus_test' }),
  createCheckoutSession: async () => {
    throw new Error('not used');
  },
  createBillingPortalSession: async () => {
    throw new Error('not used');
  },
  updateSubscriptionSeatQuantity: async () => {
    throw new Error('not used');
  },
  scheduleSubscriptionSeatDecrease: async () => {
    throw new Error('not used');
  },
  previewProratedInvoice: async () => {
    throw new Error('not used');
  },
  listInvoices: async () => [],
}));

async function post(body: string, withSignature: boolean) {
  const { billingRoutes } = await import('./routes');
  const server = new Elysia().group('/v1', (g) => g.use(billingRoutes)).listen(0);
  try {
    const res = await fetch(`http://localhost:${server.server?.port}/v1/billing/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(withSignature ? { 'stripe-signature': 't=1,v1=stubbed' } : {}),
      },
      body,
    });
    return { status: res.status, body: await res.text() };
  } finally {
    await server.stop(true);
  }
}

/** Signed, and the handler reaches a subscription lookup that fails. */
function unprocessableEvent(id: string) {
  return JSON.stringify({
    id,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${id}`,
        subscription: 'sub_nonexistent',
        customer: 'cus_test',
        metadata: { org_id: '00000000-0000-0000-0000-000000000000' },
      },
    },
  });
}

describe('POST /v1/billing/webhook — signed but unprocessable', () => {
  it('returns 500 so Stripe retries', async () => {
    const res = await post(unprocessableEvent('evt_processing_failure'), true);
    expect(res.status).toBe(500);
    expect(res.body).toContain('Webhook processing failed');
  });

  it('does not leak the internal error to an unauthenticated caller', async () => {
    const res = await post(unprocessableEvent('evt_processing_failure'), true);
    const lower = res.body.toLowerCase();
    expect(lower).not.toContain('econnrefused');
    expect(lower).not.toContain('10.0.0.5');
    expect(lower).not.toContain('connection terminated');
    expect(lower).not.toContain('postgres');
    expect(lower).not.toContain('stack');
  });

  it('still returns 400 when the signature header is missing', async () => {
    const res = await post(unprocessableEvent('evt_missing_sig'), false);
    expect(res.status).toBe(400);
    expect(res.body).toContain('stripe-signature');
  });
});
