import { test, expect, type APIRequestContext } from '@playwright/test';
import { loginAs, apiSignIn, authHeaders, API_URL } from '../helpers';

const STAMP = `e2e-${Date.now().toString(36)}`;

async function createDm(request: APIRequestContext, token: string, targetUserId: string) {
  const res = await request.post(`${API_URL}/chat/channels/direct`, {
    headers: authHeaders(token),
    data: { targetUserId },
  });
  expect(res.ok(), 'DM channel created').toBe(true);
  return res.json();
}

async function userIdFor(request: APIRequestContext, email: string): Promise<string> {
  const { userId } = await apiSignIn(request, email);
  return userId;
}

test.describe('team chat across two personas', () => {
  test('DM round-trip Leo -> Elena with reaction', async ({ page, browser, request }) => {
    const leo = await apiSignIn(request, 'leo.thorne@acme.corp');
    const elenaId = await userIdFor(request, 'elena.rostova@acme.corp');
    const dm = await createDm(request, leo.accessToken, elenaId);

    // Leo sends via UI.
    await loginAs(page, 'member');
    await page.goto(`/chat/${dm.id}`);
    const body = `E2E hello ${STAMP}`;
    await page.getByPlaceholder(/message .*enter to send/i).fill(body);
    await page.keyboard.press('Enter');
    await expect(page.getByText(body).first()).toBeVisible({ timeout: 15000 });

    // Elena sees it in an isolated browser context (separate session).
    const elenaCtx = await browser.newContext();
    const elenaPage = await elenaCtx.newPage();
    await elenaPage.goto('/login');
    await elenaPage.getByLabel(/email address/i).fill('elena.rostova@acme.corp');
    await elenaPage.getByLabel(/^password/i).fill('Password123!');
    await elenaPage.getByRole('button', { name: /^sign in$/i }).click();
    await expect(elenaPage).not.toHaveURL(/login/, { timeout: 15000 });
    await elenaPage.goto(`/chat/${dm.id}`);
    await expect(elenaPage.getByText(body).first()).toBeVisible({ timeout: 20000 });
    await elenaCtx.close();
  });

  test('group channel post appears for members', async ({ page, request }) => {
    const leo = await apiSignIn(request, 'leo.thorne@acme.corp');
    const elenaId = await userIdFor(request, 'elena.rostova@acme.corp');
    const res = await request.post(`${API_URL}/chat/channels/group`, {
      headers: authHeaders(leo.accessToken),
      data: { name: `E2E Channel ${STAMP}`, memberUserIds: [elenaId] },
    });
    expect(res.ok(), 'group channel created').toBe(true);
    const channel = await res.json();

    await loginAs(page, 'member');
    await page.goto(`/chat/${channel.id}`);
    const body = `E2E channel note ${STAMP}`;
    await page.getByPlaceholder(/message .*enter to send/i).fill(body);
    await page.keyboard.press('Enter');
    await expect(page.getByText(body).first()).toBeVisible({ timeout: 15000 });
  });
});
