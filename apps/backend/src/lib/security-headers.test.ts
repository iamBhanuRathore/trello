import { describe, expect, test } from 'bun:test';
import { applySecurityHeaders, SECURITY_HEADERS } from './security-headers';

/**
 * Workstream C: API responses carry nosniff (document headers live in
 * vercel.json). index.ts wires applySecurityHeaders into its mapResponse
 * hook, which fires for success AND error responses.
 */
describe('applySecurityHeaders', () => {
  test('sets X-Content-Type-Options: nosniff', () => {
    const set: { headers?: unknown } = {};
    applySecurityHeaders(set);
    expect((set.headers as Record<string, string>)['X-Content-Type-Options']).toBe('nosniff');
  });

  test('preserves existing headers (e.g. CORS)', () => {
    const set: { headers?: unknown } = {
      headers: { 'access-control-allow-origin': '*' },
    };
    applySecurityHeaders(set);
    const headers = set.headers as Record<string, string>;
    expect(headers['access-control-allow-origin']).toBe('*');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  test('policy table holds the documented set', () => {
    expect(SECURITY_HEADERS).toEqual({ 'X-Content-Type-Options': 'nosniff' });
  });
});
