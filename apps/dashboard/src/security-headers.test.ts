import { describe, expect, test } from 'bun:test';
import vercelConfig from '../vercel.json';

/**
 * Pins the document-header policy (Workstream C). Vercel serves index.html,
 * so these headers — not Elysia middleware — are what protect the SPA.
 * Any edit here is a security decision: keep the inventory in the comment.
 */
describe('vercel document headers', () => {
  const headers = (
    vercelConfig.headers as { source: string; headers: { key: string; value: string }[] }[]
  )[0].headers;
  const get = (key: string) => headers.find((h) => h.key === key)?.value ?? '';

  test('CSP is Report-Only (enforcing comes only after the flip criterion)', () => {
    expect(headers.some((h) => h.key === 'Content-Security-Policy')).toBe(false);
    expect(get('Content-Security-Policy-Report-Only')).toStartWith("default-src 'self'");
  });

  test('script-src has no unsafe-inline (theme script stays inline only until enforcement)', () => {
    const csp = get('Content-Security-Policy-Report-Only');
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc).not.toContain('unsafe-inline');
  });

  test('connect-src names the API, explicit wss (old Safari), and the translation fetch', () => {
    const csp = get('Content-Security-Policy-Report-Only');
    const connectSrc = csp.split(';').find((d) => d.trim().startsWith('connect-src')) ?? '';
    expect(connectSrc).toContain('https://trello-yq9e.onrender.com');
    expect(connectSrc).toContain('wss://trello-yq9e.onrender.com');
    expect(connectSrc).toContain('https://api.mymemory.translated.net');
  });

  test('no cross-origin allowances for Stripe/WorkOS navigations (CSP cannot govern top-level nav)', () => {
    const csp = get('Content-Security-Policy-Report-Only');
    expect(csp).not.toContain('stripe.com');
    expect(csp).not.toContain('workos.com');
  });

  test('clickjacking + sniffing covered while CSP is report-only', () => {
    expect(get('X-Frame-Options')).toBe('DENY');
    expect(get('X-Content-Type-Options')).toBe('nosniff');
  });

  test('HSTS is short with no preload lock-in during rollout', () => {
    const hsts = get('Strict-Transport-Security');
    expect(hsts).toContain('max-age=86400');
    expect(hsts).not.toContain('preload');
    expect(hsts).not.toContain('includeSubDomains');
  });

  test('COOP is same-origin (login/billing use top-level navigations, not popups)', () => {
    expect(get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });
});
