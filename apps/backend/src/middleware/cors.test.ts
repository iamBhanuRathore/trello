import { describe, it, expect, afterAll } from 'bun:test';
import { isAllowedOrigin, resolveOrigin, applyCorsHeaders } from './cors';
import { env } from '../lib/env';

/**
 * CORS fail-closed contract: only the DASHBOARD_URL allowlist (or the explicit
 * ALLOW_ANY_ORIGIN=1 wildcard) passes. Nothing reflects a fallback origin.
 */
const req = (headers: Record<string, string> = {}) =>
  new Request('http://localhost:3001/v1/boards', { headers });

describe('CORS fail-closed', () => {
  const prevFlag = env.ALLOW_ANY_ORIGIN;

  afterAll(() => {
    (env as { ALLOW_ANY_ORIGIN?: boolean }).ALLOW_ANY_ORIGIN = prevFlag;
  });

  it('allows allowlisted origins and rejects the rest', () => {
    (env as { ALLOW_ANY_ORIGIN?: boolean }).ALLOW_ANY_ORIGIN = false;
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
    expect(isAllowedOrigin('')).toBe(false);
  });

  it('reflects only allowed origins, else empty (fail-closed)', () => {
    (env as { ALLOW_ANY_ORIGIN?: boolean }).ALLOW_ANY_ORIGIN = false;
    expect(resolveOrigin(req({ origin: 'http://localhost:5173' }))).toBe('http://localhost:5173');
    expect(resolveOrigin(req({ origin: 'https://evil.example' }))).toBe('');
    expect(resolveOrigin(req({}))).toBe('');
  });

  it('falls back to an allowed referer origin', () => {
    (env as { ALLOW_ANY_ORIGIN?: boolean }).ALLOW_ANY_ORIGIN = false;
    expect(
      resolveOrigin(req({ origin: 'https://evil.example', referer: 'http://localhost:5173/x' }))
    ).toBe('http://localhost:5173');
    expect(resolveOrigin(req({ referer: 'not a url' }))).toBe('');
  });

  it('ALLOW_ANY_ORIGIN=1 is the only wildcard', () => {
    (env as { ALLOW_ANY_ORIGIN?: boolean }).ALLOW_ANY_ORIGIN = true;
    expect(isAllowedOrigin('https://anything.example')).toBe(true);
    expect(resolveOrigin(req({ origin: 'https://anything.example' }))).toBe(
      'https://anything.example'
    );
  });

  it('applyCorsHeaders never reflects an unlisted origin', () => {
    (env as { ALLOW_ANY_ORIGIN?: boolean }).ALLOW_ANY_ORIGIN = false;
    const headers: Record<string, string> = {};
    applyCorsHeaders(headers, req({ origin: 'https://evil.example' }));
    expect(headers['access-control-allow-origin']).toBe('');
  });
});
