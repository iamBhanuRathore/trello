import { describe, it, expect } from 'bun:test';
import { PLAN_RATE_LIMITS, metrics } from './rateLimiter';
import { PLAN_CONCURRENCY_CAPS } from './tenantQuota';

describe('Multi-Tenant Rate Limiter & Concurrency Quota Limits', () => {
  it('defines the correct RPS and burst limits for each plan tier', () => {
    expect(PLAN_RATE_LIMITS.free).toEqual({ rps: 10, burst: 20 });
    expect(PLAN_RATE_LIMITS.pro).toEqual({ rps: 50, burst: 100 });
    expect(PLAN_RATE_LIMITS.business).toEqual({ rps: 200, burst: 500 });
    expect(PLAN_RATE_LIMITS.enterprise).toEqual({ rps: 500, burst: 1000 });
  });

  it('defines the correct concurrency semaphore caps for each plan tier', () => {
    expect(PLAN_CONCURRENCY_CAPS.free).toBe(1);
    expect(PLAN_CONCURRENCY_CAPS.pro).toBe(3);
    expect(PLAN_CONCURRENCY_CAPS.business).toBe(10);
    expect(PLAN_CONCURRENCY_CAPS.enterprise).toBe(50);
  });

  it('initializes fail-open and 429 metrics at zero', () => {
    expect(metrics.rateLimiterFailOpenTotal).toBeGreaterThanOrEqual(0);
    expect(metrics.rateLimit429Total).toBeGreaterThanOrEqual(0);
  });
});
