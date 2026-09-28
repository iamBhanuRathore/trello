import { test, expect, type Page } from '@playwright/test';
import { loginAs, apiSignIn, authHeaders, API_URL, PERSONAS, PASSWORD } from '../helpers';

const STAMP = `iso-${Date.now().toString(36)}`;

/**
 * Regression test for cross-user cache leaks: the React Query cache is keyed
 * without user identity, so without an explicit purge on auth change the next
 * account is served the previous account's boards/tasks/chat from cache.
 *
 * NOTE: every navigation below is in-app (sidebar links, router redirects).
 * Any page.goto/page.reload between Alex's cached page and Elena's assertion
 * would destroy the JS context and the leak with it, making this vacuous.
 */
test.describe('account-switch cache isolation', () => {
  let wsId = '';
  let ownerToken = '';
  let alexCardTitle = '';

  test.beforeAll(async ({ request }) => {
    const signin = await apiSignIn(request, 'alex.vance@acme.corp');
    ownerToken = signin.accessToken;
    const headers = authHeaders(ownerToken);
    const me = await (await request.get(`${API_URL}/auth/me`, { headers })).json();

    const ws = await (
      await request.post(`${API_URL}/workspaces`, {
        headers,
        data: { name: `E2E Isolation ${STAMP}`, slug: `e2e-iso-${STAMP}` },
      })
    ).json();
    wsId = ws.id;
    const project = await (
      await request.post(`${API_URL}/projects`, {
        headers,
        data: { workspaceId: wsId, name: `E2E Isolation Project ${STAMP}` },
      })
    ).json();
    const board = await (
      await request.post(`${API_URL}/boards`, {
        headers,
        data: { projectId: project.id, name: `E2E Isolation Board ${STAMP}` },
      })
    ).json();
    const list = await (
      await request.post(`${API_URL}/lists`, {
        headers,
        data: { boardId: board.id, name: 'To Do' },
      })
    ).json();

    // Assigned to Alex and no one else: /my-tasks can only return it for him.
    alexCardTitle = `Alex-only card ${STAMP}`;
    const card = await (
      await request.post(`${API_URL}/cards`, {
        headers,
        data: { listId: list.id, title: alexCardTitle },
      })
    ).json();
    const assignRes = await request.post(`${API_URL}/cards/${card.id}/assignees`, {
      headers,
      data: { userId: me.id },
    });
    expect(assignRes.ok(), 'card assigned to Alex').toBe(true);
  });

  test.afterAll(async ({ request }) => {
    if (wsId) {
      await request
        .delete(`${API_URL}/workspaces/${wsId}`, { headers: authHeaders(ownerToken) })
        .catch(() => {});
    }
  });

  async function signInWithoutReload(page: Page, email: string): Promise<void> {
    await expect(page).toHaveURL(/login/, { timeout: 15000 });
    await page.getByLabel(/email address/i).fill(email);
    await page.getByLabel(/^password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).not.toHaveURL(/login/, { timeout: 15000 });
  }

  test('switching accounts never shows the previous account tasks', async ({ page }) => {
    // Alex's session populates every cache with his data (sidebar link keeps
    // the SPA — and its caches — alive).
    await loginAs(page, 'owner');
    await page
      .getByRole('link', { name: /my tasks/i })
      .first()
      .click();
    await expect(page).toHaveURL(/my-tasks/, { timeout: 15000 });
    await expect(page.getByText(alexCardTitle).first()).toBeVisible({ timeout: 25000 });

    // Switch identity through the real in-app sign-out (client-side redirect,
    // no document reload — the leak only exists when caches survive).
    await page.getByRole('button', { name: /alex/i }).first().click();
    await page.getByRole('menuitem', { name: /sign out|log out/i }).click();
    await expect(page).toHaveURL(/login/, { timeout: 15000 });

    // Elena signs in on the same document, then opens her tasks in-app.
    await signInWithoutReload(page, 'elena.rostova@acme.corp');
    await expect(page.getByText(PERSONAS.admin.name).first()).toBeVisible({ timeout: 15000 });
    await page
      .getByRole('link', { name: /my tasks/i })
      .first()
      .click();
    await expect(page).toHaveURL(/my-tasks/, { timeout: 15000 });

    // Her list loads (stats prove HER data arrived)…
    await expect(page.getByText(/active tasks|watched tickets/i).first()).toBeVisible({
      timeout: 25000,
    });
    // …with no trace of Alex's card.
    await expect(page.getByText(alexCardTitle)).toHaveCount(0);
  });
});
