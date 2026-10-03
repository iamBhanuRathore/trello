import { db } from '../../db/index';
import { logger } from '../../lib/logger';
import { notifications, notificationPreferences } from '../../db/schema';
import { eq, and, gt, inArray, asc } from 'drizzle-orm';

/** Rows handled per pass. Bounds the scan and every IN list below. */
const DIGEST_CHUNK_SIZE = 500;
/** Safety valve so a pathological backlog cannot spin forever in one tick. */
const DIGEST_MAX_CHUNKS = 20;

// Simulated cron job that runs every hour (e.g. using node-cron or similar in a real app).
// For the MVP, we just expose a function we can call to mock the cron execution.

export async function processNotificationDigests() {
  logger.info({}, 'Digest cron: starting digest processing');

  let totalDispatched = 0;
  let lastId: string | null = null;

  // Keyset-paginated over the undispatched backlog.
  //
  // This used to select every undispatched row across every tenant in one
  // unbounded statement, then bound two more IN lists (users and orgs) into the
  // preference lookup. A backlog of any size was a memory spike and a very long
  // single tick. Chunking by primary key keeps each pass index-friendly, and the
  // next tick resumes where this one stopped.
  for (let chunk = 0; chunk < DIGEST_MAX_CHUNKS; chunk++) {
    const pendingNotifs = await db
      .select({
        id: notifications.id,
        userId: notifications.userId,
        organizationId: notifications.organizationId,
        eventType: notifications.eventType,
      })
      .from(notifications)
      .where(
        lastId
          ? and(eq(notifications.isDispatched, false), gt(notifications.id, lastId))
          : eq(notifications.isDispatched, false)
      )
      .orderBy(asc(notifications.id))
      .limit(DIGEST_CHUNK_SIZE);

    if (pendingNotifs.length === 0) {
      logger.info({ totalDispatched }, 'Digest cron: no pending notifications');
      return { dispatched: totalDispatched };
    }
    lastId = pendingNotifs[pendingNotifs.length - 1]!.id;

    // 2. Resolve preferences for this chunk only, and only for the users in it.
    // The previous query used `userId IN (...) AND organizationId IN (...)`,
    // whose cartesian product cannot seek the (user, org, event, channel) index.
    // Scoping by user alone is index-backed, and the (user, org) pair is matched
    // in JS below.
    const userIds = [...new Set(pendingNotifs.map((n) => n.userId))];
    const prefs = await db
      .select()
      .from(notificationPreferences)
      .where(inArray(notificationPreferences.userId, userIds));

    // Map preferences for quick lookup: `${userId}-${organizationId}-${eventType}-${channel}`
    const prefMap = new Map<string, (typeof prefs)[number]>();
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
      totalDispatched += toDispatchIds.length;
    }

    // 4. Simulate sending emails
    for (const [userId, count] of Object.entries(emailsToSend)) {
      logger.info({ userId, count }, 'Digest email sent');
    }

    // A short page means the backlog is drained.
    if (pendingNotifs.length < DIGEST_CHUNK_SIZE) {
      logger.info({ totalDispatched }, 'Digest cron: backlog drained');
      return { dispatched: totalDispatched };
    }
  }

  logger.warn({ totalDispatched }, 'Digest cron: chunk budget exhausted, backlog remains');
  return { dispatched: totalDispatched };
}
