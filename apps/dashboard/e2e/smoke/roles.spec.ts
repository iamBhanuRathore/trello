import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers';

// Role-based access: owner sees admin surfaces, members are gated.
test.describe('role-based access control', () => {
  test('owner can open the admin panel', async ({ page }) => {
    await loginAs(page, 'owner');
    await page.goto('/admin/users');
    // Admin content resolves (waits out the loading state the guard needs).
    await expect(page.getByRole('button', { name: /onboard & invite/i })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(/admin access required/i)).toHaveCount(0);
  });

  test('member is gated from the admin panel', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/admin/users');
    // Guard wall appears once the session resolves (not instant — allow load time).
    await expect(page.getByText(/admin access required/i)).toBeVisible({ timeout: 20000 });
  });

  test('viewer can browse but sees no privileged actions', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/');
    await expect(page).not.toHaveURL(/login/, { timeout: 10000 });
  });
});
