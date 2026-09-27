import { test, expect, type APIRequestContext } from '@playwright/test';
import { loginAs, apiSignIn, authHeaders, API_URL } from '../helpers';

const STAMP = `e2e-${Date.now().toString(36)}`;

async function setupChannel(request: APIRequestContext) {
  const leo = await apiSignIn(request, 'leo.thorne@acme.corp');
  const elena = await apiSignIn(request, 'elena.rostova@acme.corp');
  const res = await request.post(`${API_URL}/chat/channels/group`, {
    headers: authHeaders(leo.accessToken),
    data: { name: `E2E Dialogs ${STAMP}`, memberUserIds: [elena.userId] },
  });
  expect(res.ok(), 'group channel created').toBe(true);
  const channel = await res.json();
  const body = `E2E dialog target ${STAMP}`;
  const msg = await request.post(`${API_URL}/chat/channels/${channel.id}/messages`, {
    headers: authHeaders(leo.accessToken),
    data: { body },
  });
  expect(msg.ok(), 'message sent').toBe(true);
  return { channel, body };
}

test.describe('chat dialogs', () => {
  test('DM modal returns focus to invoker on close', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/chat');
    await expect(page.getByPlaceholder(/search channels/i)).toBeVisible({ timeout: 15000 });
    const dmButton = page.getByTitle(/new direct message/i);
    await dmButton.click();
    await expect(page.getByRole('heading', { name: /new direct message/i })).toBeVisible({
      timeout: 10000,
    });
    // Escape closes; focus must return to the invoking button (not <body>),
    // otherwise the next bare `c` keystroke pops the dialog "by itself".
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: /new direct message/i })).toBeHidden({
      timeout: 5000,
    });
    // Escape closes; focus must return to an invoking control (not <body>),
    // otherwise the next bare `c` keystroke pops the dialog "by itself".
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedTag).toBe('BUTTON');
  });

  test('message context menu: reply + edit via right-click', async ({ page, request }) => {
    const { channel, body } = await setupChannel(request);
    await loginAs(page, 'member');
    await page.goto(`/chat/${channel.id}`);
    // Scope to the feed card: the same text also appears in the sidebar preview.
    const target = page.locator('[id^="msg-"]', { hasText: body }).first();
    await expect(target).toBeVisible({ timeout: 15000 });

    // Right-click opens the Telegram-style menu (not the browser menu).
    await target.click({ button: 'right' });
    const menu = page.getByRole('menu', { name: /message actions/i });
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Reply path sets the reply banner.
    await menu.getByRole('menuitem', { name: /^reply$/i }).click();
    await expect(page.getByText(/replying to/i)).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');

    // Edit path (own message) opens the inline editor.
    await target.click({ button: 'right' });
    await expect(menu).toBeVisible({ timeout: 5000 });
    await menu.getByRole('menuitem', { name: /^edit$/i }).click();
    await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible({
      timeout: 5000,
    });
  });
});
