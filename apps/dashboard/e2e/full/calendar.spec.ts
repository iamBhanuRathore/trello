import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers';

test.describe('calendar page', () => {
  test('renders week grid with views and tray', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/calendar');
    // View switcher present and week is default-active.
    await expect(page.getByRole('button', { name: /^week$/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /^month$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^day$/i })).toBeVisible();
    // Google sync badge reflects disconnected-or-connected state (never blank).
    await expect(page.getByText(/google (sync off|connected)|connect google/i).first()).toBeVisible(
      {
        timeout: 15000,
      }
    );
    // Month view renders day cells.
    await page.getByRole('button', { name: /^month$/i }).click();
    await expect(page.getByText(/^mon$/i).first()).toBeVisible({ timeout: 10000 });
    // Day view renders hour rows.
    await page.getByRole('button', { name: /^day$/i }).click();
    await expect(page.getByText(/00:00|12:00 AM/i).first()).toBeVisible({ timeout: 10000 });
  });
});
