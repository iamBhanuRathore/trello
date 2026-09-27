import type { Database } from '../../db';
import {
  notifications,
  notificationPreferences,
  organizationMembers,
  pushDevices,
} from '../../db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { eventBus } from '../../lib/event-bus';
import { logger } from '../../lib/logger';
import { cachedTTL, invalidateTTL } from '../../lib/cache';

// ─── Service Functions ───────────────────────────────────────────────────────

export async function listNotifications(db: Database, userId: string, organizationId: string) {
  // Inbox poll — short TTL only (writes fan out per comment/assign).
  const { data } = await cachedTTL(`n:${userId}:${organizationId}`, 20, () =>
    db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.organizationId, organizationId))
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50)
  );
  return data;
}

export async function markAsRead(db: Database, notificationId: string, userId: string) {
  const res = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .returning();
  return res;
}

export async function markAllAsRead(db: Database, userId: string, organizationId: string) {
  const res = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.organizationId, organizationId),
        eq(notifications.isRead, false)
      )
    )
    .returning();
  await invalidateTTL(`n:${userId}:${organizationId}`);
  return res;
}

export async function getPreferences(db: Database, userId: string, organizationId: string) {
  const { data } = await cachedTTL(`npref:${userId}:${organizationId}`, 60, () =>
    db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.organizationId, organizationId)
        )
      )
  );
  return data;
}

export async function updatePreferences(
  db: Database,
  userId: string,
  organizationId: string,
  preferences: Array<{
    eventType: string;
    channel: 'in_app' | 'email' | 'push';
    frequency: 'instant' | 'digest_daily' | 'digest_weekly' | 'off';
    quietHoursStart?: number | null;
    quietHoursEnd?: number | null;
  }>
) {
  // Each upsert is independent — run concurrently, preserve input order.
  // (Was sequential N round-trips for N preferences.)
  const results = await Promise.all(
    preferences.map((pref) =>
      db
        .insert(notificationPreferences)
        .values({
          userId,
          organizationId,
          eventType: pref.eventType,
          channel: pref.channel,
          frequency: pref.frequency,
          quietHoursStart: pref.quietHoursStart,
          quietHoursEnd: pref.quietHoursEnd,
        })
        .onConflictDoUpdate({
          target: [
            notificationPreferences.userId,
            notificationPreferences.organizationId,
            notificationPreferences.eventType,
            notificationPreferences.channel,
          ],
          set: {
            frequency: pref.frequency,
            quietHoursStart: pref.quietHoursStart,
            quietHoursEnd: pref.quietHoursEnd,
          },
        })
        .returning()
        .then(([updated]) => updated)
    )
  );
  await invalidateTTL(`npref:${userId}:${organizationId}`);
  return results;
}

// ─── Event Handling ──────────────────────────────────────────────────────────

export function setupNotificationListeners(db: Database) {
  eventBus.on(
    'internal',
    async (data: { event: string; payload: unknown; actorId: string; organizationId: string }) => {
      const { event, actorId, organizationId } = data;
      const payload = data.payload as {
        cardId?: string;
        commentText?: string;
        assigneeId?: string;
      };
      try {
        if (event === 'card.commented' || event === 'card.assigned' || event === 'chat.mentioned') {
          const { cardId, commentText } = payload;

          // For card.assigned, only notify the assignee — not the entire org
          let usersToNotify: string[];
          if (event === 'card.assigned') {
            usersToNotify =
              payload.assigneeId && payload.assigneeId !== actorId ? [payload.assigneeId] : [];
          } else if (event === 'chat.mentioned') {
            // Chat @mentions: only the tagged members — never the author
            const ids = (payload as any).mentionedUserIds;
            usersToNotify = Array.isArray(ids) ? ids.filter((id) => id !== actorId) : [];
          } else {
            // card.commented: notify all org members except actor
            const members = await db
              .select({ userId: organizationMembers.userId })
              .from(organizationMembers)
              .where(eq(organizationMembers.organizationId, organizationId));
            usersToNotify = members.map((m) => m.userId).filter((id) => id !== actorId);
          }

          if (usersToNotify.length === 0) return;

          // Fetch preferences for these users
          const prefs = await db
            .select()
            .from(notificationPreferences)
            .where(
              and(
                inArray(notificationPreferences.userId, usersToNotify),
                eq(notificationPreferences.organizationId, organizationId),
                eq(notificationPreferences.eventType, event)
              )
            );

          const prefMap = new Map();
          for (const p of prefs) {
            prefMap.set(`${p.userId}-${p.channel}`, p);
          }

          const notifData = [];
          const currentHour = new Date().getHours();

          for (const userId of usersToNotify) {
            // Check DND for Email
            const emailPref = prefMap.get(`${userId}-email`);
            let isDispatched = false;
            let suppressInstantEmail = false;

            if (emailPref) {
              if (emailPref.frequency === 'off') {
                suppressInstantEmail = true;
                isDispatched = true; // Technically handled
              } else if (
                emailPref.frequency === 'digest_daily' ||
                emailPref.frequency === 'digest_weekly'
              ) {
                suppressInstantEmail = true;
                isDispatched = false; // Let the cron handle it
              } else if (emailPref.frequency === 'instant') {
                // Check DND
                const start = emailPref.quietHoursStart;
                const end = emailPref.quietHoursEnd;
                if (start !== null && end !== null && start !== undefined && end !== undefined) {
                  // If current time falls in DND window
                  if (start <= end && currentHour >= start && currentHour < end)
                    suppressInstantEmail = true;
                  if (start > end && (currentHour >= start || currentHour < end))
                    suppressInstantEmail = true;
                }
                if (!suppressInstantEmail) {
                  isDispatched = true; // We will send it right now
                  logger.info({ event, userId }, 'Sending instant email');
                } else {
                  isDispatched = false; // Queue it because of DND
                }
              }
            } else {
              // Default behavior if no pref: instant, no DND
              isDispatched = true;
              logger.info({ event, userId }, 'Sending instant email (default prefs)');
            }

            notifData.push({
              userId,
              organizationId,
              eventType: event,
              payload: {
                cardId,
                commentText,
                actorId,
                channelId: (payload as any).channelId,
                messageId: (payload as any).messageId,
                messagePreview: (payload as any).messagePreview,
              },
              isDispatched,
            });
          }

          if (notifData.length > 0) {
            await db.insert(notifications).values(notifData);
          }
        }
      } catch (err) {
        logger.error({ err, event }, 'Error processing notification event');
      }
    }
  );
}

// ─── Mobile Push Devices ─────────────────────────────────────────────────────

export async function registerPushDevice(
  db: Database,
  userId: string,
  organizationId: string,
  input: {
    platform?: string;
    token: string;
    deviceName?: string;
  }
) {
  const [existing] = await db
    .select()
    .from(pushDevices)
    .where(eq(pushDevices.token, input.token))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(pushDevices)
      .set({
        userId,
        organizationId,
        platform: input.platform || existing.platform,
        deviceName: input.deviceName || existing.deviceName,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(pushDevices.id, existing.id))
      .returning();
    await invalidateTTL(`push:${userId}`);
    return updated!;
  }

  const [created] = await db
    .insert(pushDevices)
    .values({
      userId,
      organizationId,
      platform: input.platform || 'ios',
      token: input.token,
      deviceName: input.deviceName || null,
      isActive: true,
    })
    .returning();

  await invalidateTTL(`push:${userId}`);
  return created!;
}

export async function unregisterPushDevice(db: Database, userId: string, token: string) {
  const [deleted] = await db
    .delete(pushDevices)
    .where(and(eq(pushDevices.token, token), eq(pushDevices.userId, userId)))
    .returning();

  await invalidateTTL(`push:${userId}`);
  return { success: !!deleted };
}

export async function getUserPushDevices(db: Database, userId: string) {
  const { data } = await cachedTTL(`push:${userId}`, 60, () =>
    db
      .select()
      .from(pushDevices)
      .where(and(eq(pushDevices.userId, userId), eq(pushDevices.isActive, true)))
  );
  return data;
}

export async function dispatchPushNotification(
  db: Database,
  userId: string,
  title: string,
  body: string,
  _data?: Record<string, unknown>
) {
  const devices = await getUserPushDevices(db, userId);
  const results = [];

  for (const dev of devices) {
    // Simulated Expo / FCM push dispatch
    logger.info(
      { platform: dev.platform, deviceId: dev.id, title, body },
      'Push notification dispatched'
    );
    results.push({
      deviceId: dev.id,
      platform: dev.platform,
      status: 'sent',
    });
  }

  return results;
}
