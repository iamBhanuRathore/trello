import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers';

test.describe('command palette navigation', () => {
  test('navbar pill opens the palette (trigger is not a close-only sink)', async ({ page }) => {
    // Regression: routing the dialog through useDialogClose made onOpenChange
    // close-only, which silently killed the Radix/Base-UI trigger — the pill
    // did nothing on click and no suite covered it (specs opened via sidebar).
    await loginAs(page, 'member');
    await page.goto('/');
    await page.getByRole('button', { name: /search boards, cards and commands/i }).click();
    await expect(page.getByPlaceholder(/type a command/i)).toBeVisible({ timeout: 5000 });
  });

  test('clicking a suggestion row navigates and closes the palette', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/');
    await page.getByRole('button', { name: /search boards, cards and commands/i }).click();
    const palette = page.getByPlaceholder(/type a command/i);
    await expect(palette).toBeVisible({ timeout: 5000 });
    await page.getByRole('dialog').getByText('Chat & Teams', { exact: true }).click();
    await expect(page).toHaveURL(/\/chat/, { timeout: 5000 });
    await expect(palette).toBeHidden({ timeout: 5000 });
  });
});
