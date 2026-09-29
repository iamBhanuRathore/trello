import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { loginAs, apiSignIn, authHeaders, API_URL } from '../helpers';

// Project Automation builder (Phase 3): templates → editor → dry-run →
// real fire → history → toggle → delete, plus the permission wall for members.
const STAMP = `auto-${Date.now().toString(36)}`;
const CARD_TITLE = `E2E auto card ${STAMP}`;

async function setupProject(request: APIRequestContext, token: string) {
  const wsRes = await request.post(`${API_URL}/workspaces`, {
    headers: authHeaders(token),
    data: { name: `E2E Auto WS ${STAMP}` },
  });
  expect(wsRes.ok(), 'workspace created').toBe(true);
  const ws = await wsRes.json();

  const projRes = await request.post(`${API_URL}/projects`, {
    headers: authHeaders(token),
    data: { workspaceId: ws.id, name: `E2E Auto Project ${STAMP}` },
  });
  expect(projRes.ok(), 'project created').toBe(true);
  const project = await projRes.json();

  const boardRes = await request.post(`${API_URL}/boards`, {
    headers: authHeaders(token),
    data: { projectId: project.id, name: `E2E Auto Board ${STAMP}` },
  });
  expect(boardRes.ok(), 'board created').toBe(true);
  const board = await boardRes.json();

  const mkList = async (name: string) => {
    const r = await request.post(`${API_URL}/lists`, {
      headers: authHeaders(token),
      data: { boardId: board.id, name, position: 1 },
    });
    expect(r.ok(), `list ${name} created`).toBe(true);
    return r.json();
  };
  const backlog = await mkList('Backlog');
  const testing = await mkList('Testing');

  const labelRes = await request.post(`${API_URL}/boards/${board.id}/labels`, {
    headers: authHeaders(token),
    data: { name: 'front-end', color: '#3b82f6' },
  });
  expect(labelRes.ok(), 'label created').toBe(true);

  // Card starts in Backlog; a later API move into Testing fires the rule for real.
  const cardRes = await request.post(`${API_URL}/cards`, {
    headers: authHeaders(token),
    data: { listId: backlog.id, title: CARD_TITLE },
  });
  expect(cardRes.ok(), 'card created').toBe(true);
  const card = await cardRes.json();

  return { ws, project, board, testing, card };
}

/** Open a select and click an option directly (no typing: the shared select
 *  closes on scroll, and programmatic focus/scroll is flaky — visible
 *  elements need no scrolling, so plain clicks are stable). */
async function pickOptionText(
  page: Page,
  scope: ReturnType<Page['locator']>,
  trigger: RegExp,
  optionText: string
) {
  const btn = scope.getByRole('button', { name: trigger });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  // Option rows are div.cursor-pointer in the popover portal — scoping avoids
  // same-text matches elsewhere (e.g. the sidebar board link).
  const opt = page.locator('div.cursor-pointer', { hasText: optionText });
  await expect(opt.first()).toBeVisible({ timeout: 15000 });
  await opt.first().click();
}

test.describe('project automation builder', () => {
  let ownerToken = '';
  let ids: Awaited<ReturnType<typeof setupProject>> | null = null;

  test.beforeAll(async ({ request }) => {
    ({ accessToken: ownerToken } = await apiSignIn(request, 'alex.vance@acme.corp'));
    ids = await setupProject(request, ownerToken);
  });

  test.afterAll(async ({ request }) => {
    if (ids) {
      await request
        .delete(`${API_URL}/workspaces/${ids.ws.id}`, { headers: authHeaders(ownerToken) })
        .catch(() => {});
    }
  });

  test(
    'owner builds a Testing-handoff rule, dry-runs, fires, inspects history, deletes',
    { timeout: 180000 },
    async ({ page, request }) => {
      const { project, board, testing, card } = ids!;
      await loginAs(page, 'owner');
      await page.goto(`/projects/${project.id}/automation`);
      await expect(page.getByRole('heading', { name: /project automation/i })).toBeVisible({
        timeout: 20000,
      });

      // 1. Template pre-fills the editor (pool empty → Save disabled with guidance).
      await page.getByRole('button', { name: /testing handoff/i }).click();
      const editor = page.locator('form[aria-label="Rule editor"]');
      await expect(editor).toBeVisible({ timeout: 10000 });
      await expect(editor.getByLabel('Rule name')).toHaveValue(/testing handoff/i);
      await expect(editor.getByRole('button', { name: /^save rule$/i })).toBeDisabled();
      await expect(editor.getByText('Complete every action above.')).toBeVisible();

      // 2. Complete the Users pool via member search (Leo is past page one, so
      // search is required). The shared popover closes on scroll and focuses
      // async — retry the open-type-pick cycle until the option sticks. Never
      // press Escape here: the editor itself listens for Esc (discard guard),
      // which would instantly close a still-pristine draft.
      const poolTrigger = editor.getByRole('button', { name: /pick member to add/i });
      await expect(poolTrigger).toBeVisible({ timeout: 15000 });
      const searchInput = page.getByPlaceholder('Search by name, email, or role...');
      let picked = false;
      for (let attempt = 0; attempt < 6 && !picked; attempt++) {
        if (!(await searchInput.isVisible().catch(() => false))) {
          await poolTrigger.click();
          await expect(searchInput).toBeVisible({ timeout: 10000 });
        }
        const focused = await expect
          .poll(
            async () =>
              page.evaluate(
                () => (document.activeElement as HTMLInputElement)?.placeholder ?? null
              ),
            { timeout: 5000 }
          )
          .toBe('Search by name, email, or role...')
          .then(
            () => true,
            () => false
          );
        if (!focused) {
          await poolTrigger.click(); // toggle closed; retry fresh
          continue;
        }
        await page.keyboard.type('Leo Thorne', { delay: 30 });
        picked = await page
          .locator('div.cursor-pointer', { hasText: 'Leo Thorne' })
          .first()
          .waitFor({ state: 'visible', timeout: 12000 })
          .then(
            () => true,
            () => false
          );
        if (!picked) await poolTrigger.click(); // toggle closed; retry fresh
      }
      expect(picked, 'Leo Thorne option appears').toBe(true);
      await page.locator('div.cursor-pointer', { hasText: 'Leo Thorne' }).first().click();
      await editor
        .getByRole('region', { name: 'Then' })
        .getByRole('button', { name: 'Add', exact: true })
        .click();
      // Coverage auto-fix: a label missing on the board warns, then one click creates it.
      await editor.getByLabel('Add label condition').fill('e2e-missing-label');
      await editor
        .getByRole('region', { name: 'If' })
        .getByRole('button', { name: 'Add', exact: true })
        .click();
      const warn = editor.getByText(/missing on 1 of 1 board/);
      await expect(warn).toBeVisible({ timeout: 10000 });
      await editor.getByRole('button', { name: /create on 1 board/i }).click();
      await expect(warn).toHaveCount(0, { timeout: 15000 });
      // Drop the condition again so the saved rule keeps template semantics (fires on entry).
      await editor.getByRole('button', { name: /remove label condition/i }).click();
      const saveBtn = editor.getByRole('button', { name: /^save rule$/i });
      await expect(saveBtn).toBeEnabled({ timeout: 10000 });
      const saveResponse = page.waitForResponse(
        (res) => res.url().includes('/automation-rules') && res.request().method() === 'POST',
        { timeout: 15000 }
      );
      await saveBtn.click();
      await saveResponse;
      await expect(page.getByText('Testing handoff').first()).toBeVisible({ timeout: 15000 });

      // 3. Reopen in edit mode → dry-run against the Backlog card (would NOT fire there).
      await page
        .getByRole('button', { name: /^edit$/i })
        .first()
        .click();
      const testPanel = page.locator('section[aria-label="Dry-run test"]');
      await expect(testPanel).toBeVisible({ timeout: 10000 });
      await pickOptionText(page, testPanel, /board…/i, `E2E Auto Board ${STAMP}`);
      await pickOptionText(page, testPanel, /list…/i, 'Backlog');
      // Wait for the card list to load (trigger flips from "Loading cards…" to "Card…").
      await expect(testPanel.getByRole('button', { name: /^card…$/i })).toBeVisible({
        timeout: 15000,
      });
      await pickOptionText(page, testPanel, /^card…$/i, CARD_TITLE);
      await testPanel.getByRole('button', { name: /run test/i }).click();
      await expect(testPanel.getByText('Would not fire')).toBeVisible({ timeout: 15000 });

      // 4. Move the card into Testing via API → real fire creates the RR subtask.
      // The engine is async (remote broadcast hops) — poll the API until the run
      // lands, then open the drawer (which also live-refreshes every 5s).
      const moveRes = await request.patch(`${API_URL}/cards/${card.id}/move`, {
        headers: authHeaders(ownerToken),
        data: { listId: testing.id, position: 1 },
      });
      expect(moveRes.ok(), 'card moved via API').toBe(true);
      await expect
        .poll(
          async () => {
            const res = await request.get(`${API_URL}/projects/${project.id}/automation-rules`, {
              headers: authHeaders(ownerToken),
            });
            const rules = (await res.json()) as Array<{ id: string; name: string }>;
            const rule = rules.find((r) => r.name === 'Testing handoff');
            if (!rule) return 0;
            const runsRes = await request.get(
              `${API_URL}/projects/${project.id}/automation-rules/${rule.id}/runs?status=executed`,
              { headers: authHeaders(ownerToken) }
            );
            const runs = (await runsRes.json()) as { total: number };
            return runs.total;
          },
          { timeout: 60000 }
        )
        .toBeGreaterThan(0);
      // History drawer shows the executed run (poll: engine is async).
      await page
        .getByRole('button', { name: /^history$/i })
        .first()
        .click();
      const drawer = page.getByRole('dialog', { name: /run history/i });
      await expect(drawer).toBeVisible({ timeout: 10000 });
      await expect(drawer.getByText('executed').first()).toBeVisible({ timeout: 20000 });
      await drawer
        .getByRole('button', { name: /^close$/i })
        .first()
        .click();
      void board;

      // 5. Toggle off → badge; toggle on; delete → gone.
      const toggle = page.getByRole('switch').first();
      await toggle.click();
      await expect(page.getByText('Off', { exact: true }).first()).toBeVisible({ timeout: 10000 });
      await toggle.click();
      await page
        .getByRole('button', { name: /^delete$/i })
        .first()
        .click();
      const confirm = page.getByRole('dialog', { name: /delete.*testing handoff/i });
      await expect(confirm).toBeVisible({ timeout: 10000 });
      await confirm.getByRole('button', { name: /^delete$/i }).click();
      await expect(page.getByText('No automation rules yet')).toBeVisible({ timeout: 15000 });
    }
  );

  test('member without automation.manage sees the permission wall', async ({ page }) => {
    const { project } = ids!;
    await loginAs(page, 'member');
    await page.goto(`/projects/${project.id}/automation`);
    await expect(page.getByText(/needs the automation\.manage permission/i)).toBeVisible({
      timeout: 20000,
    });
  });

  test('builder has no horizontal overflow at mobile and tablet widths', async ({ page }) => {
    const { project } = ids!;
    await loginAs(page, 'owner');
    for (const width of [390, 820]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/projects/${project.id}/automation`);
      await expect(page.getByRole('heading', { name: /project automation/i })).toBeVisible({
        timeout: 20000,
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `no horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    }
  });
});
