import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { webhooks } from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { eventBus } from '../../lib/event-bus';
import crypto from 'crypto';

export async function listWebhooks(db: Database, organizationId: string) {
  return db.select().from(webhooks).where(eq(webhooks.organizationId, organizationId));
}

export async function createWebhook(db: Database, organizationId: string, input: { url: string; events: string[] }) {
  const secret = crypto.randomBytes(32).toString('hex');
  const [webhook] = await db.insert(webhooks).values({
    organizationId,
    url: input.url,
    events: input.events,
    secret,
  }).returning();
  return webhook;
}

export async function updateWebhook(db: Database, organizationId: string, id: string, input: { url?: string; events?: string[]; isEnabled?: boolean }) {
  const [webhook] = await db
    .update(webhooks)
    .set({ ...input, updatedAt: new Date() })
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

export function setupWebhookDispatcher(db: Database) {
  eventBus.on('internal', async (data: { event: string; payload: any; actorId: string; organizationId: string }) => {
    try {
      const { event, payload, actorId, organizationId } = data;
      
      const orgWebhooks = await db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.organizationId, organizationId), eq(webhooks.isEnabled, true)));

      for (const hook of orgWebhooks) {
        const subscribedEvents = hook.events as string[];
        if (subscribedEvents.includes('*') || subscribedEvents.includes(event)) {
          // Dispatch
          dispatchWebhook(hook.url, hook.secret, { event, payload, actorId, timestamp: new Date().toISOString() });
        }
      }
    } catch (err) {
      console.error('Error in webhook dispatcher:', err);
    }
  });
}

async function dispatchWebhook(url: string, secret: string, data: any) {
  try {
    const payloadString = JSON.stringify(data);
    const signature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

    // Fire and forget
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-boardly-signature': signature,
      },
      body: payloadString,
    }).catch(err => {
      console.error(`[Webhook] Failed to dispatch to ${url}:`, err.message);
    });
    
    console.log(`[Webhook] Dispatched event '${data.event}' to ${url}`);
  } catch (err: any) {
    console.error(`[Webhook] Error preparing dispatch for ${url}:`, err.message);
  }
}
