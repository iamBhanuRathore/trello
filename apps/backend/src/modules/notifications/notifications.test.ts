import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { eq, inArray } from 'drizzle-orm';
import { signUp } from '../auth/service';
import { updatePreferences, setupNotificationListeners } from './service';
import { processNotificationDigests } from './digest.cron';
import { eventBus } from '../../lib/event-bus';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Notifications Engine', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let userId: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema });

    const { user, organization } = await signUp(db, {
      name: 'Notif Admin',
      email: 'notif3@example.com',
      password: 'pass',
      orgName: 'Notif Org 3',
      orgSlug: 'notif-org-3',
    });
    orgId = organization.id;
    userId = user.id;

    // Create a second user to trigger notifications
    await signUp(db, {
      name: 'Notif User 4',
      email: 'notif4@example.com',
      password: 'pass',
      orgName: 'Notif Org 4',
      orgSlug: 'notif-org-4',
    });

    // Add notif4 to notif org
    const user2 = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'notif4@example.com'))
      .then((r) => r[0]);

    if (user2) {
      await db.insert(schema.organizationMembers).values({
        userId: user2.id,
        organizationId: orgId,
        role: 'member',
      });
    }

    setupNotificationListeners(db);
  });

  afterAll(async () => {
    await db.delete(schema.notifications).where(eq(schema.notifications.organizationId, orgId));
    await db
      .delete(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.organizationId, orgId));
    await db
      .delete(schema.organizationMembers)
      .where(eq(schema.organizationMembers.organizationId, orgId));
    // signUp seeds a subscription row per org — must go before the org delete.
    await db.delete(schema.subscriptions).where(eq(schema.subscriptions.organizationId, orgId));
    // Chat rows (mention e2e test) reference the org — same ordering rule.
    const chans = await db
      .select({ id: schema.chatChannels.id })
      .from(schema.chatChannels)
      .where(eq(schema.chatChannels.organizationId, orgId));
    const chanIds = chans.map((c) => c.id);
    if (chanIds.length > 0) {
      await db.delete(schema.chatMessages).where(inArray(schema.chatMessages.channelId, chanIds));
      await db
        .delete(schema.chatChannelMembers)
        .where(inArray(schema.chatChannelMembers.channelId, chanIds));
      await db.delete(schema.chatChannels).where(inArray(schema.chatChannels.id, chanIds));
    }
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));

    // Org4
    const org2 = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, 'notif-org-4'))
      .then((r) => r[0]);
    if (org2) {
      await db.delete(schema.subscriptions).where(eq(schema.subscriptions.organizationId, org2.id));
      await db.delete(schema.notifications).where(eq(schema.notifications.organizationId, org2.id));
      await db
        .delete(schema.notificationPreferences)
        .where(eq(schema.notificationPreferences.organizationId, org2.id));
      await db
        .delete(schema.organizationMembers)
        .where(eq(schema.organizationMembers.organizationId, org2.id));
      await db.delete(schema.organizations).where(eq(schema.organizations.id, org2.id));
    }

    await db.delete(schema.refreshTokens);
    await db.delete(schema.users).where(eq(schema.users.email, 'notif3@example.com'));
    await db.delete(schema.users).where(eq(schema.users.email, 'notif4@example.com'));
    await client.end();
  });

  it('should update preferences', async () => {
    const results = await updatePreferences(db, userId, orgId, [
      {
        eventType: 'card.commented',
        channel: 'email',
        frequency: 'digest_daily',
      },
      {
        eventType: 'card.commented',
        channel: 'in_app',
        frequency: 'instant',
      },
    ]);
    expect(results.length).toBe(2);
    expect(results[0]?.frequency).toBe('digest_daily');
  });

  it('should queue digest emails when event is triggered', async () => {
    // Fire event that user4 did something, which should notify user3
    const user2 = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'notif4@example.com'))
      .then((r) => r[0]);

    eventBus.emit('internal', {
      event: 'card.commented',
      payload: { cardId: 'mock-card', commentText: 'Hello' },
      actorId: user2!.id,
      organizationId: orgId,
    });

    // Wait a bit for event to process async
    await new Promise((r) => setTimeout(r, 100));

    // Check if notification was created for userId and isDispatched = false
    const notifs = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId));
    expect(notifs.length).toBe(1);
    expect(notifs[0]?.isDispatched).toBe(false);
  });

  it('should process digest cron correctly', async () => {
    await processNotificationDigests();

    // Notification should now be dispatched
    const notifs = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId));
    expect(notifs[0]?.isDispatched).toBe(true);
  });

  it('should notify only mentioned users on chat.mentioned', async () => {
    const user2 = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'notif4@example.com'))
      .then((r) => r[0]);

    // Actor mentions themselves: nobody should be notified (bogus ids can't
    // occur here — chat.sendMessage intersects tags with channel members).
    eventBus.emit('internal', {
      event: 'chat.mentioned',
      payload: { channelId: 'mock-channel', mentionedUserIds: [user2!.id] },
      actorId: user2!.id,
      organizationId: orgId,
    });
    await new Promise((r) => setTimeout(r, 100));
    const before = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId));

    eventBus.emit('internal', {
      event: 'chat.mentioned',
      payload: {
        channelId: 'mock-channel',
        messagePreview: 'hi @there',
        mentionedUserIds: [userId],
      },
      actorId: user2!.id,
      organizationId: orgId,
    });
    await new Promise((r) => setTimeout(r, 100));

    const after = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId));
    expect(after.length).toBe(before.length + 1);
    expect(after[after.length - 1]?.eventType).toBe('chat.mentioned');
  });

  it('should extract @tags from chat messages end-to-end', async () => {
    const { createDirectMessage, sendMessage } = await import('../chat/service');
    const user2 = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'notif4@example.com'))
      .then((r) => r[0]);

    const before = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId));
    const channel = await createDirectMessage(db, orgId, user2!.id, userId);
    await sendMessage(db, channel.id, user2!.id, {
      body: `hey @[Notif Admin](${userId}), look at this`,
    });
    await new Promise((r) => setTimeout(r, 150));

    const after = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId));
    const fresh = after.filter(
      (n) => !before.some((b) => b.id === n.id) && n.eventType === 'chat.mentioned'
    );
    expect(fresh.length).toBe(1);
    expect((fresh[0] as any).payload.channelId).toBe(channel.id);
  });

  it('should register, list, and unregister push notification devices', async () => {
    const {
      registerPushDevice,
      getUserPushDevices,
      dispatchPushNotification,
      unregisterPushDevice,
    } = await import('./service');
    const token = `expo_push_token_${Date.now()}`;

    // 1. Register device
    const device = await registerPushDevice(db as any, userId, orgId, {
      platform: 'ios',
      token,
      deviceName: "Bhanu's iPhone 16 Pro",
    });

    expect(device.id).toBeDefined();
    expect(device.token).toBe(token);
    expect(device.platform).toBe('ios');

    // 2. Query user devices
    const devices = await getUserPushDevices(db as any, userId);
    expect(devices.some((d) => d.token === token)).toBe(true);

    // 3. Dispatch simulated push
    const dispatchRes = await dispatchPushNotification(
      db as any,
      userId,
      'Task Assigned',
      'You were assigned to #102'
    );
    expect(dispatchRes.length).toBeGreaterThanOrEqual(1);
    expect(dispatchRes[0]!.status).toBe('sent');

    // 4. Unregister device
    const unreg = await unregisterPushDevice(db as any, userId, token);
    expect(unreg.success).toBe(true);

    const devicesAfter = await getUserPushDevices(db as any, userId);
    expect(devicesAfter.some((d) => d.token === token)).toBe(false);
  });
});
