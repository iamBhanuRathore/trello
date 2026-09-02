import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const concurrencyRejections = new Counter('concurrency_429_count');

export const options = {
  scenarios: {
    heavy_endpoint_concurrency: {
      executor: 'per-vu-iterations',
      vus: 10, // 10 concurrent requests to an endpoint with free tier concurrency limit 1
      iterations: 5,
      maxDuration: '30s',
    },
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

  // Heavy reporting or bulk-export endpoint
  const res = http.get(`${BASE_URL}/v1/reports/summary`, params);

  if (res.status === 429) {
    concurrencyRejections.add(1);
    check(res, {
      'concurrency 429 returned': (r) => r.status === 429,
    });
  } else {
    check(res, {
      'success or auth status': (r) => r.status === 200 || r.status === 401 || r.status === 404,
    });
  }

  sleep(0.1);
}
