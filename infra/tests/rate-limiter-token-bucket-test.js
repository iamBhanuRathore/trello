import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const rateLimit429Counter = new Counter('rate_limit_429_count');
const successfulRequestsRate = new Rate('success_rate');

export const options = {
  scenarios: {
    free_tier_burst_test: {
      executor: 'constant-arrival-rate',
      rate: 30, // 30 req/s to exceed free tier 10 rps / 20 burst limit
      timeUnit: '1s',
      duration: '15s',
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
  },
  thresholds: {
    rate_limit_429_count: ['count>0'], // Expect 429 rejections under sustained over-limit traffic
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3001';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export default function () {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
    },
  };

  const res = http.get(`${BASE_URL}/v1/boards`, params);

  if (res.status === 429) {
    rateLimit429Counter.add(1);
    check(res, {
      'has Retry-After header': (r) => r.headers['Retry-After'] !== undefined,
      'has rate limit headers': (r) => r.headers['X-Ratelimit-Limit'] !== undefined,
    });
  } else if (res.status === 200 || res.status === 401) {
    successfulRequestsRate.add(1);
  }
}
