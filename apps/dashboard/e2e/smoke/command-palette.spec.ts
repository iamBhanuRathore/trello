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

  test('arrow keys move the highlight and Enter follows it', async ({ page }) => {
    // Regression: `data: serverResults = []` minted a fresh array every render
    // while the search query was disabled, so the reset effect keyed on it
    // snapped selectedIndex back to 0 on every render — arrows/hover could
    // never leave the first row.
    await loginAs(page, 'member');
    await page.goto('/');
    await page.getByRole('button', { name: /search boards, cards and commands/i }).click();
    const palette = page.getByPlaceholder(/type a command/i);
    await expect(palette).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(2000); // let gated queries settle

    const highlightedTitle = () =>
      page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        const rows = [...(dlg?.querySelectorAll('div.cursor-pointer') ?? [])];
        const idx = rows.findIndex((r) => (r as HTMLElement).className.includes('bg-primary/10'));
        return rows[idx]?.querySelector('p')?.textContent?.trim() ?? null;
      });

    await expect.poll(highlightedTitle, { timeout: 5000 }).toBe('Workspaces & Overview');
    await page.keyboard.press('ArrowDown');
    await expect.poll(highlightedTitle, { timeout: 5000 }).toBe('Chat & Teams');
    await page.keyboard.press('ArrowDown');
    await expect.poll(highlightedTitle, { timeout: 5000 }).toBe('My Tasks');
    await page.keyboard.press('ArrowUp');
    await expect.poll(highlightedTitle, { timeout: 5000 }).toBe('Chat & Teams');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/chat/, { timeout: 5000 });
    await expect(palette).toBeHidden({ timeout: 5000 });
  });
});
