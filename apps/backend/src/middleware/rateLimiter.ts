import Elysia, { type HTTPHeaders } from 'elysia';
import type { PlanTier } from '@boardly/shared-types';
import { getDataClient, isRedisAvailable } from '../redis/client';
import { logger } from '../lib/logger';
import { resolveOrgPlanTier } from './auth';

export interface RateLimitConfig {
  rps: number;
  burst: number;
}

export const PLAN_RATE_LIMITS: Record<PlanTier, RateLimitConfig> = {
  free: { rps: 10, burst: 20 },
  pro: { rps: 50, burst: 100 },
  business: { rps: 200, burst: 500 },
  enterprise: { rps: 500, burst: 1000 },
};

/**
 * Token Bucket Atomic Lua Script
 *
 * KEYS[1]: bucket key (e.g., "ratelimit:org:{orgId}")
 * ARGV[1]: capacity (burst limit)
 * ARGV[2]: refill rate (tokens per second)
 * ARGV[3]: current timestamp in epoch seconds (with decimals)
 * ARGV[4]: requested tokens (default 1)
 *
 * Returns: { allowed (1 or 0), remaining tokens, reset time in seconds }
 */
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local data = redis.call("HMGET", key, "tokens", "last_update")
local tokens = tonumber(data[1])
local last_update = tonumber(data[2])

if not tokens or not last_update then
  tokens = capacity
  last_update = now
else
  local elapsed = math.max(0, now - last_update)
  tokens = math.min(capacity, tokens + (elapsed * rate))
  last_update = now
end

local allowed = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
end

redis.call("HMSET", key, "tokens", tokens, "last_update", last_update)
redis.call("EXPIRE", key, math.ceil(capacity / rate) * 2)

local reset_seconds = math.ceil((capacity - tokens) / rate)
return { allowed, math.floor(tokens), reset_seconds }
`;

let scriptSha: string | null = null;

// Metric counter for fail-open events (scraped by Prometheus / alert rules)
export const metrics = {
  rateLimiterFailOpenTotal: 0,
  rateLimit429Total: 0,
};

async function executeLuaTokenBucket(
  key: string,
  capacity: number,
  rate: number,
  nowSec: number,
  cost: number = 1
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  const redis = getDataClient();
  if (!redis) {
    throw new Error('Redis data client unavailable');
  }

  // Load script SHA if not cached
  if (!scriptSha) {
    const loadedSha = await redis.script('LOAD', TOKEN_BUCKET_LUA);
    scriptSha = String(loadedSha);
  }

  const currentSha = scriptSha;
  if (!currentSha) {
    throw new Error('Failed to acquire Lua script SHA');
  }

  try {
    const res = (await redis.evalsha(
      currentSha,
      1,
      key,
      capacity.toString(),
      rate.toString(),
      nowSec.toString(),
      cost.toString()
    )) as [number, number, number];

    return {
      allowed: res[0] === 1,
      remaining: res[1],
      reset: res[2],
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // Handle NOSCRIPT when Redis restarts or clears script cache
    if (errMsg.includes('NOSCRIPT')) {
      const reloadedSha = String(await redis.script('LOAD', TOKEN_BUCKET_LUA));
      scriptSha = reloadedSha;
      const res = (await redis.evalsha(
        reloadedSha,
        1,
        key,
        capacity.toString(),
        rate.toString(),
        nowSec.toString(),
        cost.toString()
      )) as [number, number, number];
      return {
        allowed: res[0] === 1,
        remaining: res[1],
        reset: res[2],
      };
    }
    throw err;
  }
}

interface RateLimiterContext {
  user?: { organizationId?: string };
  planTier?: PlanTier;
  set: { status?: number | string; headers?: HTTPHeaders };
}

/**
 * Token-bucket rate limiter middleware.
 * Enforces per-org rate limits after JWT authentication.
 *
 * Fail-Open Policy: If Redis is unavailable or times out (>400ms),
 * the request is allowed through and metric is incremented.
 */
export const rateLimiterMiddleware = () =>
  new Elysia({ name: 'rateLimiter' }).onBeforeHandle(
    async ({ user, planTier, set }: RateLimiterContext) => {
      // If unauthenticated or no org context, allow down to IP limiting at ingress / route auth
      const orgId = user?.organizationId;
      if (!orgId) return undefined;

      const tier: PlanTier = planTier || (await resolveOrgPlanTier(orgId));
      const config = PLAN_RATE_LIMITS[tier] || PLAN_RATE_LIMITS.free;
      const key = `ratelimit:org:${orgId}`;
      const nowSec = Date.now() / 1000;

      if (!isRedisAvailable() || !getDataClient()) {
        // Fail-open
        metrics.rateLimiterFailOpenTotal++;
        logger.warn({ org_id: orgId }, 'Rate limiter fail-open: Redis is unavailable');
        return undefined;
      }

      try {
        // 400ms hard timeout: local Redis answers in ~1ms, remote (Upstash)
        // in ~50-100ms. Failing open on timeout keeps latency bounded.
        const resultPromise = executeLuaTokenBucket(key, config.burst, config.rps, nowSec, 1);
        const timeoutPromise = new Promise<{ timeout: true }>((resolve) =>
          setTimeout(() => resolve({ timeout: true }), 400)
        );

        const outcome = await Promise.race([resultPromise, timeoutPromise]);

        if ('timeout' in outcome) {
          metrics.rateLimiterFailOpenTotal++;
          logger.warn({ org_id: orgId }, 'Rate limiter fail-open: Redis check timed out (>400ms)');
          return undefined;
        }

        if (!set.headers) {
          set.headers = {};
        }

        set.headers['X-RateLimit-Limit'] = config.burst.toString();
        set.headers['X-RateLimit-Remaining'] = Math.max(0, outcome.remaining).toString();
        set.headers['X-RateLimit-Reset'] = outcome.reset.toString();

        if (!outcome.allowed) {
          metrics.rateLimit429Total++;
          set.status = 429;
          set.headers['Retry-After'] = Math.max(1, outcome.reset).toString();
          return {
            error: 'Too Many Requests',
            message: `Rate limit exceeded for tier '${tier}'. Retry after ${Math.max(1, outcome.reset)}s.`,
            retryAfter: Math.max(1, outcome.reset),
          };
        }
      } catch (err: unknown) {
        // Fail-open on any Redis exception
        const errMsg = err instanceof Error ? err.message : String(err);
        metrics.rateLimiterFailOpenTotal++;
        logger.error(
          { err: errMsg, org_id: orgId },
          'Rate limiter evaluation error — failing open'
        );
      }
      return undefined;
    }
  );
