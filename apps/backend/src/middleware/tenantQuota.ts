import Elysia from 'elysia';
import type { PlanTier } from '@boardly/shared-types';
import { getDataClient, isRedisAvailable } from '../redis/client';
import { logger } from '../lib/logger';
import { randomUUID } from 'node:crypto';
import { resolveOrgPlanTier } from './auth';

export const PLAN_CONCURRENCY_CAPS: Record<PlanTier, number> = {
  free: 1,
  pro: 3,
  business: 10,
  enterprise: 50,
};

const HOLD_TTL_SECONDS = 300; // 5-minute safety net for crashed pods

/**
 * Atomic Lua script to acquire a concurrency slot in a sorted set (ZSET)
 *
 * KEYS[1]: concurrency key (e.g., "quota:concurrency:reports:org:{orgId}")
 * ARGV[1]: max concurrency limit
 * ARGV[2]: request token/id
 * ARGV[3]: current timestamp (seconds)
 * ARGV[4]: TTL expiration timestamp (now + HOLD_TTL_SECONDS)
 *
 * Returns 1 if slot acquired, 0 if rejected
 */
const ACQUIRE_SEMAPHORE_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local token = ARGV[2]
local now = tonumber(ARGV[3])
local expires = tonumber(ARGV[4])

-- Clean up expired tokens
redis.call("ZREMRANGEBYSCORE", key, "-inf", now)

-- Count active holders
local current = redis.call("ZCARD", key)
if current < limit then
  redis.call("ZADD", key, expires, token)
  redis.call("EXPIRE", key, ${HOLD_TTL_SECONDS})
  return 1
else
  return 0
end
`;

/**
 * Atomic Lua script to release a concurrency slot
 *
 * KEYS[1]: concurrency key
 * ARGV[1]: request token/id
 */
const RELEASE_SEMAPHORE_LUA = `
local key = KEYS[1]
local token = ARGV[1]
redis.call("ZREM", key, token)
return 1
`;

let acquireSha: string | null = null;
let releaseSha: string | null = null;

export const quotaMetrics = {
  quotaRejectedTotal: 0,
};

export async function acquireQuotaSlot(
  endpointClass: string,
  orgId: string,
  tier: PlanTier,
  token: string
): Promise<boolean> {
  const redis = getDataClient();
  if (!redis || !isRedisAvailable()) {
    // Fail-open if Redis is down
    return true;
  }

  const limit = PLAN_CONCURRENCY_CAPS[tier] || PLAN_CONCURRENCY_CAPS.free;
  const key = `quota:concurrency:${endpointClass}:org:${orgId}`;
  const now = Date.now() / 1000;
  const expires = now + HOLD_TTL_SECONDS;

  try {
    if (!acquireSha) {
      const loaded = await redis.script('LOAD', ACQUIRE_SEMAPHORE_LUA);
      acquireSha = String(loaded);
    }

    const sha = acquireSha;
    if (!sha) {
      return true; // fail-open
    }

    let res: number;
    try {
      res = (await redis.evalsha(
        sha,
        1,
        key,
        limit.toString(),
        token,
        now.toString(),
        expires.toString()
      )) as number;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('NOSCRIPT')) {
        const reloaded = String(await redis.script('LOAD', ACQUIRE_SEMAPHORE_LUA));
        acquireSha = reloaded;
        res = (await redis.evalsha(
          reloaded,
          1,
          key,
          limit.toString(),
          token,
          now.toString(),
          expires.toString()
        )) as number;
      } else {
        throw err;
      }
    }

    return res === 1;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMsg, org_id: orgId }, 'Tenant quota evaluation failed — failing open');
    return true;
  }
}

export async function releaseQuotaSlot(
  endpointClass: string,
  orgId: string,
  token: string
): Promise<void> {
  const redis = getDataClient();
  if (!redis || !isRedisAvailable()) return;

  const key = `quota:concurrency:${endpointClass}:org:${orgId}`;

  try {
    if (!releaseSha) {
      const loaded = await redis.script('LOAD', RELEASE_SEMAPHORE_LUA);
      releaseSha = String(loaded);
    }

    const sha = releaseSha;
    if (!sha) return;

    try {
      await redis.evalsha(sha, 1, key, token);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('NOSCRIPT')) {
        const reloaded = String(await redis.script('LOAD', RELEASE_SEMAPHORE_LUA));
        releaseSha = reloaded;
        await redis.evalsha(reloaded, 1, key, token);
      }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: errMsg, org_id: orgId }, 'Tenant quota slot release error');
  }
}

interface TenantQuotaContext {
  user?: { organizationId?: string };
  planTier?: PlanTier;
  quotaSlotToken?: string;
  set: { status?: number | string };
}

interface TenantQuotaReleaseContext {
  user?: { organizationId?: string };
  quotaSlotToken?: string;
}

/**
 * Elysia middleware factory for heavy endpoints concurrency enforcement.
 */
export const tenantQuotaMiddleware = (endpointClass: string) => {
  return new Elysia({ name: `tenantQuota:${endpointClass}` })
    .derive({ as: 'global' }, () => ({
      quotaSlotToken: randomUUID(),
    }))
    .onBeforeHandle(async ({ user, planTier, quotaSlotToken, set }: TenantQuotaContext) => {
      const orgId = user?.organizationId;
      if (!orgId) return undefined;

      const token = quotaSlotToken || randomUUID();
      const tier = planTier || (await resolveOrgPlanTier(orgId));
      const acquired = await acquireQuotaSlot(endpointClass, orgId, tier, token);

      if (!acquired) {
        quotaMetrics.quotaRejectedTotal++;
        set.status = 429;
        return {
          error: 'Concurrency Limit Exceeded',
          message: `Your '${tier}' plan has reached its concurrent limit for '${endpointClass}'. Please wait for ongoing requests to finish.`,
        };
      }
      return undefined;
    })
    .onAfterResponse(async ({ user, quotaSlotToken }: TenantQuotaReleaseContext) => {
      const orgId = user?.organizationId;
      if (!orgId || !quotaSlotToken) return;
      await releaseQuotaSlot(endpointClass, orgId, quotaSlotToken);
    })
    .onError(async ({ user, quotaSlotToken }: TenantQuotaReleaseContext) => {
      const orgId = user?.organizationId;
      if (!orgId || !quotaSlotToken) return;
      await releaseQuotaSlot(endpointClass, orgId, quotaSlotToken);
    });
};
