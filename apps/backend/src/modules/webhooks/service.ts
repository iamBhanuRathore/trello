import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { webhooks } from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { eventBus } from '../../lib/event-bus';
import { logger } from '../../lib/logger';
import { assertSafeWebhookUrl } from '../../lib/ssrf';
import crypto from 'crypto';

// Re-exported for existing callers/tests; the guard itself lives in lib/ssrf.
export { assertSafeWebhookUrl };

export async function listWebhooks(db: Database, organizationId: string) {
  return db.select().from(webhooks).where(eq(webhooks.organizationId, organizationId));
}

export async function createWebhook(
  db: Database,
  organizationId: string,
  input: { url: string; events: string[] }
) {
  await assertSafeWebhookUrl(input.url);
  const secret = crypto.randomBytes(32).toString('hex');
  const [webhook] = await db
    .insert(webhooks)
    .values({
      organizationId,
      url: input.url,
      events: input.events,
      secret,
    })
    .returning();
  return webhook;
}

export async function updateWebhook(
  db: Database,
  organizationId: string,
  id: string,
  input: { url?: string; events?: string[]; isEnabled?: boolean }
) {
  if (input.url !== undefined) {
    await assertSafeWebhookUrl(input.url);
  }
  const [webhook] = await db
    .update(webhooks)
    .set({
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.events !== undefined ? { events: input.events } : {}),
      ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(webhooks.id, id), eq(webhooks.organizationId, organizationId)))
    .returning();
  if (!webhook) throw httpError(404, 'Webhook not found');
  return webhook;
}

export async function deleteWebhook(db: Database, organizationId: string, id: string) {
  const [webhook] = await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.organizationId, organizationId)))
    .returning();
  if (!webhook) throw httpError(404, 'Webhook not found');
  return { success: true };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/** Max concurrent outbound deliveries per event (unbounded fan-out wedges the loop). */
const DISPATCH_CONCURRENCY = 5;

export function setupWebhookDispatcher(db: Database) {
  eventBus.on(
    'internal',
    async (data: { event: string; payload: unknown; actorId: string; organizationId: string }) => {
      try {
        const { event, payload, actorId, organizationId } = data;

        const orgWebhooks = await db
          .select()
          .from(webhooks)
          .where(and(eq(webhooks.organizationId, organizationId), eq(webhooks.isEnabled, true)));

        const matched = orgWebhooks.filter((hook) => {
          const subscribedEvents = hook.events as string[];
          return subscribedEvents.includes('*') || subscribedEvents.includes(event);
        });
        let delivered = 0;
        let failed = 0;
        for (let i = 0; i < matched.length; i += DISPATCH_CONCURRENCY) {
          const batch = matched.slice(i, i + DISPATCH_CONCURRENCY);
          const results = await Promise.allSettled(
            batch.map((hook) =>
              dispatchWebhook(hook.url, hook.secret, {
                event,
                payload,
                actorId,
                timestamp: new Date().toISOString(),
              })
            )
          );
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value) delivered++;
            else failed++;
          }
        }
        if (matched.length > 0) {
          logger.info(
            { event, organizationId, matched: matched.length, delivered, failed },
            'Webhook fan-out complete'
          );
        }
      } catch (err) {
        logger.error({ err }, 'Error in webhook dispatcher');
      }
    }
  );
}

async function dispatchWebhook(
  url: string,
  secret: string,
  data: { event: string } & Record<string, unknown>
): Promise<boolean> {
  try {
    // Resolve once up front (DNS can change after registration), then fetch;
    // redirects are re-validated per hop below.
    await assertSafeWebhookUrl(url);
    const payloadString = JSON.stringify(data);
    const signature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

    let target = url;
    for (let hop = 0; hop <= 3; hop++) {
      const res = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-boardly-signature': signature,
        },
        body: payloadString,
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      }).catch((err: unknown) => {
        logger.error({ err, url }, 'Webhook dispatch failed');
        return null;
      });
      if (!res) return false;
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        const next = new URL(location, target).toString();
        try {
          await assertSafeWebhookUrl(next);
        } catch {
          logger.warn({ url: next }, 'Blocked webhook redirect to internal address');
          return false;
        }
        target = next;
        continue;
      }
      logger.info({ url: target, event: data.event }, 'Webhook dispatched');
      return true;
    }
    logger.warn({ url }, 'Webhook dispatch aborted: too many redirects');
    return false;
  } catch (err: unknown) {
    logger.error({ err, url }, 'Webhook dispatch preparation failed');
    return false;
  }
}
