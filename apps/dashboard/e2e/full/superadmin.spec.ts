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
});
