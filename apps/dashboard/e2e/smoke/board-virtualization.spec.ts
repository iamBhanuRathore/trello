import { test, expect, type Page } from '@playwright/test';
import { loginAs, apiSignIn, authHeaders, API_URL } from '../helpers';

const STAMP = `virt-${Date.now().toString(36)}`;
const BOARD_NAME = `E2E Virtual ${STAMP}`;
/** Comfortably above the 20-card windowing threshold. */
const CARD_COUNT = 35;

const cardTitle = (i: number) => `E2E virt card ${STAMP} ${i}`;

/**
 * Counts the card tiles currently mounted inside the first column body.
 * The windowed container is the one with a pixel height derived from
 * `getTotalSize()`; the plain (non-windowed) path uses flex layout instead.
 */
async function mountedCardCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const column = document.querySelector('[data-virtualized-column="true"]');
    if (!column) return -1;
    return column.querySelectorAll('[data-card-id]').length;
  });
}

test.describe('board column virtualization', () => {
  let wsId = '';
  let ownerToken = '';
  let boardId = '';
  let projectId = '';

  test.beforeAll(async ({ request }) => {
    // 35 parallel card creates plus workspace/project/board setup.
    test.setTimeout(90_000);
    ({ accessToken: ownerToken } = await apiSignIn(request, 'alex.vance@acme.corp'));
    const headers = authHeaders(ownerToken);

    const wsRes = await request.post(`${API_URL}/workspaces`, {
      headers,
      data: { name: `E2E Virtual WS ${STAMP}`, slug: `e2e-virt-${STAMP}` },
    });
    expect(wsRes.ok(), 'workspace created').toBe(true);
    wsId = (await wsRes.json()).id;

    const project = await (
      await request.post(`${API_URL}/projects`, {
        headers,
        data: { workspaceId: wsId, name: `E2E Virtual Project ${STAMP}` },
      })
    ).json();
    projectId = project.id;

    const board = await (
      await request.post(`${API_URL}/boards`, {
        headers,
        data: { projectId: project.id, name: BOARD_NAME },
      })
    ).json();
    boardId = board.id;

    const list = await (
      await request.post(`${API_URL}/lists`, {
        headers,
        data: { boardId, name: 'To Do' },
      })
    ).json();

    // Explicit positions keep ordering deterministic while still allowing the
    // creates to run in parallel — server-side position allocation would race
    // and the 30s beforeAll budget can't absorb 35 sequential round trips.
    const created = await Promise.all(
      Array.from({ length: CARD_COUNT }, (_, idx) =>
        request.post(`${API_URL}/cards`, {
          headers,
          data: { listId: list.id, title: cardTitle(idx + 1), position: (idx + 1) * 65536 },
        })
      )
    );
    expect(
      created.every((r) => r.ok()),
      'all cards created'
    ).toBe(true);
  });

  test.afterAll(async ({ request }) => {
    if (wsId) {
      await request
        .delete(`${API_URL}/workspaces/${wsId}`, { headers: authHeaders(ownerToken) })
        .catch(() => {});
    }
  });

  test('windows long columns, renders the tail on scroll, and keeps rows sized', async ({
    page,
  }) => {
    await loginAs(page, 'owner');
    await page.goto(`/b/${boardId}`);
    await expect(page).toHaveURL(/\/b\//, { timeout: 20000 });

    // First card is in view without scrolling.
    await expect(page.getByText(cardTitle(1)).first()).toBeVisible({ timeout: 20000 });

    // Windowing is active and the DOM is far smaller than the card count.
    const mounted = await mountedCardCount(page);
    expect(mounted, 'long column is windowed').toBeGreaterThan(0);
    expect(mounted, 'windowed DOM is a subset of all cards').toBeLessThan(CARD_COUNT);

    // The last card is not mounted until its row scrolls into range.
    const lastCard = page.getByText(cardTitle(CARD_COUNT)).first();
    await expect(lastCard, 'last card is outside the initial window').toHaveCount(0);

    await page.evaluate(() => {
      const column = document.querySelector('[data-virtualized-column="true"]');
      if (column) column.scrollTop = column.scrollHeight;
    });

    await expect(lastCard, 'last card mounts after scrolling').toBeVisible({ timeout: 15000 });
    const mountedAfter = await mountedCardCount(page);
    expect(mountedAfter, 'tail window stays a subset').toBeLessThan(CARD_COUNT);

    // Rows are measured, not just estimated: at the bottom of the scroll the
    // last mounted row must reach the container's bottom edge. A spacer sized
    // from stale 104px estimates would leave a visible gap or overshoot here.
    const gap = await page.evaluate(() => {
      const column = document.querySelector(
        '[data-virtualized-column="true"]'
      ) as HTMLElement | null;
      if (!column) return -1;
      const rows = column.querySelectorAll('[data-index]');
      if (rows.length === 0) return -1;
      const last = rows[rows.length - 1] as HTMLElement;
      const spacer = column.firstElementChild as HTMLElement;
      const spacerBottom = spacer.getBoundingClientRect().top + spacer.offsetHeight;
      return spacerBottom - last.getBoundingClientRect().bottom;
    });
    expect(gap, 'measured rows leave no trailing gap').toBeGreaterThanOrEqual(-1);
    expect(gap, 'measured rows leave no trailing gap').toBeLessThan(6);
  });

  test('dragging out of a windowed column renders it in full, then moves the card', async ({
    page,
    request,
  }) => {
    // Guard against the update-loop class of regression: a render cycle that
    // never settles white-screens the board instead of failing a small
    // assertion, so watch for it explicitly.
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await loginAs(page, 'owner');
    const headers = authHeaders(ownerToken);

    // Dedicated board so this test's card counts are independent of the other
    // cases in the file.
    const board = await (
      await request.post(`${API_URL}/boards`, {
        headers,
        data: { projectId, name: `E2E Drag ${STAMP}` },
      })
    ).json();
    const source = await (
      await request.post(`${API_URL}/lists`, {
        headers,
        data: { boardId: board.id, name: 'Source' },
      })
    ).json();
    const target = await (
      await request.post(`${API_URL}/lists`, {
        headers,
        data: { boardId: board.id, name: 'Target' },
      })
    ).json();

    const seeded = await Promise.all(
      Array.from({ length: 25 }, (_, idx) =>
        request.post(`${API_URL}/cards`, {
          headers,
          data: {
            listId: source.id,
            title: `E2E drag card ${STAMP} ${idx + 1}`,
            position: (idx + 1) * 65536,
          },
        })
      )
    );
    expect(
      seeded.every((r) => r.ok()),
      'source column seeded'
    ).toBe(true);
    const dragged = (await seeded[0]!.json()).id;

    await page.goto(`/b/${board.id}`);
    await expect(page).toHaveURL(/\/b\//, { timeout: 20000 });

    const card = page.getByText(`E2E drag card ${STAMP} 1`).first();
    await expect(card).toBeVisible({ timeout: 20000 });
    const targetColumn = page.getByText('Target', { exact: true }).first();
    await expect(targetColumn).toBeVisible({ timeout: 20000 });

    const windowedBefore = await mountedCardCount(page);
    expect(windowedBefore, 'source column is windowed before the drag').toBeGreaterThan(0);
    expect(windowedBefore, 'source column is windowed before the drag').toBeLessThan(25);

    const from = (await card.boundingBox())!;
    const to = (await targetColumn.boundingBox())!;

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    // Exceed the 6px PointerSensor activation distance in steps so dnd-kit
    // registers the over-target and re-measures the now-unwindowed column.
    for (let step = 1; step <= 8; step++) {
      await page.mouse.move(
        from.x + from.width / 2 + ((to.x + to.width / 2 - from.x - from.width / 2) * step) / 8,
        from.y + from.height / 2 + ((to.y + 60 - from.y - from.height / 2) * step) / 8
      );
      await page.waitForTimeout(40);
    }

    // The contract under test: windowing is off for the duration of the drag,
    // so every row of the dragged column is in the DOM for dnd-kit's collision
    // math. Target is empty, so the page-wide count is exactly the 25 source cards.
    const mountedDuringDrag = await page.evaluate(
      () => document.querySelectorAll('[data-card-id]').length
    );
    expect(mountedDuringDrag, 'all 25 source cards mounted mid-drag').toBe(25);
    expect(
      pageErrors.filter((m) => m.includes('Maximum update depth')),
      'no render loop while dragging'
    ).toEqual([]);

    await page.mouse.up();

    await expect
      .poll(
        async () => {
          const res = await request.get(`${API_URL}/cards/${dragged}`, { headers });
          if (!res.ok()) return -1;
          return (await res.json()).listId;
        },
        { timeout: 20000 }
      )
      .toBe(target.id);

    // Windowing resumes once the drag ends.
    const windowedAfter = await mountedCardCount(page);
    expect(windowedAfter, 'column is windowed again after the drop').toBeLessThan(25);

    // The move is recorded in the card's history: opening the task shows a
    // system pill naming the source and target columns. Exact text match —
    // a substring would also match cards 10-19 and open the wrong task.
    await page.getByText(`E2E drag card ${STAMP} 1`, { exact: true }).click();
    await expect(page).toHaveURL(/card=/, { timeout: 20000 });
    await expect(page.getByText(/moved from source to target/i).first()).toBeVisible({
      timeout: 20000,
    });
  });

  test('short columns render every card without windowing', async ({ page, request }) => {
    await loginAs(page, 'owner');
    const headers = authHeaders(ownerToken);
    const second = await (
      await request.post(`${API_URL}/boards`, {
        headers,
        data: { projectId, name: `E2E Virtual Small ${STAMP}` },
      })
    ).json();
    const list = await (
      await request.post(`${API_URL}/lists`, {
        headers,
        data: { boardId: second.id, name: 'To Do' },
      })
    ).json();
    for (let i = 1; i <= 3; i++) {
      await request.post(`${API_URL}/cards`, {
        headers,
        data: { listId: list.id, title: cardTitle(i) },
      });
    }

    await page.goto(`/b/${second.id}`);
    await expect(page).toHaveURL(/\/b\//, { timeout: 20000 });
    for (let i = 1; i <= 3; i++) {
      await expect(page.getByText(cardTitle(i)).first()).toBeVisible({ timeout: 20000 });
    }
    expect(await mountedCardCount(page), 'short column opts out of windowing').toBe(-1);
  });
});
