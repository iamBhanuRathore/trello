import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { webhooks } from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { eventBus } from '../../lib/event-bus';
import { logger } from '../../lib/logger';
import { env } from '../../lib/env';
import crypto from 'crypto';

/**
 * SSRF guard for outbound webhook delivery.
 * - https only (http loopback allowed in non-production for local dev)
 * - no embedded credentials, no Unix sockets
 * - every resolved A/AAAA must be public unicast (blocks 10/8, 172.16/12,
 *   192.168/16, 127/8, 169.254/16 metadata, ::1, fe80::/10, fc00::/7, …)
 * Enforced at create/update (fast feedback) AND at dispatch (DNS may change).
 */
function isBlockedIPv4(octets: number[]): boolean {
  const [a = 0, b = 0] = octets;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && (b === 0 || b === 88)) ||
    (a === 198 && b === 51 && octets[2] === 100) ||
    (a === 203 && b === 0 && octets[2] === 113) ||
    a >= 224
  );
}

function isBlockedIP(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) → check the embedded v4.
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const v4 = mapped?.[1] ?? ip;
  if (isIP(v4) === 4) {
    const octets = v4.split('.').map(Number);
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true;
    }
    return isBlockedIPv4(octets);
  }
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fe80:') ||
    lower.startsWith('fec0:') ||
    lower.startsWith('fc00:') ||
    lower.startsWith('fd00:') ||
    lower.startsWith('ff') ||
    lower.startsWith('::ffff:0:')
  );
}

export async function assertSafeWebhookUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw httpError(400, 'Invalid webhook URL');
  }
  if (parsed.username || parsed.password) {
    throw httpError(400, 'Webhook URL must not contain credentials');
  }
  const isLoopbackHost =
    parsed.hostname.toLowerCase() === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '[::1]' ||
    parsed.hostname === '::1';
  // Local-dev escape hatch: plain-http loopback only (never in production).
  const allowLoopback = env.NODE_ENV !== 'production' && parsed.protocol === 'http:';
  if (parsed.protocol === 'http:') {
    if (env.NODE_ENV === 'production' || !isLoopbackHost) {
      throw httpError(400, 'Webhook URL must use https');
    }
  } else if (parsed.protocol !== 'https:') {
    throw httpError(400, 'Webhook URL must use https');
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(parsed.hostname, { all: true });
  } catch {
    throw httpError(400, 'Webhook hostname does not resolve');
  }
  const blocked = addresses.some((a) => {
    if (allowLoopback && (a.address === '127.0.0.1' || a.address === '::1')) return false;
    return isBlockedIP(a.address);
  });
  if (addresses.length === 0 || blocked) {
    throw httpError(400, 'Webhook URL resolves to a blocked (private/internal) address');
  }
  return parsed;
}

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

        for (const hook of orgWebhooks) {
          const subscribedEvents = hook.events as string[];
          if (subscribedEvents.includes('*') || subscribedEvents.includes(event)) {
            // Dispatch
            dispatchWebhook(hook.url, hook.secret, {
              event,
              payload,
              actorId,
              timestamp: new Date().toISOString(),
            });
          }
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
) {
  try {
    // Re-validate at send time (DNS can change after registration) and walk
    // redirects manually (max 3) so a 302 can't bounce us to an internal host.
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
      if (!res) return;
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        const next = new URL(location, target).toString();
        try {
          await assertSafeWebhookUrl(next);
        } catch {
          logger.warn({ url: next }, 'Blocked webhook redirect to internal address');
          return;
        }
        target = next;
        continue;
      }
      logger.info({ url: target, event: data.event }, 'Webhook dispatched');
      return;
    }
    logger.warn({ url }, 'Webhook dispatch aborted: too many redirects');
  } catch (err: unknown) {
    logger.error({ err, url }, 'Webhook dispatch preparation failed');
  }
}
