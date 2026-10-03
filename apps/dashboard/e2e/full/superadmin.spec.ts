import { test, expect } from '@playwright/test';

test.describe('super-admin portal', () => {
  test('platform login wall + tenants render', async ({ page }) => {
    await page.goto('http://localhost:5174/login');
    await page.getByPlaceholder(/admin@platform|email/i).fill('alex.vance@acme.corp');
    await page.getByPlaceholder(/••••|password/i).fill('Password123!');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).not.toHaveURL(/login/, { timeout: 20000 });
    await page.goto('http://localhost:5174/tenants');
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 10000 });
  });

  test('primary nav is reachable below md', async ({ page }) => {
    // The sidebar is `hidden md:flex`, so without a drawer the whole console —
    // Tenants / Users / Plans — was unreachable under 768px.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:5174/login');
    await page.getByPlaceholder(/admin@platform|email/i).fill('alex.vance@acme.corp');
    await page.getByPlaceholder(/••••|password/i).fill('Password123!');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).not.toHaveURL(/login/, { timeout: 20000 });

    const visibleNavLinks = page.locator('nav a[href="/tenants"]');
    await expect(visibleNavLinks.first()).toBeHidden();

    await page.getByRole('button', { name: /toggle navigation/i }).click();
    await expect(visibleNavLinks.first()).toBeVisible();

    // Drawer closes on navigation, so it cannot cover the page it navigated to.
    await visibleNavLinks.first().click();
    await expect(page).toHaveURL(/\/tenants$/);
    await expect(visibleNavLinks.first()).toBeHidden();
  });
});
