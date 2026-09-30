import { test, expect, type Page } from '@playwright/test';
import { loginAs, apiSignIn, authHeaders, API_URL } from '../helpers';

const STAMP = `dlg-${Date.now().toString(36)}`;
const WS_NAME = `E2E Dialog WS ${STAMP}`;
const PROJECT_NAME = `E2E Dialog Project ${STAMP}`;
const BOARD_NAME = `E2E Dialog Board ${STAMP}`;
const CARD_TITLE = `E2E dialog card ${STAMP}`;

test.describe('task dialog closes exactly once', () => {
  let wsId = '';
  let ownerToken = '';
  let boardId = '';

  test.beforeAll(async ({ request }) => {
    ({ accessToken: ownerToken } = await apiSignIn(request, 'alex.vance@acme.corp'));
    const wsRes = await request.post(`${API_URL}/workspaces`, {
      headers: authHeaders(ownerToken),
      data: { name: WS_NAME },
    });
    const ws = await wsRes.json();
    wsId = ws.id;
    const projRes = await request.post(`${API_URL}/projects`, {
      headers: authHeaders(ownerToken),
      data: { workspaceId: wsId, name: PROJECT_NAME },
    });
    const project = await projRes.json();
    const boardRes = await request.post(`${API_URL}/boards`, {
      headers: authHeaders(ownerToken),
      data: { projectId: project.id, name: BOARD_NAME },
    });
    const board = await boardRes.json();
    boardId = board.id;
    const listRes = await request.post(`${API_URL}/lists`, {
      headers: authHeaders(ownerToken),
      data: { boardId, name: 'To Do' },
    });
    const list = await listRes.json();
    await request.post(`${API_URL}/cards`, {
      headers: authHeaders(ownerToken),
      data: { listId: list.id, title: CARD_TITLE },
    });
  });

  test.afterAll(async ({ request }) => {
    if (wsId) {
      await request.delete(`${API_URL}/workspaces/${wsId}`, {
        headers: authHeaders(ownerToken),
      });
    }
  });

  async function openCard(page: Page) {
    await page.goto(`/b/${boardId}`);
    await page.getByText(CARD_TITLE).first().click();
    await expect(page.getByRole('dialog')).toHaveCount(1, { timeout: 15000 });
    await expect(page).toHaveURL(/\?card=/, { timeout: 5000 });
  }

  async function expectStaysClosed(page: Page) {
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5000 });
    await expect(page).not.toHaveURL(/\?card=/, { timeout: 5000 });
    // Settle window: any reopen race (stale ?card= sync, pass-through click)
    // would remount within well under a second.
    await page.waitForTimeout(1500);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).not.toHaveURL(/\?card=/);
  }

  test('X button closes and stays closed', async ({ page }) => {
    await loginAs(page, 'owner');
    await openCard(page);
    await page.getByTitle('Close (Esc)').click();
    await expectStaysClosed(page);
  });

  test('Escape closes and stays closed', async ({ page }) => {
    await loginAs(page, 'owner');
    await openCard(page);
    await page.keyboard.press('Escape');
    await expectStaysClosed(page);
  });

  test('backdrop click closes and stays closed', async ({ page }) => {
    await loginAs(page, 'owner');
    await openCard(page);
    // Far-left edge below the header: overlay, not the centered popup.
    await page.mouse.click(12, 500);
    await expectStaysClosed(page);
  });

  test('dirty Escape shows prompt; Discard closes and stays closed', async ({ page }) => {
    await loginAs(page, 'owner');
    await openCard(page);
    // Make the description dirty via the inline editor.
    await page.getByText(/click here to write technical specifications/i).click();
    await page.locator('#card-description-editor').fill('E2E dirty edit');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Unsaved Changes' })).toBeVisible({
      timeout: 5000,
    });
    await page.getByRole('button', { name: 'Discard Changes' }).click();
    await expectStaysClosed(page);
  });
});
