import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { eventBus } from '../../lib/event-bus';
import { db } from '../../db/index';
import { webhooks, organizations } from '../../db/schema/index';
import { eq } from 'drizzle-orm';
import { createWebhook, setupWebhookDispatcher } from './service';

describe('Webhooks', () => {
  let orgId: string;
  let webhookId: string;
  
  // Create a mock for fetch
  const originalFetch = global.fetch;
  
  beforeEach(async () => {
    // We assume an org exists in the test db, let's insert one or get one
    const [org] = await db.insert(organizations).values({ name: 'Webhook Test Org', slug: 'webhook-test-org-' + Date.now() }).returning();
    orgId = org?.id ?? '';
    
    // Create a webhook
    const hook = await createWebhook(db, orgId, { url: 'https://example.com/webhook', events: ['card.created'] });
    webhookId = hook?.id ?? '';
    
    // Setup dispatcher
    setupWebhookDispatcher(db);
    
    // Mock fetch
    global.fetch = mock(() => Promise.resolve(new Response('OK'))) as any;
  });

  afterEach(async () => {
    // Cleanup
    if (webhookId) await db.delete(webhooks).where(eq(webhooks.id, webhookId));
    if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
    
    // Remove listeners
    eventBus.removeAllListeners('internal');
    
    global.fetch = originalFetch;
  });

  it('should dispatch to matching webhook', async () => {
    // Emit an internal event that matches the webhook
    eventBus.emit('internal', {
      event: 'card.created',
      payload: { cardId: 'test-card-123' },
      actorId: 'test-user',
      organizationId: orgId
    });
    
    // Wait for async dispatcher
    await new Promise(r => setTimeout(r, 100));
    
    expect(global.fetch).toHaveBeenCalled();
    const calls = (global.fetch as any).mock.calls;
    expect(calls[0][0]).toBe('https://example.com/webhook');
    expect(calls[0][1].method).toBe('POST');
    
    // Check signature
    const signature = calls[0][1].headers['x-boardly-signature'];
    expect(signature).toBeDefined();
  });

  it('should not dispatch if event does not match', async () => {
    eventBus.emit('internal', {
      event: 'card.moved',
      payload: { cardId: 'test-card-123' },
      actorId: 'test-user',
      organizationId: orgId
    });
    
    await new Promise(r => setTimeout(r, 100));
    
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
