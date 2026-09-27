import { getDataClient, isRedisAvailable } from '../redis/client';
import { logger } from './logger';

/**
 * Versioned read-through cache for hot GETs (Upstash-friendly).
 *
 * Design constraints (remote Redis + remote Neon):
 * - Reads cost exactly 1 Redis RTT via a Lua fetch (version + payload).
 * - No SCAN/KEYS anywhere: invalidation bumps integer versions.
 * - Correctness comes from bumps (awaited in mutations), TTL (300s) is only
 *   a safety net for missed bumps.
 *
 * Key layout:
 *   bv:{boardId}              board cache version (bumped on any board mutation)
 *   cv:{cardId}               card cache version (bumped on any card mutation)
 *   ov:{orgId}                org tree version (bumped on workspace/project/board mutation)
 *   wv:{workspaceId}          workspace version (bumped on project mutation)
 *   pv:{projectId}            project version (bumped on board mutation)
 *   cb:{cardId}               card -> boardId map (for cross-bumps, TTL 3600)
 *   r:v1:{scope}:{ver}:{rest} cached JSON payload, TTL 300 (or shorter per-call)
 *   perm:{org}:{user}:{perm}  RBAC allow marker '1', TTL 60
 *   u:{userId} / n:{user}:{org} / q:{org}:{hash} / misc TTL-only keys (see below)
 *
 * Tenant-isolation rule: every board/card `rest` MUST start with `{orgId}:`
 * (e.g. `${orgId}:full`). Version keys are bare IDs, so an unprefixed rest
 * would serve one org's payload to another org on a cache hit.
 */

const DATA_PREFIX = 'r:v1';
const SAFETY_TTL_SECONDS = 300;

const FETCH_LUA = `
local v = redis.call("GET", KEYS[1])
if not v then return nil end
return redis.call("GET", ARGV[1] .. v .. ":" .. ARGV[2])
`;

let fetchSha: string | null = null;

async function runFetchLua(
  redis: NonNullable<ReturnType<typeof getDataClient>>,
  verKey: string,
  keyPrefix: string,
  keyRest: string
): Promise<string | null> {
  try {
    if (!fetchSha) {
      fetchSha = String(await redis.script('LOAD', FETCH_LUA));
    }
    const res = (await redis.evalsha(fetchSha, 1, verKey, keyPrefix, keyRest)) as string | null;
    return res ?? null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('NOSCRIPT')) {
      fetchSha = String(await redis.script('LOAD', FETCH_LUA));
      const res = (await redis.evalsha(fetchSha, 1, verKey, keyPrefix, keyRest)) as string | null;
      return res ?? null;
    }
    throw err;
  }
}

function redisOrNull() {
  const redis = getDataClient();
  return isRedisAvailable() && redis ? redis : null;
}

export function boardVersionKey(boardId: string): string {
  return `bv:${boardId}`;
}

export function cardVersionKey(cardId: string): string {
  return `cv:${cardId}`;
}

export function orgVersionKey(orgId: string): string {
  return `ov:${orgId}`;
}

export function workspaceVersionKey(workspaceId: string): string {
  return `wv:${workspaceId}`;
}

export function projectVersionKey(projectId: string): string {
  return `pv:${projectId}`;
}

function dataKey(scopePrefix: string, version: string, rest: string): string {
  return `${DATA_PREFIX}:${scopePrefix}:${version}:${rest}`;
}

/**
 * Read-through cached load scoped to a board version.
 * `rest` must uniquely identify the query (e.g. `lists:{boardId}`).
 */
export async function cachedBoardRead<T>(
  boardId: string,
  rest: string,
  scopePrefix: string,
  loader: () => Promise<T>
): Promise<{ data: T; hit: boolean }> {
  const redis = redisOrNull();
  if (!redis) return { data: await loader(), hit: false };

  const verKey = boardVersionKey(boardId);
  try {
    const raw = await runFetchLua(redis, verKey, `${DATA_PREFIX}:${scopePrefix}`, rest);
    if (raw) return { data: JSON.parse(raw) as T, hit: true };
  } catch (err: unknown) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Cache read failed — falling through to DB'
    );
  }

  const data = await loader();
  try {
    // Reuse the current version so one expired key doesn't invalidate the
    // whole scope; only initialize when the version key is absent.
    let ver = await redis.get(verKey);
    if (!ver) {
      ver = String(await redis.incr(verKey));
      await redis.expire(verKey, SAFETY_TTL_SECONDS * 12);
    }
    await redis.set(
      dataKey(scopePrefix, ver, rest),
      JSON.stringify(data),
      'EX',
      SAFETY_TTL_SECONDS
    );
  } catch {
    // Cache write failure must never break the read path.
  }
  return { data, hit: false };
}

/**
 * Read-through cached load scoped to a card version.
 * `rememberBoardId` wires the card->board map used for cross-bumps.
 */
export async function cachedCardRead<T>(
  cardId: string,
  rest: string,
  scopePrefix: string,
  loader: () => Promise<T>,
  rememberBoardId?: string
): Promise<{ data: T; hit: boolean }> {
  const redis = redisOrNull();
  if (!redis) return { data: await loader(), hit: false };

  const verKey = cardVersionKey(cardId);
  try {
    const raw = await runFetchLua(redis, verKey, `${DATA_PREFIX}:${scopePrefix}`, rest);
    if (raw) return { data: JSON.parse(raw) as T, hit: true };
  } catch (err: unknown) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Cache read failed — falling through to DB'
    );
  }

  const data = await loader();
  try {
    let ver = await redis.get(verKey);
    if (!ver) {
      ver = String(await redis.incr(verKey));
      await redis.expire(verKey, SAFETY_TTL_SECONDS * 12);
    }
    const pipe = redis.pipeline();
    pipe.set(dataKey(scopePrefix, ver, rest), JSON.stringify(data), 'EX', SAFETY_TTL_SECONDS);
    if (rememberBoardId) {
      pipe.set(`cb:${cardId}`, rememberBoardId, 'EX', 3600);
    }
    await pipe.exec();
  } catch {
    // Cache write failure must never break the read path.
  }
  return { data, hit: false };
}

/** Bump a board version (invalidates lists + cards caches for the board). */
export async function bumpBoardCache(boardId: string): Promise<void> {
  const redis = redisOrNull();
  if (!redis) return;
  try {
    await redis.incr(boardVersionKey(boardId));
  } catch {
    // Best-effort; TTL bounds staleness.
  }
}

/** Bump org tree version (invalidates workspaces tree + org-scoped lists). */
export async function bumpOrgCache(orgId: string): Promise<void> {
  const redis = redisOrNull();
  if (!redis) return;
  try {
    await redis.incr(orgVersionKey(orgId));
  } catch {
    // Best-effort; TTL bounds staleness.
  }
}

/** Bump workspace version (invalidates project lists for the workspace). */
export async function bumpWorkspaceCache(workspaceId: string): Promise<void> {
  const redis = redisOrNull();
  if (!redis) return;
  try {
    await redis.incr(workspaceVersionKey(workspaceId));
  } catch {
    // Best-effort; TTL bounds staleness.
  }
}

/** Bump project version (invalidates board lists for the project). */
export async function bumpProjectCache(projectId: string): Promise<void> {
  const redis = redisOrNull();
  if (!redis) return;
  try {
    await redis.incr(projectVersionKey(projectId));
  } catch {
    // Best-effort; TTL bounds staleness.
  }
}

/**
 * Generic versioned read-through cache.
 * Reuses the 1-RTT Lua fetch (version + payload) — no SCAN, Upstash-friendly.
 */
export async function cachedVersionedRead<T>(
  verKey: string,
  rest: string,
  scopePrefix: string,
  loader: () => Promise<T>,
  ttlSeconds: number = SAFETY_TTL_SECONDS
): Promise<{ data: T; hit: boolean }> {
  const redis = redisOrNull();
  if (!redis) return { data: await loader(), hit: false };

  try {
    const raw = await runFetchLua(redis, verKey, `${DATA_PREFIX}:${scopePrefix}`, rest);
    if (raw) return { data: JSON.parse(raw) as T, hit: true };
  } catch (err: unknown) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Cache read failed — falling through to DB'
    );
  }

  const data = await loader();
  try {
    let ver = await redis.get(verKey);
    if (!ver) {
      ver = String(await redis.incr(verKey));
      await redis.expire(verKey, SAFETY_TTL_SECONDS * 12);
    }
    await redis.set(dataKey(scopePrefix, ver, rest), JSON.stringify(data), 'EX', ttlSeconds);
  } catch {
    // Cache write failure must never break the read path.
  }
  return { data, hit: false };
}

/** Versioned read scoped to an org (workspaces tree, org lists). Short TTL keeps free-tier memory bounded. */
export async function cachedOrgRead<T>(
  orgId: string,
  rest: string,
  scopePrefix: string,
  loader: () => Promise<T>,
  ttlSeconds = 60
): Promise<{ data: T; hit: boolean }> {
  return cachedVersionedRead(
    orgVersionKey(orgId),
    `${orgId}:${rest}`,
    scopePrefix,
    loader,
    ttlSeconds
  );
}

/** Versioned read scoped to a workspace (project lists). */
export async function cachedWorkspaceRead<T>(
  workspaceId: string,
  rest: string,
  scopePrefix: string,
  loader: () => Promise<T>,
  ttlSeconds = 60
): Promise<{ data: T; hit: boolean }> {
  return cachedVersionedRead(
    workspaceVersionKey(workspaceId),
    `${workspaceId}:${rest}`,
    scopePrefix,
    loader,
    ttlSeconds
  );
}

/** Versioned read scoped to a project (board lists, project reports). */
export async function cachedProjectRead<T>(
  projectId: string,
  rest: string,
  scopePrefix: string,
  loader: () => Promise<T>,
  ttlSeconds = 120
): Promise<{ data: T; hit: boolean }> {
  return cachedVersionedRead(
    projectVersionKey(projectId),
    `${projectId}:${rest}`,
    scopePrefix,
    loader,
    ttlSeconds
  );
}

// ─── TTL-only cache (no version — for per-user / search / inbox-style reads) ──

export async function cachedTTL<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<{ data: T; hit: boolean }> {
  const redis = redisOrNull();
  if (!redis) return { data: await loader(), hit: false };

  try {
    const raw = await redis.get(key);
    if (raw) return { data: JSON.parse(raw) as T, hit: true };
  } catch {
    // fall through to DB
  }

  const data = await loader();
  try {
    await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
  } catch {
    // Best-effort.
  }
  return { data, hit: false };
}

export async function invalidateTTL(key: string): Promise<void> {
  const redis = redisOrNull();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // Best-effort.
  }
}

export function userCacheKey(userId: string): string {
  return `u:${userId}`;
}

export async function bumpUserCache(userId: string): Promise<void> {
  await invalidateTTL(userCacheKey(userId));
}

/** Bump a card version (invalidates the single-card cache). */
export async function bumpCardCache(cardId: string): Promise<void> {
  const redis = redisOrNull();
  if (!redis) return;
  try {
    await redis.incr(cardVersionKey(cardId));
  } catch {
    // Best-effort; TTL bounds staleness.
  }
}

/**
 * Resolve boardId for a card without a Neon query when the map is warm.
 * Returns null when unknown (caller falls back to DB lookup).
 */
export async function cachedBoardIdForCard(cardId: string): Promise<string | null> {
  const redis = redisOrNull();
  if (!redis) return null;
  try {
    return (await redis.get(`cb:${cardId}`)) ?? null;
  } catch {
    return null;
  }
}

/** Remember card -> board mapping (pipelined by callers where possible). */
export async function rememberCardBoard(cardId: string, boardId: string): Promise<void> {
  const redis = redisOrNull();
  if (!redis) return;
  try {
    await redis.set(`cb:${cardId}`, boardId, 'EX', 3600);
  } catch {
    // Best-effort.
  }
}

/** Remember checklist -> card mapping for bump routing. */
export async function rememberChecklistCard(checklistId: string, cardId: string): Promise<void> {
  const redis = redisOrNull();
  if (!redis) return;
  try {
    await redis.set(`ch:${checklistId}`, cardId, 'EX', 3600);
  } catch {
    // Best-effort.
  }
}

export async function cachedCardIdForChecklist(checklistId: string): Promise<string | null> {
  const redis = redisOrNull();
  if (!redis) return null;
  try {
    return (await redis.get(`ch:${checklistId}`)) ?? null;
  } catch {
    return null;
  }
}

/** Bump both card and board versions for a card mutation. */
export async function bumpCardAndBoard(cardId: string, boardId: string | null): Promise<void> {
  await Promise.all([bumpCardCache(cardId), boardId ? bumpBoardCache(boardId) : Promise.resolve()]);
}

// ─── RBAC allow-marker cache ──────────────────────────────────────────────────

const PERM_TTL_SECONDS = 60;

export function permCacheKey(orgId: string, userId: string, permKey: string): string {
  return `perm:${orgId}:${userId}:${permKey}`;
}

export async function getCachedAllow(
  orgId: string,
  userId: string,
  permKey: string
): Promise<boolean> {
  const redis = redisOrNull();
  if (!redis) return false;
  try {
    return (await redis.get(permCacheKey(orgId, userId, permKey))) === '1';
  } catch {
    return false;
  }
}

/** Cache an allow decision. Denials are intentionally NOT cached. */
export async function setCachedAllow(
  orgId: string,
  userId: string,
  permKey: string
): Promise<void> {
  const redis = redisOrNull();
  if (!redis) return;
  try {
    await redis.set(permCacheKey(orgId, userId, permKey), '1', 'EX', PERM_TTL_SECONDS);
  } catch {
    // Best-effort.
  }
}

/** Drop all cached allows for an org (call after role/permission changes). */
export async function clearOrgPermCache(orgId: string): Promise<void> {
  const redis = redisOrNull();
  if (!redis) return;
  // Version-free exact keys can't be enumerated without SCAN; rely on 60s TTL.
  // This hook exists so role-change call sites have a single place to extend
  // (e.g. per-user DELs) if stricter revocation is ever required.
  logger.debug({ org_id: orgId }, 'perm cache clear requested (TTL-bounded)');
}
