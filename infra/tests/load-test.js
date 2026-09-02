import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const orgALatency = new Trend('org_a_heavy_latency');
const orgBLatency = new Trend('org_b_normal_latency');

export const options = {
  scenarios: {
    // Org A hammers API at high rate (10x)
    org_a_noisy_neighbor: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 20,
      maxVUs: 50,
      exec: 'testOrgA',
    },
    // Org B maintains steady normal rate (1x)
    org_b_isolated_tenant: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 5,
      maxVUs: 20,
      exec: 'testOrgB',
    },
  },
  thresholds: {
    org_b_normal_latency: ['p(95)<300'], // Org B latency should stay low despite Org A flooding
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3001';
const ORG_A_TOKEN = __ENV.ORG_A_TOKEN || '';
const ORG_B_TOKEN = __ENV.ORG_B_TOKEN || '';

export function testOrgA() {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      ...(ORG_A_TOKEN ? { Authorization: `Bearer ${ORG_A_TOKEN}` } : {}),
    },
  };

  const start = Date.now();
  const res = http.get(`${BASE_URL}/v1/boards`, params);
  orgALatency.add(Date.now() - start);

  check(res, {
    'org A handled (200, 401, or 429)': (r) => [200, 401, 429].includes(r.status),
  });
}

export function testOrgB() {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      ...(ORG_B_TOKEN ? { Authorization: `Bearer ${ORG_B_TOKEN}` } : {}),
    },
  };

  const start = Date.now();
  const res = http.get(`${BASE_URL}/v1/boards`, params);
  orgBLatency.add(Date.now() - start);

  check(res, {
    'org B succeeds without noisy neighbor interference': (r) => [200, 401].includes(r.status),
  });
}
