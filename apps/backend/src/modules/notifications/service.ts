import type { Database } from '../../db';
import {
  notifications,
  notificationPreferences,
  organizationMembers,
  pushDevices,
} from '../../db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { eventBus } from '../../lib/event-bus';

// ─── Service Functions ───────────────────────────────────────────────────────

export async function listNotifications(db: Database, userId: string, organizationId: string) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.organizationId, organizationId)))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function markAsRead(db: Database, notificationId: string, userId: string) {
  return db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .returning();
}

export async function markAllAsRead(db: Database, userId: string, organizationId: string) {
  return db
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
}

export async function getPreferences(db: Database, userId: string, organizationId: string) {
  return db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.organizationId, organizationId)
      )
    );
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
  const results = [];
  for (const pref of preferences) {
    const [updated] = await db
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
      .returning();
    results.push(updated);
  }
  return results;
}

// ─── Event Handling ──────────────────────────────────────────────────────────

export function setupNotificationListeners(db: Database) {
  eventBus.on(
    'internal',
    async (data: { event: string; payload: any; actorId: string; organizationId: string }) => {
      try {
        const { event, payload, actorId, organizationId } = data;

        if (event === 'card.commented' || event === 'card.assigned') {
          const { cardId, commentText } = payload;

          // For card.assigned, only notify the assignee — not the entire org
          let usersToNotify: string[];
          if (event === 'card.assigned') {
            usersToNotify =
              payload.assigneeId && payload.assigneeId !== actorId ? [payload.assigneeId] : [];
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
                  console.log(
                    `[Email Mock] Sending INSTANT email for event '${event}' to user ${userId}.`
                  );
                } else {
                  isDispatched = false; // Queue it because of DND
                }
              }
            } else {
              // Default behavior if no pref: instant, no DND
              isDispatched = true;
              console.log(
                `[Email Mock] Sending INSTANT email (default) for event '${event}' to user ${userId}.`
              );
            }

            notifData.push({
              userId,
              organizationId,
              eventType: event,
              payload: { cardId, commentText, actorId },
              isDispatched,
            });
          }

          if (notifData.length > 0) {
            await db.insert(notifications).values(notifData);
          }
        }
      } catch (err) {
        console.error('Error processing notification event:', err);
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

  return created!;
}

export async function unregisterPushDevice(db: Database, userId: string, token: string) {
  const [deleted] = await db
    .delete(pushDevices)
    .where(and(eq(pushDevices.token, token), eq(pushDevices.userId, userId)))
    .returning();

  return { success: !!deleted };
}

export async function getUserPushDevices(db: Database, userId: string) {
  return await db
    .select()
    .from(pushDevices)
    .where(and(eq(pushDevices.userId, userId), eq(pushDevices.isActive, true)));
}

export async function dispatchPushNotification(
  db: Database,
  userId: string,
  title: string,
  body: string,
  _data?: Record<string, any>
) {
  const devices = await getUserPushDevices(db, userId);
  const results = [];

  for (const dev of devices) {
    // Simulated Expo / FCM push dispatch
    console.log(
      `[Push Notification Dispatch] Sending to ${dev.platform} (${dev.token.substring(0, 15)}...): ${title} - ${body}`
    );
    results.push({
      deviceId: dev.id,
      platform: dev.platform,
      status: 'sent',
    });
  }

  return results;
}
