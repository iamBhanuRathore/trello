import { test, expect } from '@playwright/test';
import { loginAs, API_URL } from '../helpers';

/**
 * Workstream C flip gate. The deployed CSP is Report-Only, whose violations
 * the browser logs to the console — that console IS the violations sink
 * (there is deliberately no report-uri endpoint to maintain).
 *
 * Runs against any baseURL: green locally (no CSP headers served by
 * vite) validates the harness; on the deployed URL it gates enforcing.
 * Requires the local API + seed for the authenticated legs.
 */
test('csp report-only flow: login → calendar → chat → billing is clean', async ({
  page,
  request,
}) => {
  let backendUp = false;
  try {
    const res = await request.get(API_URL.replace(/\/v1$/, '/health'), {
      timeout: 5000,
    });
    backendUp = res.ok();
  } catch {
    backendUp = false;
  }
  test.skip(!backendUp, 'requires local backend + seed (bun dev)');

  const cspErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /content security policy/i.test(msg.text())) {
      cspErrors.push(msg.text().slice(0, 300));
    }
  });

  await loginAs(page, 'admin');
  for (const route of ['/', '/calendar', '/chat', '/admin/billing']) {
    await page.goto(route);
    await expect(page.getByRole('main')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
  }
  expect(cspErrors).toEqual([]);
});
