import { eq } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { users, userWorkingHours, userPresenceOverrides } from '../../db/schema/index';
import { getDataClient, isRedisAvailable } from '../../redis/client';
import { eventBus } from '../../lib/event-bus';

export const DEFAULT_WORKING_SCHEDULE = {
  monday: { start: '09:00', end: '18:00', active: true },
  tuesday: { start: '09:00', end: '18:00', active: true },
  wednesday: { start: '09:00', end: '18:00', active: true },
  thursday: { start: '09:00', end: '18:00', active: true },
  friday: { start: '09:00', end: '18:00', active: true },
  saturday: { start: '10:00', end: '14:00', active: false },
  sunday: { start: '10:00', end: '14:00', active: false },
};

export function isWithinWorkingHours(
  schedule: any = DEFAULT_WORKING_SCHEDULE,
  timezone: string = 'UTC',
  date: Date = new Date()
): { isWithin: boolean; localTimeStr: string; currentDay: string; isWorkDay: boolean } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    });
    const localTimeStr = formatter.format(date);

    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
    });
    const currentDay = dayFormatter.format(date).toLowerCase();

    const timeParts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);

    const parts = timeParts.split(':');
    const curHour = Number(parts[0] ?? 0);
    const curMin = Number(parts[1] ?? 0);
    const curMinutes = curHour * 60 + curMin;

    const dayConfig = schedule?.[currentDay];
    if (!dayConfig || !dayConfig.active) {
      return { isWithin: false, localTimeStr, currentDay, isWorkDay: false };
    }

    const [startH, startM] = dayConfig.start.split(':').map(Number);
    const [endH, endM] = dayConfig.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    const isWithin = curMinutes >= startMinutes && curMinutes <= endMinutes;
    return { isWithin, localTimeStr, currentDay, isWorkDay: true };
  } catch {
    return {
      isWithin: true,
      localTimeStr: date.toLocaleTimeString(),
      currentDay: 'monday',
      isWorkDay: true,
    };
  }
}

// ─── Online Socket Heartbeat Tracking ─────────────────────────────────────────

const onlineUsersMemory = new Map<string, number>();

export async function recordUserHeartbeat(userId: string) {
  onlineUsersMemory.set(userId, Date.now());
  const redis = getDataClient();
  if (redis && isRedisAvailable()) {
    try {
      await redis.set(`presence:online:${userId}`, '1', 'EX', 90);
    } catch {}
  }
}

export async function recordUserDisconnect(userId: string) {
  onlineUsersMemory.delete(userId);
  const redis = getDataClient();
  if (redis && isRedisAvailable()) {
    try {
      await redis.del(`presence:online:${userId}`);
    } catch {}
  }
}

export async function isUserOnline(userId: string): Promise<boolean> {
  const lastActive = onlineUsersMemory.get(userId);
  if (lastActive && Date.now() - lastActive < 90_000) {
    return true;
  }
  const redis = getDataClient();
  if (redis && isRedisAvailable()) {
    try {
      const exists = await redis.exists(`presence:online:${userId}`);
      return exists === 1;
    } catch {}
  }
  return false;
}

// ─── Presence Computation ─────────────────────────────────────────────────────

export async function computeUserPresence(db: Database, userId: string) {
  const [u] = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!u) return null;

  const timezone = u.timezone || 'UTC';

  // 1. Check manual presence override
  const [override] = await db
    .select()
    .from(userPresenceOverrides)
    .where(eq(userPresenceOverrides.userId, userId))
    .limit(1);

  if (override) {
    if (!override.expiresAt || new Date(override.expiresAt) > new Date()) {
      const { localTimeStr, isWithin } = isWithinWorkingHours(DEFAULT_WORKING_SCHEDULE, timezone);
      return {
        userId,
        name: u.name,
        avatarUrl: u.avatarUrl,
        status: override.status,
        customStatusText: override.customStatusText || null,
        isManualOverride: true,
        timezone,
        localTime: localTimeStr,
        isWithinWorkingHours: isWithin,
      };
    }
  }

  // 2. Check working hours schedule
  const [wh] = await db
    .select()
    .from(userWorkingHours)
    .where(eq(userWorkingHours.userId, userId))
    .limit(1);

  const schedule = wh?.schedule || DEFAULT_WORKING_SCHEDULE;
  const tz = wh?.timezone || timezone;

  const { isWithin, localTimeStr } = isWithinWorkingHours(schedule, tz);
  const online = await isUserOnline(userId);

  let status: 'available' | 'busy' | 'away' | 'leave' | 'offline' = 'offline';
  let statusText = 'Offline';

  if (online) {
    if (isWithin) {
      status = 'available';
      statusText = 'Available';
    } else {
      status = 'away';
      statusText = 'Away (Outside Working Hours)';
    }
  }

  return {
    userId,
    name: u.name,
    avatarUrl: u.avatarUrl,
    status,
    customStatusText: statusText,
    isManualOverride: false,
    timezone: tz,
    localTime: localTimeStr,
    isWithinWorkingHours: isWithin,
    schedule,
  };
}

export async function batchGetUsersPresence(db: Database, userIds: string[]) {
  if (!userIds || userIds.length === 0) return [];
  const distinct = Array.from(new Set(userIds));

  const results = await Promise.all(distinct.map((uid) => computeUserPresence(db, uid)));
  return results.filter(Boolean);
}

// ─── Presence Overrides & Working Hours Settings ──────────────────────────────

export async function setUserPresenceOverride(
  db: Database,
  userId: string,
  input: {
    status: 'available' | 'busy' | 'away' | 'leave' | 'offline';
    customStatusText?: string | null;
    expiresInMinutes?: number | null;
  }
) {
  let expiresAt: Date | null = null;
  if (input.expiresInMinutes && input.expiresInMinutes > 0) {
    expiresAt = new Date(Date.now() + input.expiresInMinutes * 60 * 1000);
  }

  await db
    .insert(userPresenceOverrides)
    .values({
      userId,
      status: input.status,
      customStatusText: input.customStatusText || null,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: userPresenceOverrides.userId,
      set: {
        status: input.status,
        customStatusText: input.customStatusText || null,
        expiresAt,
        updatedAt: new Date(),
      },
    })
    .returning();

  const fullPresence = await computeUserPresence(db, userId);

  // Broadcast presence update
  await eventBus.broadcast('org:presence', 'presence:updated', fullPresence);

  return fullPresence;
}

export async function clearUserPresenceOverride(db: Database, userId: string) {
  await db.delete(userPresenceOverrides).where(eq(userPresenceOverrides.userId, userId));
  const fullPresence = await computeUserPresence(db, userId);
  await eventBus.broadcast('org:presence', 'presence:updated', fullPresence);
  return fullPresence;
}

export async function getUserWorkingHours(db: Database, userId: string) {
  const [wh] = await db
    .select()
    .from(userWorkingHours)
    .where(eq(userWorkingHours.userId, userId))
    .limit(1);

  const [u] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    timezone: wh?.timezone || u?.timezone || 'UTC',
    schedule: wh?.schedule || DEFAULT_WORKING_SCHEDULE,
  };
}

export async function updateUserWorkingHours(
  db: Database,
  userId: string,
  input: {
    timezone: string;
    schedule: any;
  }
) {
  // Update users table timezone
  await db.update(users).set({ timezone: input.timezone }).where(eq(users.id, userId));

  // Upsert userWorkingHours
  const [wh] = await db
    .insert(userWorkingHours)
    .values({
      userId,
      timezone: input.timezone,
      schedule: input.schedule,
    })
    .onConflictDoUpdate({
      target: userWorkingHours.userId,
      set: {
        timezone: input.timezone,
        schedule: input.schedule,
        updatedAt: new Date(),
      },
    })
    .returning();

  const fullPresence = await computeUserPresence(db, userId);
  await eventBus.broadcast('org:presence', 'presence:updated', fullPresence);

  return wh;
}
