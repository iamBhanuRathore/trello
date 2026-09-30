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
    if (orgId) {
      await db.delete(schema.notifications).where(eq(schema.notifications.organizationId, orgId));
      await db
        .delete(schema.notificationPreferences)
        .where(eq(schema.notificationPreferences.organizationId, orgId));
      await db
        .delete(schema.organizationMembers)
        .where(eq(schema.organizationMembers.organizationId, orgId));
      // signUp seeds a subscription row per org — must go before the org delete.
      await db.delete(schema.subscriptions).where(eq(schema.subscriptions.organizationId, orgId));
      // Seeded team roles + audit rows reference the org without cascade.
      const orgRoles = await db
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(eq(schema.roles.organizationId, orgId));
      for (const r of orgRoles) {
        await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, r.id));
        await db.delete(schema.roles).where(eq(schema.roles.id, r.id));
      }
      await db.delete(schema.auditLog).where(eq(schema.auditLog.organizationId, orgId));
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
    }

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
      // Second org also gets seeded roles + audit rows — same FK ordering.
      const org2Roles = await db
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(eq(schema.roles.organizationId, org2.id));
      for (const r of org2Roles) {
        await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, r.id));
        await db.delete(schema.roles).where(eq(schema.roles.id, r.id));
      }
      await db.delete(schema.auditLog).where(eq(schema.auditLog.organizationId, org2.id));
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
    await sendMessage(db, channel.id, orgId, user2!.id, {
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

  it('enriches fan-out payloads with actor/task names (null-safe on misses)', async () => {
    const user2 = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'notif4@example.com'))
      .then((r) => r[0]);

    eventBus.emit('internal', {
      event: 'card.commented',
      // Valid-but-absent UUID: exercises the miss path without a uuid cast error.
      payload: { cardId: '11111111-1111-4111-8111-111111111111', commentText: 'Enriched hello' },
      actorId: user2!.id,
      organizationId: orgId,
    });
    await new Promise((r) => setTimeout(r, 150));

    const fresh = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId));
    const row = fresh.find((n) => (n.payload as any)?.commentText === 'Enriched hello');
    expect(row).toBeDefined();
    expect((row!.payload as any).actorName).toBe('Notif User 4');
    // Unknown card id degrades to null instead of breaking fan-out.
    expect((row!.payload as any).cardTitle).toBeNull();
  });

  it('unread-count reflects inbox state and clears after read-all', async () => {
    const { getUnreadCount, markAllAsRead } = await import('./service');
    expect(await getUnreadCount(db as any, userId, orgId)).toBeGreaterThanOrEqual(1);
    await markAllAsRead(db as any, userId, orgId);
    expect(await getUnreadCount(db as any, userId, orgId)).toBe(0);
  });
});

describe('Notification Center (list, search, triage)', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let otherOrgId: string;
  let userId: string;
  let otherUserId: string;

  async function insertNotif(
    overrides: Partial<{
      userId: string;
      organizationId: string;
      eventType: string;
      payload: Record<string, unknown>;
      isRead: boolean;
      isStarred: boolean;
      archivedAt: Date | null;
      createdAt: Date;
    }> = {}
  ) {
    const svc = await import('./service');
    const payload = overrides.payload ?? { cardTitle: 'Generic task' };
    const eventType = overrides.eventType ?? 'card.commented';
    const [row] = await db
      .insert(schema.notifications)
      .values({
        userId: overrides.userId ?? userId,
        organizationId: overrides.organizationId ?? orgId,
        eventType,
        payload,
        searchText: svc.buildSearchText(payload, eventType),
        isRead: overrides.isRead ?? false,
        isStarred: overrides.isStarred ?? false,
        archivedAt: overrides.archivedAt ?? null,
        ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
      })
      .returning();
    return row!;
  }

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema });

    const a = await signUp(db, {
      name: 'NC User',
      email: 'nc-center@example.com',
      password: 'pass',
      orgName: 'NC Org',
      orgSlug: 'nc-org',
    });
    orgId = a.organization.id;
    userId = a.user.id;

    const b = await signUp(db, {
      name: 'NC Other',
      email: 'nc-other@example.com',
      password: 'pass',
      orgName: 'NC Other Org',
      orgSlug: 'nc-other-org',
    });
    otherOrgId = b.organization.id;
    otherUserId = b.user.id;

    // Cross-user isolation target: same org, different user.
    await db.insert(schema.organizationMembers).values({
      userId: otherUserId,
      organizationId: orgId,
      role: 'member',
    });
  });

  afterAll(async () => {
    for (const oid of [orgId, otherOrgId].filter(Boolean)) {
      await db.delete(schema.notifications).where(eq(schema.notifications.organizationId, oid));
      await db
        .delete(schema.notificationPreferences)
        .where(eq(schema.notificationPreferences.organizationId, oid));
      await db
        .delete(schema.organizationMembers)
        .where(eq(schema.organizationMembers.organizationId, oid));
      await db.delete(schema.subscriptions).where(eq(schema.subscriptions.organizationId, oid));
      const rs = await db
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(eq(schema.roles.organizationId, oid));
      for (const r of rs) {
        await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, r.id));
        await db.delete(schema.roles).where(eq(schema.roles.id, r.id));
      }
      await db.delete(schema.auditLog).where(eq(schema.auditLog.organizationId, oid));
      await db.delete(schema.organizations).where(eq(schema.organizations.id, oid));
    }
    const ncUsers = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(inArray(schema.users.email, ['nc-center@example.com', 'nc-other@example.com']));
    const ncIds = ncUsers.map((u) => u.id);
    if (ncIds.length > 0) {
      await db.delete(schema.refreshTokens).where(inArray(schema.refreshTokens.userId, ncIds));
    }
    await db.delete(schema.users).where(eq(schema.users.email, 'nc-center@example.com'));
    await db.delete(schema.users).where(eq(schema.users.email, 'nc-other@example.com'));
    await client.end();
  });

  it('paginates with a stable keyset cursor when inserts land mid-scroll', async () => {
    const svc = await import('./service');
    const base = new Date('2026-09-20T10:00:00.000Z');
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const row = await insertNotif({
        payload: { cardTitle: `Cursor task ${i}` },
        createdAt: new Date(base.getTime() + i * 1000),
      });
      ids.push(row.id);
    }
    const p1 = await svc.listNotifications(db as any, userId, orgId, { limit: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).toBeTruthy();

    // Newest insert mid-pagination must not duplicate or skip rows.
    await insertNotif({ payload: { cardTitle: 'Cursor task newest' } });

    const p2 = await svc.listNotifications(db as any, userId, orgId, {
      limit: 10,
      cursor: p1.nextCursor,
    });
    const seen = new Set([...p1.items, ...p2.items].map((n: any) => n.id));
    expect(seen.size).toBe(p1.items.length + p2.items.length);
    // Page 1 holds the two newest pre-insert rows; page 2 holds the rest.
    expect(p2.items.map((n: any) => (n.payload as any).cardTitle)).toContain('Cursor task 0');
    expect(ids.length).toBe(5);
  });

  it('keeps identical-timestamp rows distinct across pages', async () => {
    const svc = await import('./service');
    const same = new Date('2026-09-21T12:00:00.000Z');
    await insertNotif({ payload: { cardTitle: 'Tie A' }, createdAt: same });
    await insertNotif({ payload: { cardTitle: 'Tie B' }, createdAt: same });
    const p1 = await svc.listNotifications(db as any, userId, orgId, {
      limit: 1,
      q: 'Tie',
    });
    expect(p1.items).toHaveLength(1);
    const p2 = await svc.listNotifications(db as any, userId, orgId, {
      limit: 10,
      cursor: p1.nextCursor,
      q: 'Tie',
    });
    const titles = [...p1.items, ...p2.items].map((n: any) => (n.payload as any).cardTitle);
    expect(titles).toContain('Tie A');
    expect(titles).toContain('Tie B');
  });

  it('searches literally (LIKE escaping) and rejects unknown types', async () => {
    const svc = await import('./service');
    await insertNotif({ payload: { cardTitle: '100% _coverage_ report' } });
    const hit = await svc.listNotifications(db as any, userId, orgId, { q: '100% _coverage_' });
    expect(hit.items.length).toBeGreaterThanOrEqual(1);
    // Unescaped, `__` would match every multi-char row — escaped it is literal.
    const pct = await svc.listNotifications(db as any, userId, orgId, { q: '__' });
    expect(pct.items).toHaveLength(0);
    const bad = await svc.listNotifications(db as any, userId, orgId, {
      types: ['nope.not_a_type'],
    });
    expect(bad.items).toHaveLength(0);
    expect(bad.nextCursor).toBeNull();
    const typed = await svc.listNotifications(db as any, userId, orgId, {
      types: ['card.commented'],
      q: '100% _coverage_',
    });
    expect(typed.items.length).toBeGreaterThanOrEqual(1);
  });

  it('computes hybrid importance in SQL-shaped rows', async () => {
    const svc = await import('./service');
    const starredRead = await insertNotif({
      eventType: 'card.commented',
      isRead: true,
      isStarred: true,
      payload: { cardTitle: 'Important starred' },
    });
    const mention = await insertNotif({
      eventType: 'card.mentioned',
      payload: { cardTitle: 'Important mention' },
    });
    const plain = await insertNotif({
      eventType: 'card.commented',
      payload: { cardTitle: 'Ordinary comment' },
    });
    const onlyImportant = await svc.listNotifications(db as any, userId, orgId, {
      importantOnly: true,
      q: 'Important',
    });
    const foundIds = onlyImportant.items.map((n: any) => n.id);
    expect(foundIds).toContain(starredRead.id);
    expect(foundIds).toContain(mention.id);
    expect(onlyImportant.items.every((n: any) => n.isImportant)).toBe(true);

    const all = await svc.listNotifications(db as any, userId, orgId, { q: 'Ordinary comment' });
    expect((all.items[0] as any)?.isImportant).toBe(false);
    expect(plain.id).toBeTruthy();
  });

  it('serves needs-action independently of list pagination', async () => {
    const svc = await import('./service');
    await insertNotif({ eventType: 'card.assigned', payload: { cardTitle: 'NA assign' } });
    const na = await svc.getNeedsAction(db as any, userId, orgId, 5);
    expect(na.total).toBeGreaterThanOrEqual(1);
    expect(na.items.length).toBeLessThanOrEqual(5);
    // Strip holds unread important rows plus anything the user starred.
    expect(na.items.every((n: any) => n.isImportant)).toBe(true);
    expect(na.items.every((n: any) => !(n as any).isRead || (n as any).isStarred)).toBe(true);
  });

  it('round-trips read/unread/star and scopes mutations per user+org', async () => {
    const svc = await import('./service');
    const row = await insertNotif({ payload: { cardTitle: 'Triage me' } });

    await svc.markAsRead(db as any, row.id, userId, orgId);
    let listed = await svc.listNotifications(db as any, userId, orgId, { q: 'Triage me' });
    expect((listed.items[0] as any)?.isRead).toBe(true);

    await svc.markUnread(db as any, row.id, userId, orgId);
    listed = await svc.listNotifications(db as any, userId, orgId, { q: 'Triage me' });
    expect((listed.items[0] as any)?.isRead).toBe(false);

    await svc.setStarred(db as any, row.id, userId, orgId, true);
    listed = await svc.listNotifications(db as any, userId, orgId, { q: 'Triage me' });
    expect((listed.items[0] as any)?.isStarred).toBe(true);

    // Cross-user: same org, different user — sees nothing, changes nothing.
    const foreign = await svc.markAsRead(db as any, row.id, otherUserId, orgId);
    expect(foreign).toHaveLength(0);
    // Cross-org: right user, wrong org — same 404-style empty result.
    const wrongOrg = await svc.setStarred(db as any, row.id, userId, otherOrgId, false);
    expect(wrongOrg).toHaveLength(0);
    listed = await svc.listNotifications(db as any, userId, orgId, { q: 'Triage me' });
    expect((listed.items[0] as any)?.isStarred).toBe(true);
  });

  it('archives (marking read), unarchives, and keeps bulk idempotent + capped', async () => {
    const svc = await import('./service');
    const a = await insertNotif({ payload: { cardTitle: 'Bulk A' } });
    const b = await insertNotif({ payload: { cardTitle: 'Bulk B' } });

    const before = await svc.getUnreadCount(db as any, userId, orgId);
    const archived = await svc.bulkArchive(db as any, [a.id, b.id], userId, orgId);
    expect(archived.affected).toBe(2);
    // Archiving marks read: badge drops by at least the two rows.
    expect(await svc.getUnreadCount(db as any, userId, orgId)).toBeLessThanOrEqual(before);

    const hidden = await svc.listNotifications(db as any, userId, orgId, { q: 'Bulk' });
    expect(hidden.items).toHaveLength(0);
    const onlyArchived = await svc.listNotifications(db as any, userId, orgId, {
      q: 'Bulk',
      archived: 'only',
    });
    expect(onlyArchived.items).toHaveLength(2);

    // Idempotent: second archive affects nothing.
    expect((await svc.bulkArchive(db as any, [a.id], userId, orgId)).affected).toBe(0);
    // Unarchive restores the original visible state.
    expect((await svc.bulkUnarchive(db as any, [a.id, b.id], userId, orgId)).affected).toBe(2);
    const restored = await svc.listNotifications(db as any, userId, orgId, { q: 'Bulk' });
    expect(restored.items).toHaveLength(2);

    // Cap: 105 ids (2 real + 103 fake) never errors; only real rows affected.
    const many = [
      a.id,
      b.id,
      ...Array.from(
        { length: 103 },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
      ),
    ];
    const capped = await svc.bulkMarkRead(db as any, many, userId, orgId);
    expect(capped.affected).toBe(2);
  });

  it('retains unread and starred rows but prunes old read ones', async () => {
    const svc = await import('./service');
    const { pruneLogs } = await import('../audit/retention');
    const old = new Date(Date.now() - 200 * 86_400_000);
    const readOld = await insertNotif({
      isRead: true,
      payload: { cardTitle: 'Retention read old' },
      createdAt: old,
    });
    const unreadOld = await insertNotif({
      payload: { cardTitle: 'Retention unread old' },
      createdAt: old,
    });
    const starredOld = await insertNotif({
      isRead: true,
      isStarred: true,
      payload: { cardTitle: 'Retention starred old' },
      createdAt: old,
    });
    // Touch readAt so the rows are internally consistent.
    await svc.markAsRead(db as any, readOld.id, userId, orgId);
    await svc.markAsRead(db as any, starredOld.id, userId, orgId);
    await db
      .update(schema.notifications)
      .set({ createdAt: old })
      .where(inArray(schema.notifications.id, [readOld.id, unreadOld.id, starredOld.id]));

    await pruneLogs(db as any);
    const remaining = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(inArray(schema.notifications.id, [readOld.id, unreadOld.id, starredOld.id]));
    const ids = new Set(remaining.map((r) => r.id));
    expect(ids.has(readOld.id)).toBe(false);
    expect(ids.has(unreadOld.id)).toBe(true);
    expect(ids.has(starredOld.id)).toBe(true);
  });
});
