import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  users,
  userWorkingHours,
  userPresenceOverrides,
  organizationMembers,
} from '../../db/schema/index';
import { getDataClient, isRedisAvailable } from '../../redis/client';
import { eventBus } from '../../lib/event-bus';

/**
 * Presence topics are organization-scoped: `org:presence:{organizationId}`.
 *
 * Previously every socket subscribed to a single global `org:presence` topic and
 * every presence change broadcast to it, so any organization's status and
 * heartbeat fanned out to all tenants. The org id is always resolved from the
 * user's ACTIVE membership server-side — never taken from client input.
 */
export function presenceTopic(organizationId: string): string {
  return `org:presence:${organizationId}`;
}

/** Resolves a user's active organization, or null when they have none. */
export async function resolveUserOrgId(db: Database, userId: string): Promise<string | null> {
  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        isNull(organizationMembers.deletedAt),
        eq(organizationMembers.status, 'active')
      )
    )
    .limit(1);
  return membership?.organizationId ?? null;
}

/**
 * Broadcasts a presence payload to the user's own organization topic only.
 * `organizationId` is carried in the payload so a delivery-side filter can
 * re-check it without another lookup.
 */
async function broadcastPresence(
  db: Database,
  userId: string,
  event: string,
  payload: unknown
): Promise<void> {
  const organizationId = await resolveUserOrgId(db, userId);
  if (!organizationId) return;
  await eventBus.broadcast(presenceTopic(organizationId), event, {
    ...(payload && typeof payload === 'object' ? payload : {}),
    organizationId,
  });
}

export const DEFAULT_WORKING_SCHEDULE = {
  monday: { start: '09:00', end: '18:00', active: true },
  tuesday: { start: '09:00', end: '18:00', active: true },
  wednesday: { start: '09:00', end: '18:00', active: true },
  thursday: { start: '09:00', end: '18:00', active: true },
  friday: { start: '09:00', end: '18:00', active: true },
  saturday: { start: '10:00', end: '14:00', active: false },
  sunday: { start: '10:00', end: '14:00', active: false },
};

/**
 * Intl.DateTimeFormat construction is expensive (~50-100µs each) and this
 * function is called once per user per presence computation. The three
 * formatters depend only on the timezone, so cache them per timezone — the
 * locale is fixed.
 */
const formatterCache = new Map<
  string,
  { local: Intl.DateTimeFormat; day: Intl.DateTimeFormat; time: Intl.DateTimeFormat }
>();

function formattersFor(timezone: string) {
  let cached = formatterCache.get(timezone);
  if (!cached) {
    cached = {
      local: new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      }),
      day: new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }),
      time: new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    };
    formatterCache.set(timezone, cached);
  }
  return cached;
}

export function isWithinWorkingHours(
  schedule: any = DEFAULT_WORKING_SCHEDULE,
  timezone: string = 'UTC',
  date: Date = new Date()
): { isWithin: boolean; localTimeStr: string; currentDay: string; isWorkDay: boolean } {
  try {
    const { local, day, time } = formattersFor(timezone);
    const localTimeStr = local.format(date);
    const currentDay = day.format(date).toLowerCase();

    const parts = time.format(date).split(':');
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

/**
 * Online check for many users at once.
 *
 * `isUserOnline` costs one Redis EXISTS round trip each, and the batch path used
 * to call it per user — a 50-avatar presence panel paid 50 sequential Redis
 * round trips on top of the per-user SQL. One pipelined MGET instead, chunked so
 * a pathological id list cannot build an unbounded command.
 */
export async function areUsersOnline(userIds: string[]): Promise<Set<string>> {
  const online = new Set<string>();
  if (userIds.length === 0) return online;

  const now = Date.now();
  const needRedis: string[] = [];
  for (const id of userIds) {
    const lastActive = onlineUsersMemory.get(id);
    if (lastActive && now - lastActive < 90_000) {
      online.add(id);
    } else {
      needRedis.push(id);
    }
  }
  if (needRedis.length === 0) return online;

  const redis = getDataClient();
  if (!redis || !isRedisAvailable()) return online;

  const CHUNK = 500;
  for (let i = 0; i < needRedis.length; i += CHUNK) {
    const chunk = needRedis.slice(i, i + CHUNK);
    try {
      const values = await redis.mget(chunk.map((id) => `presence:online:${id}`));
      chunk.forEach((id, idx) => {
        if (values[idx] != null) online.add(id);
      });
    } catch {}
  }
  return online;
}

/**
 * Batch presence for a set of users, restricted to one organization.
 *
 * `GET /v1/presence/users?ids=…` previously accepted any user ids and returned
 * their presence — a cross-tenant presence/name oracle. Ids outside the caller's
 * organization are now dropped instead of resolved.
 */
export async function batchGetUsersPresenceScoped(
  db: Database,
  userIds: string[],
  organizationId: string
) {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return [];

  const members = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        inArray(organizationMembers.userId, unique),
        eq(organizationMembers.organizationId, organizationId),
        isNull(organizationMembers.deletedAt),
        eq(organizationMembers.status, 'active')
      )
    );
  const allowed = members.map((m) => m.userId);
  if (allowed.length === 0) return [];

  return batchGetUsersPresence(db, allowed);
}

// ─── Presence Computation ─────────────────────────────────────────────────────

/** One user's rows, prefetched. Lets the batch path share this logic. */
interface PresenceInputs {
  user: { id: string; name: string; avatarUrl: string | null; timezone: string | null };
  override:
    | {
        status: 'available' | 'busy' | 'away' | 'leave' | 'offline';
        customStatusText: string | null;
        expiresAt: Date | null;
      }
    | undefined;
  workingHours: { schedule: any; timezone: string | null } | undefined;
  online: boolean;
}

/** Pure: no I/O. Shared by the single-user and batch paths. */
function buildPresence(userId: string, inputs: PresenceInputs) {
  const timezone = inputs.user.timezone || 'UTC';
  const { override, workingHours, online } = inputs;

  // 1. Manual presence override wins when it has not expired.
  if (override && (!override.expiresAt || new Date(override.expiresAt) > new Date())) {
    const { localTimeStr, isWithin } = isWithinWorkingHours(DEFAULT_WORKING_SCHEDULE, timezone);
    return {
      userId,
      name: inputs.user.name,
      avatarUrl: inputs.user.avatarUrl,
      status: override.status,
      customStatusText: override.customStatusText || null,
      isManualOverride: true,
      timezone,
      localTime: localTimeStr,
      isWithinWorkingHours: isWithin,
    };
  }

  // 2. Working-hours schedule
  const schedule = workingHours?.schedule || DEFAULT_WORKING_SCHEDULE;
  const tz = workingHours?.timezone || timezone;

  const { isWithin, localTimeStr } = isWithinWorkingHours(schedule, tz);

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
    name: inputs.user.name,
    avatarUrl: inputs.user.avatarUrl,
    status,
    customStatusText: statusText,
    isManualOverride: false,
    timezone: tz,
    localTime: localTimeStr,
    isWithinWorkingHours: isWithin,
    schedule,
  };
}

export async function computeUserPresence(db: Database, userId: string) {
  // Three independent single-row reads plus one Redis check — run them together
  // instead of four sequential round trips.
  const [userRows, overrideRows, whRows, online] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
        timezone: users.timezone,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select()
      .from(userPresenceOverrides)
      .where(eq(userPresenceOverrides.userId, userId))
      .limit(1),
    db.select().from(userWorkingHours).where(eq(userWorkingHours.userId, userId)).limit(1),
    isUserOnline(userId),
  ]);

  const u = userRows[0];
  if (!u) return null;

  return buildPresence(userId, {
    user: u,
    override: overrideRows[0],
    workingHours: whRows[0],
    online,
  });
}

export async function batchGetUsersPresence(db: Database, userIds: string[]) {
  if (!userIds || userIds.length === 0) return [];
  const distinct = Array.from(new Set(userIds));

  // This used to be `Promise.all(distinct.map(computeUserPresence))`, i.e. 3
  // serial SQL queries AND one Redis EXISTS per user — 50 users meant 150
  // queries against a five-connection pool. Four batched round trips total.
  const [userRows, overrideRows, whRows, onlineSet] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
        timezone: users.timezone,
      })
      .from(users)
      .where(inArray(users.id, distinct)),
    db.select().from(userPresenceOverrides).where(inArray(userPresenceOverrides.userId, distinct)),
    db.select().from(userWorkingHours).where(inArray(userWorkingHours.userId, distinct)),
    areUsersOnline(distinct),
  ]);

  const overrideByUser = new Map(overrideRows.map((o) => [o.userId, o]));
  const whByUser = new Map(whRows.map((w) => [w.userId, w]));

  return userRows.map((u) =>
    buildPresence(u.id, {
      user: u,
      override: overrideByUser.get(u.id),
      workingHours: whByUser.get(u.id),
      online: onlineSet.has(u.id),
    })
  );
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

  // Broadcast presence update to this user's organization topic only
  await broadcastPresence(db, userId, 'presence:updated', fullPresence);

  return fullPresence;
}

export async function clearUserPresenceOverride(db: Database, userId: string) {
  await db.delete(userPresenceOverrides).where(eq(userPresenceOverrides.userId, userId));
  const fullPresence = await computeUserPresence(db, userId);
  await broadcastPresence(db, userId, 'presence:updated', fullPresence);
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
  await broadcastPresence(db, userId, 'presence:updated', fullPresence);

  return wh;
}
