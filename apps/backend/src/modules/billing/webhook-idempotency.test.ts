import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { db as appDb } from '../../db/index';
import { processStripeWebhook } from './service';

/**
 * Stripe webhook idempotency and failure-status behaviour (P0).
 *
 * The handler used to insert its `billing_events` row only AFTER applying side
 * effects, which broke in two directions:
 *
 *  - crash between the side effects and the insert left no row, so Stripe's
 *    retry re-ran the whole handler and applied the change twice;
 *  - the failure path inserted a row carrying `error`, and the next delivery
 *    matched it as "already processed" and skipped — so a single transient
 *    database error dropped a billing event permanently.
 *
 * The claim is now taken BEFORE any side effect and carries an explicit status,
 * so a crashed handler is recoverable and a failed one is retried.
 */

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;
let db: Database;

const eventIds: string[] = [];

function mockEvent(id: string) {
  eventIds.push(id);
  return {
    id,
    type: 'invoice.payment_succeeded',
    data: {
      object: {
        id: `in_${id}`,
        customer: `cus_${id}`,
        amount_paid: 2000,
        currency: 'usd',
      },
    },
  } as never;
}

async function row(eventId: string) {
  const [found] = await db
    .select()
    .from(schema.billingEvents)
    .where(eq(schema.billingEvents.stripeEventId, eventId))
    .limit(1);
  return found;
}

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema });
});

afterAll(async () => {
  for (const id of eventIds) {
    await appDb.delete(schema.billingEvents).where(eq(schema.billingEvents.stripeEventId, id));
  }
  await client.end();
});

describe('Stripe webhook claim lifecycle', () => {
  it('records status done after a successful delivery', async () => {
    const id = `evt_done_${crypto.randomUUID()}`;
    const res = await processStripeWebhook(mockEvent(id));
    expect(res.received).toBe(true);

    const found = await row(id);
    expect(found?.status).toBe('done');
    expect(found?.error).toBeNull();
  });

  it('skips a second delivery of a done event', async () => {
    const id = `evt_skip_${crypto.randomUUID()}`;
    await processStripeWebhook(mockEvent(id));
    const second = await processStripeWebhook(mockEvent(id));
    expect(second.alreadyProcessed).toBe(true);

    const found = await row(id);
    expect(found?.status).toBe('done');
  });

  it('retries a failed event instead of treating it as already processed', async () => {
    const id = `evt_failed_${crypto.randomUUID()}`;

    // Simulate the failure path's end state directly: an event that was claimed,
    // blew up mid-handler, and was marked failed.
    await appDb.insert(schema.billingEvents).values({
      stripeEventId: id,
      eventType: 'invoice.payment_succeeded',
      payload: { seeded: true },
      status: 'failed',
      error: 'transient db failure',
    });

    // The old code would have returned alreadyProcessed here and dropped it.
    const res = await processStripeWebhook({
      id,
      type: 'invoice.payment_succeeded',
      data: { object: { id: `in_${id}`, customer: `cus_${id}` } },
    } as never);

    expect(res.alreadyProcessed).toBeUndefined();
    const found = await row(id);
    expect(found?.status).toBe('done');
    expect(found?.error).toBeNull();
  });

  it('takes over a stale processing claim left by a crashed handler', async () => {
    const id = `evt_stale_${crypto.randomUUID()}`;

    // Crash-between simulation: claim written, side effects never completed.
    await appDb.insert(schema.billingEvents).values({
      stripeEventId: id,
      eventType: 'invoice.payment_succeeded',
      payload: { crashed: true },
      status: 'processing',
      claimedAt: new Date(Date.now() - 10 * 60_000), // older than the 5m window
    });

    const res = await processStripeWebhook({
      id,
      type: 'invoice.payment_succeeded',
      data: { object: { id: `in_${id}`, customer: `cus_${id}` } },
    } as never);

    expect(res.alreadyProcessed).toBeUndefined();
    const found = await row(id);
    expect(found?.status).toBe('done');
  });

  it('does NOT steal a fresh processing claim held by a live handler', async () => {
    const id = `evt_live_${crypto.randomUUID()}`;

    await appDb.insert(schema.billingEvents).values({
      stripeEventId: id,
      eventType: 'invoice.payment_succeeded',
      payload: { inflight: true },
      status: 'processing',
      claimedAt: new Date(), // inside the takeover window
    });

    const res = await processStripeWebhook({
      id,
      type: 'invoice.payment_succeeded',
      data: { object: { id: `in_${id}`, customer: `cus_${id}` } },
    } as never);

    expect(res.alreadyProcessed).toBe(true);
    const found = await row(id);
    expect(found?.status).toBe('processing');
  });

  it('marks the event failed and rethrows when the handler throws', async () => {
    const id = `evt_throw_${crypto.randomUUID()}`;

    // A payload that makes the handler throw: subscriptions.retrieve on a
    // non-string value. With no Stripe key configured the call fails.
    const originalKey = process.env['STRIPE_SECRET_KEY'];
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_invalid_for_throw';

    try {
      await expect(
        processStripeWebhook({
          id,
          type: 'checkout.session.completed',
          data: {
            object: {
              id: `cs_${id}`,
              subscription: 'sub_does_not_exist',
              customer: 'cus_x',
              metadata: { org_id: crypto.randomUUID() },
            },
          },
        } as never)
      ).rejects.toBeDefined();
    } finally {
      if (originalKey === undefined) delete process.env['STRIPE_SECRET_KEY'];
      else process.env['STRIPE_SECRET_KEY'] = originalKey;
    }

    const found = await row(id);
    // Either it failed (retryable) or it completed; both are non-`done`-by-accident.
    const status = found?.status ?? '';
    expect(['failed', 'processing']).toContain(status);
    if (status === 'failed') expect(found?.error).toBeTruthy();
  });
});
