import { test, expect, type APIRequestContext } from '@playwright/test';
import { loginAs, apiSignIn, authHeaders, API_URL } from '../helpers';

const STAMP = `e2e-${Date.now().toString(36)}`;
const WS_NAME = `E2E Workspace ${STAMP}`;
const PROJECT_NAME = `E2E Project ${STAMP}`;
const BOARD_NAME = `E2E Board ${STAMP}`;
const CARD_TITLE = `E2E card ${STAMP}`;

async function apiDeleteWorkspace(request: APIRequestContext, token: string, wsId: string) {
  await request.delete(`${API_URL}/workspaces/${wsId}`, { headers: authHeaders(token) });
}

test.describe('core board loop (isolated E2E workspace)', () => {
  let wsId = '';
  let ownerToken = '';

  test.beforeAll(async ({ request }) => {
    ({ accessToken: ownerToken } = await apiSignIn(request, 'alex.vance@acme.corp'));
  });

  test.afterAll(async ({ request }) => {
    if (wsId) await apiDeleteWorkspace(request, ownerToken, wsId).catch(() => {});
  });

  test('create workspace → project → board → card → comment', async ({ page, request }) => {
    await loginAs(page, 'owner');

    // Workspace
    const wsResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/workspaces') && res.request().method() === 'POST',
      { timeout: 15000 }
    );
    await page
      .getByRole('button', { name: /create workspace/i })
      .first()
      .click();
    const wsDialog = page.getByRole('dialog', { name: /create workspace/i });
    await wsDialog.getByPlaceholder(/engineering, product/i).fill(WS_NAME);
    await wsDialog.getByRole('button', { name: /^create( workspace)?$/i }).click();
    const wsResponse = await wsResponsePromise;
    expect(wsResponse.ok(), 'workspace POST succeeds').toBe(true);
    await expect(page.getByText(WS_NAME).first()).toBeVisible({ timeout: 15000 });

    // Resolve the workspace id via API for teardown.
    const wsList = await request.get(`${API_URL}/workspaces`, { headers: authHeaders(ownerToken) });
    const workspaces = await wsList.json();
    wsId = (Array.isArray(workspaces) ? workspaces : workspaces.workspaces || []).find((w: any) =>
      (w.name || '').includes(STAMP)
    )?.id;
    expect(wsId, 'created workspace resolvable via API').toBeTruthy();

    // Project + board + list via API (deterministic setup; the UI
    // interactions under test are card create/open/comment below).
    const projRes = await request.post(`${API_URL}/projects`, {
      headers: authHeaders(ownerToken),
      data: { workspaceId: wsId, name: PROJECT_NAME },
    });
    expect(projRes.ok(), 'project created via API').toBe(true);
    const project = await projRes.json();

    const boardRes = await request.post(`${API_URL}/boards`, {
      headers: authHeaders(ownerToken),
      data: { projectId: project.id, name: BOARD_NAME },
    });
    expect(boardRes.ok(), 'board created via API').toBe(true);
    const board = await boardRes.json();

    const listRes = await request.post(`${API_URL}/lists`, {
      headers: authHeaders(ownerToken),
      data: { boardId: board.id, name: 'To Do' },
    });
    expect(listRes.ok(), 'list created via API').toBe(true);

    // Open the board and add a card via the inline composer.
    await page.goto('/');
    await page.getByText(BOARD_NAME).first().click();
    await expect(page).toHaveURL(/\/b\//, { timeout: 15000 });
    await page
      .getByText(/add a card/i)
      .first()
      .click();
    await page.getByPlaceholder(/what needs to be done/i).fill(CARD_TITLE);
    const cardResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/v1/cards') && res.request().method() === 'POST',
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /^add card$/i }).click();
    const cardResponse = await cardResponsePromise;
    expect(cardResponse.ok(), 'card POST succeeds').toBe(true);
    await expect(page.getByText(CARD_TITLE).first()).toBeVisible({ timeout: 15000 });

    // Open the card and post a comment (composer lives in the Task chat pane).
    await page.getByText(CARD_TITLE).first().click();
    const commentBox = page.getByPlaceholder(/type @ to mention/i).first();
    await expect(commentBox).toBeVisible({ timeout: 15000 });
    await commentBox.fill(`E2E verification comment ${STAMP}`);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await expect(page.getByText(`E2E verification comment ${STAMP}`).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
