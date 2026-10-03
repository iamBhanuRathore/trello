/**
 * In-process token bucket used as the rate limiter's fallback when Redis is
 * unavailable, slow, or erroring.
 *
 * Why this exists: the limiter used to fail *open* in all three of those cases,
 * which meant a Redis outage removed the pre-auth bucket entirely — an
 * unbounded credential-stuffing window on exactly the endpoints the bucket
 * exists to protect (sign-in, sign-up, refresh, SSO, invites).
 *
 * Failing *closed* would be worse: it turns a Redis outage into a total outage.
 * So the fallback keeps enforcing, per instance, with the same numbers the Lua
 * script uses. The accepted tradeoff is that limits are per-pod rather than
 * cluster-wide while Redis is down; an attacker gets N× the budget where N is
 * the instance count, instead of unlimited.
 *
 * Semantics deliberately mirror `TOKEN_BUCKET_LUA` in `middleware/rateLimiter.ts`
 * (lazy refill, floor the remaining count, reset = ceil((capacity - tokens)/rate)).
 */

export interface BucketDecision {
  allowed: boolean;
  remaining: number;
  reset: number;
}

interface Bucket {
  tokens: number;
  lastUpdate: number;
}

export class MemoryTokenBucketStore {
  /** Insertion order doubles as LRU order: re-inserting on touch moves to the end. */
  private buckets = new Map<string, Bucket>();

  /**
   * Hard cap on tracked buckets. Pre-auth keys are derived from the client IP and
   * `clientIp` trusts `x-forwarded-for`, so a spoofed header would otherwise grow
   * this map without limit.
   */
  private readonly maxBuckets: number;

  constructor(maxBuckets = 10_000) {
    this.maxBuckets = maxBuckets;
  }

  get size(): number {
    return this.buckets.size;
  }

  consume(key: string, capacity: number, rate: number, nowSec: number, cost = 1): BucketDecision {
    const existing = this.buckets.get(key);
    let tokens: number;
    let lastUpdate: number;

    if (!existing) {
      tokens = capacity;
      lastUpdate = nowSec;
    } else {
      const elapsed = Math.max(0, nowSec - existing.lastUpdate);
      tokens = Math.min(capacity, existing.tokens + elapsed * rate);
      lastUpdate = nowSec;
    }

    const allowed = tokens >= cost;
    if (allowed) tokens -= cost;

    // Touch for LRU ordering.
    this.buckets.delete(key);
    this.buckets.set(key, { tokens, lastUpdate });
    this.evictOverflow();

    const remaining = Math.floor(tokens);
    const reset = Math.ceil((capacity - tokens) / rate);
    return { allowed, remaining, reset };
  }

  /** Drops buckets idle for longer than the Lua script's EXPIRE window. */
  sweep(nowSec: number, ttlSeconds: number): number {
    let removed = 0;
    for (const [key, bucket] of this.buckets) {
      if (nowSec - bucket.lastUpdate > ttlSeconds) {
        this.buckets.delete(key);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    this.buckets.clear();
  }

  private evictOverflow(): void {
    while (this.buckets.size > this.maxBuckets) {
      // Map iterates in insertion order, so the first key is the least recently
      // used one.
      const oldest = this.buckets.keys().next();
      if (oldest.done) break;
      this.buckets.delete(oldest.value);
    }
  }
}

/** Process-wide store shared by every fallback evaluation. */
export const memoryRateLimiterStore = new MemoryTokenBucketStore();

/** Mirrors `math.ceil(capacity / rate) * 2` from TOKEN_BUCKET_LUA. */
export function bucketTtlSeconds(capacity: number, rate: number): number {
  if (rate <= 0) return 60;
  return Math.max(2, Math.ceil(capacity / rate) * 2);
}
