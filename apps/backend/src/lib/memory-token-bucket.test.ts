import { describe, it, expect, beforeEach } from 'bun:test';
import {
  MemoryTokenBucketStore,
  bucketTtlSeconds,
  memoryRateLimiterStore,
} from './memory-token-bucket';

/**
 * The in-process bucket must behave like TOKEN_BUCKET_LUA, because it is what
 * enforces limits while Redis is down. If it drifts, a Redis outage silently
 * changes the effective rate limit for every user.
 */
describe('MemoryTokenBucketStore', () => {
  let store: MemoryTokenBucketStore;

  beforeEach(() => {
    store = new MemoryTokenBucketStore();
  });

  it('allows a burst up to capacity, then denies', () => {
    const cap = 5;
    const rate = 1;
    for (let i = 0; i < cap; i++) {
      expect(store.consume('k', cap, rate, 100).allowed).toBe(true);
    }
    const denied = store.consume('k', cap, rate, 100);
    expect(denied.allowed).toBe(false);
  });

  it('refills at the configured rate', () => {
    const cap = 2;
    const rate = 2; // 2 per second
    expect(store.consume('k', cap, rate, 0).allowed).toBe(true);
    expect(store.consume('k', cap, rate, 0).allowed).toBe(true);
    expect(store.consume('k', cap, rate, 0).allowed).toBe(false);
    // 0.5s later -> 1 token refilled.
    expect(store.consume('k', cap, rate, 0.5).allowed).toBe(true);
    expect(store.consume('k', cap, rate, 0.5).allowed).toBe(false);
  });

  it('never refills above capacity', () => {
    const cap = 3;
    const rate = 10;
    store.consume('k', cap, rate, 0);
    // Long idle period must not bank more than capacity.
    const after = store.consume('k', cap, rate, 1000);
    expect(after.remaining).toBe(cap - 1);
  });

  it('reports a reset time consistent with the Lua script', () => {
    const cap = 10;
    const rate = 5;
    const decision = store.consume('k', cap, rate, 0);
    // One token spent: 9 remaining -> ceil((10-9)/5) = 1s
    expect(decision.reset).toBe(1);
    expect(decision.remaining).toBe(9);
  });

  it('treats a backwards clock as no elapsed time', () => {
    const cap = 5;
    const rate = 1;
    store.consume('k', cap, rate, 100);
    // Elapsed clamps to 0, so no refill — only this call's token is spent.
    const decision = store.consume('k', cap, rate, 50);
    expect(decision.remaining).toBe(3);
  });

  it('isolates keys from each other', () => {
    store.consume('a', 1, 1, 0);
    expect(store.consume('a', 1, 1, 0).allowed).toBe(false);
    expect(store.consume('b', 1, 1, 0).allowed).toBe(true);
  });

  it('bounds memory when keys are unbounded (spoofed x-forwarded-for)', () => {
    const bounded = new MemoryTokenBucketStore(100);
    for (let i = 0; i < 1000; i++) {
      bounded.consume(`ratelimit:ip:10.0.0.${i % 256}-${i}`, 30, 2, 0);
    }
    expect(bounded.size).toBeLessThanOrEqual(100);
  });

  it('sweeps buckets idle past the TTL', () => {
    store.consume('old', 30, 2, 0);
    expect(store.size).toBe(1);
    const ttl = bucketTtlSeconds(30, 2); // ceil(30/2)*2 = 30
    const removed = store.sweep(0 + ttl + 1, ttl);
    expect(removed).toBe(1);
    expect(store.size).toBe(0);
  });

  it('does not sweep buckets still inside the TTL', () => {
    store.consume('fresh', 30, 2, 100);
    const ttl = bucketTtlSeconds(30, 2);
    expect(store.sweep(100 + ttl - 1, ttl)).toBe(0);
    expect(store.size).toBe(1);
  });

  it('bucketTtlSeconds mirrors the Lua EXPIRE window', () => {
    expect(bucketTtlSeconds(30, 2)).toBe(Math.ceil(30 / 2) * 2);
    expect(bucketTtlSeconds(100, 50)).toBe(Math.ceil(100 / 50) * 2);
    // Guards a division by zero for a zero-rate plan.
    expect(bucketTtlSeconds(10, 0)).toBeGreaterThan(0);
  });

  it('the shared store exposes its size for observability', () => {
    memoryRateLimiterStore.clear();
    memoryRateLimiterStore.consume('ratelimit:ip:1.2.3.4', 30, 2, 0);
    expect(memoryRateLimiterStore.size).toBe(1);
    memoryRateLimiterStore.clear();
  });
});

describe('pre-auth fallback budget', () => {
  it('bounds an unauthenticated flood to the pre-auth burst', () => {
    // Mirrors PRE_AUTH_LIMIT in middleware/rateLimiter.ts.
    const burst = 30;
    const rps = 2;
    const store = new MemoryTokenBucketStore();
    const at = 1000;

    let allowed = 0;
    for (let i = 0; i < 500; i++) {
      if (store.consume('ratelimit:ip:203.0.113.9', burst, rps, at).allowed) allowed++;
    }

    // This is the whole point of the fix: previously a Redis outage allowed all
    // 500 attempts through, i.e. unlimited credential stuffing.
    expect(allowed).toBe(burst);
  });

  it('still permits sustained traffic at the configured rate', () => {
    const burst = 30;
    const rps = 2;
    const store = new MemoryTokenBucketStore();
    let t = 0;
    store.consume('ratelimit:ip:203.0.113.10', burst, rps, t);

    // 60s at 2 rps = 120 more tokens available.
    let allowed = 0;
    for (let i = 0; i < 240; i++) {
      t += 0.25;
      if (store.consume('ratelimit:ip:203.0.113.10', burst, rps, t).allowed) allowed++;
    }
    expect(allowed).toBeGreaterThanOrEqual(110);
  });
});
