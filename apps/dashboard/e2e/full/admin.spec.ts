import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers';

test.describe('admin governance flows', () => {
  test('owner: users directory, roles, audit logs render', async ({ page }) => {
    await loginAs(page, 'owner');

    await page.goto('/admin/users');
    // Settle: either the directory grid or a guard wall must resolve first.
    await expect(
      page
        .getByRole('button', { name: /onboard & invite/i })
        .or(page.getByText(/admin access required/i))
    ).toBeVisible({ timeout: 30000 });
    // Directory shows seeded members (owner row is always first).
    await expect(page.getByText('Alex Vance').first()).toBeVisible({ timeout: 15000 });

    await page.goto('/admin/roles');
    await expect(page).not.toHaveURL(/login/, { timeout: 10000 });

    await page.goto('/admin/audit-logs');
    await expect(page).not.toHaveURL(/login/, { timeout: 10000 });
  });

  test('owner: invite modal opens with role selection', async ({ page }) => {
    await loginAs(page, 'owner');
    await page.goto('/admin/users');
    await page.getByRole('button', { name: /onboard & invite/i }).click();
    // Modal offers single + bulk paths (do not submit — read-only check).
    await expect(page.getByText(/single|bulk/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('member: billing page is not admin-reachable via nav', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/admin/billing');
    // Settle first (guard needs the session to resolve under load).
    await expect(
      page
        .getByText(/admin access required/i)
        .or(page.getByRole('button', { name: /onboard & invite/i }))
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/admin access required/i)).toBeVisible({ timeout: 5000 });
  });
});
