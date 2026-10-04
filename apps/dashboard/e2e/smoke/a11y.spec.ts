import { test, expect, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs, API_URL } from '../helpers';

/**
 * Regression net for Workstream B (button conversions, landmarks, names).
 *
 * - Login specs need no backend and run everywhere (CI included).
 * - Authenticated specs require the local stack (`bun dev`: API on :3001 +
 *   seed) and skip otherwise — an unauthenticated run would scan only Login
 *   and pass vacuously, so the backend check is the fixture, not a nicety.
 */

async function backendUp(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(API_URL.replace(/\/v1$/, '/health'), {
      timeout: 5000,
    });
    return res.ok();
  } catch {
    return false;
  }
}

test.describe('axe: login (no auth required)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`login has no axe violations (${theme})`, async ({ page }) => {
      await page.addInitScript((mode: string) => {
        localStorage.setItem('boardly_theme_mode', mode);
        localStorage.setItem('boardly_theme_palette', 'default');
      }, theme);
      await page.goto('/login');
      await expect(page.getByRole('main')).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

test.describe('axe: authenticated routes', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await backendUp(request)), 'requires local backend + seed (bun dev)');
  });

  test('calendar month grid has no axe violations', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/calendar');
    // Month view renders day cells + task chips (MonthGrid conversions).
    await expect(page.getByText('Mon').first()).toBeVisible({ timeout: 10000 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('chat has no axe violations', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/chat');
    // Auth layouts are React.lazy (perf Workstream A) — wait for the
    // <main> landmark, not just the URL, or axe scans the Loading fallback.
    await expect(page.getByRole('main')).toBeVisible({ timeout: 15000 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('billing has no axe violations', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/billing');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 15000 });
    // Billing content loads past a skeleton — scan the loaded page, not it.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15000 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('user profile trigger has no axe violations and opens the menu', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 15000 });
    // The trigger converted to a real <button> in Workstream B.
    const trigger = page.getByRole('button', { name: /profile menu/i }).first();
    await expect(trigger).toBeVisible({ timeout: 5000 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    // Functional: the converted trigger opens the menu via keyboard.
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 5000 });
  });
});
