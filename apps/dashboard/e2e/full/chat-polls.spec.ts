import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers';

// Regression: ChatPage + ChatSidebar + GlobalChatDock used to poll
// ['chat','channels'] on three interleaved intervals while ChatFeed's
// mark-read invalidated the same key per read — requests stacked behind
// each other (5s+ responses, 129 requests in the observed window).
test.describe('chat polling stays bounded', () => {
  test('channels + read volume over ~26s', async ({ page }) => {
    const counts: Record<string, number> = {};
    page.on('request', (r) => {
      const url = r.url();
      if (url.includes('/v1/chat/channels') && !url.includes('/messages') && r.method() === 'GET')
        counts.channels = (counts.channels || 0) + 1;
      if (url.includes('/read') && r.method() === 'POST') counts.read = (counts.read || 0) + 1;
    });
    await loginAs(page, 'admin');
    await page.goto('/chat');
    await expect(page.getByPlaceholder(/search channels/i)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(26000);
    expect(counts.channels || 0).toBeLessThanOrEqual(5);
    expect(counts.read || 0).toBeLessThanOrEqual(2);
  });
});
