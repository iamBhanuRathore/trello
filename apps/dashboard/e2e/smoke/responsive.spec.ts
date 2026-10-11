import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers';

/**
 * Horizontal-overflow matrix (AGENTS.md §9).
 *
 * The standard says to verify at mobile (390px) and tablet (820px) before
 * committing UI work, but nothing enforced it — the rule was checked by eye,
 * which is exactly the check that decays. These assert the measurable half of
 * it: no horizontal scrollbar on the routes that carry the dense layouts
 * (calendar grid, three-pane chat, notification/inbox virtual lists, timesheets
 * table, workspace card grid) or the two public auth forms.
 *
 * Deliberately not asserted: individual control sizes and wrapping, which are
 * visual judgements. On failure the message names the offending elements.
 */

const ROUTES = [
  '/login',
  '/signup',
  '/chat',
  '/calendar',
  '/my-tasks',
  '/notifications',
  '/inbox',
  '/timesheets',
  '/settings/profile',
  '/workspaces',
];

for (const width of [390, 820]) {
  for (const route of ROUTES) {
    test(`${route} @ ${width}px has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      if (route !== '/login' && route !== '/signup') await loginAs(page, 'member');
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);
      const overflow = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll('body *')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.right > window.innerWidth + 2;
          })
          .slice(0, 5)
          .map(
            (el) =>
              `${el.tagName}.${String(el.className).slice(0, 70)} right=${Math.round(
                el.getBoundingClientRect().right
              )}`
          ),
      }));
      expect(
        overflow.scroll,
        `overflowing: ${JSON.stringify(overflow.offenders, null, 2)}`
      ).toBeLessThanOrEqual(overflow.client);
    });
  }
}
