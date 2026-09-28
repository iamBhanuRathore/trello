import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers';

test.describe('root error boundary', () => {
  test('a failed route chunk shows the crash fallback, reload recovers', async ({ page }) => {
    await loginAs(page, 'owner');

    // Simulate a torn deploy / failed chunk: the lazy ChatPage import rejects.
    // No test-only hooks in the app — this is the same failure a user hits
    // when the CDN serves a half-published bundle.
    await page.route('**/pages/ChatPage.tsx*', (route) => route.abort());

    await page.goto('/chat');
    await expect(page.getByText('This page crashed').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /reload page/i })).toBeVisible();

    // The app is recoverable without losing the session: serve the chunk
    // again and reload through the fallback's own button.
    await page.unroute('**/pages/ChatPage.tsx*');
    await page.getByRole('button', { name: /reload page/i }).click();
    await expect(page).toHaveURL(/\/chat/, { timeout: 20000 });
    await expect(page.getByText('This page crashed')).toHaveCount(0);
    // Chat workspace is back (empty-state hero or the channel list).
    await expect(page.getByText(/welcome to boardly chat|direct message/i).first()).toBeVisible({
      timeout: 20000,
    });
  });
});
