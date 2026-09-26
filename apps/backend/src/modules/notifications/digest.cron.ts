import { db } from '../../db/index';
import { logger } from '../../lib/logger';
import { notifications, notificationPreferences } from '../../db/schema';
import { eq, and, inArray } from 'drizzle-orm';

// Simulated cron job that runs every hour (e.g. using node-cron or similar in a real app).
// For the MVP, we just expose a function we can call to mock the cron execution.

export async function processNotificationDigests() {
  logger.info({}, 'Digest cron: starting digest processing');

  // 1. Find all unsent (undispatched) notifications that are meant for email/push digest
  // In a real app we would join with preferences. For MVP, we'll fetch undispatched and group them.
  const pendingNotifs = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      organizationId: notifications.organizationId,
      eventType: notifications.eventType,
    })
    .from(notifications)
    .where(eq(notifications.isDispatched, false));

  if (pendingNotifs.length === 0) {
    logger.info({}, 'Digest cron: no pending notifications');
    return;
  }

  // 2. We need to check if these pending notifications fall under 'digest_daily' or 'digest_weekly'
  const userIds = [...new Set(pendingNotifs.map((n) => n.userId))];
  const orgIds = [...new Set(pendingNotifs.map((n) => n.organizationId))];

  const prefs = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        inArray(notificationPreferences.userId, userIds),
        inArray(notificationPreferences.organizationId, orgIds)
      )
    );

  // Map preferences for quick lookup: `${userId}-${orgId}-${eventType}-email`
  const prefMap = new Map();
  for (const p of prefs) {
    prefMap.set(`${p.userId}-${p.organizationId}-${p.eventType}-${p.channel}`, p);
  }

  const toDispatchIds: string[] = [];
  const emailsToSend: Record<string, number> = {}; // userId -> count

  for (const n of pendingNotifs) {
    // Check email pref
    const emailPref = prefMap.get(`${n.userId}-${n.organizationId}-${n.eventType}-email`);
    if (emailPref) {
      if (emailPref.frequency === 'digest_daily' || emailPref.frequency === 'digest_weekly') {
        toDispatchIds.push(n.id);
        emailsToSend[n.userId] = (emailsToSend[n.userId] || 0) + 1;
      }
    }
  }

  if (toDispatchIds.length > 0) {
    // 3. Mark them as dispatched
    await db
      .update(notifications)
      .set({ isDispatched: true })
      .where(inArray(notifications.id, toDispatchIds));

    // 4. Simulate sending emails
    for (const [userId, count] of Object.entries(emailsToSend)) {
      logger.info({ userId, count }, 'Digest email sent');
    }
  } else {
    logger.info({}, 'Digest cron: no notifications met dispatch criteria');
  }
}
