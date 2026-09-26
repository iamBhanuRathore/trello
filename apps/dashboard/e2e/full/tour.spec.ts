import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers';

// Data-driven no-crash tour. Every route must settle to real content
// (not login redirect, blank page, or perpetual spinner).
const WS = '813c4ce7-da0c-40b3-84a3-5d70a6a58cbc';
const PROJ = 'ee468270-affb-42d4-a49f-6ee69fb8f043';

const ROUTES: [string, RegExp][] = [
  [`/projects/${PROJ}/sprints`, /sprint/i],
  [`/projects/${PROJ}/phases`, /phase/i],
  [`/projects/${PROJ}/reports`, /burndown|velocity|report|analytics/i],
  [`/projects/${PROJ}/docs`, /doc|wiki|knowledge/i],
  [`/workspaces/${WS}/portfolio`, /portfolio|health/i],
  ['/admin/roles', /role|permission/i],
  ['/admin/sso', /sso|single sign|identity/i],
  ['/admin/developer', /api key|developer|scope/i],
  ['/admin/audit-logs', /audit|activity|log/i],
  ['/admin/billing', /billing|seat|subscription|plan/i],
  ['/admin/branding', /brand|logo|theme|color/i],
  ['/admin/stages', /stage|template/i],
  ['/admin/labels', /label|tag/i],
  ['/admin/webhooks', /webhook/i],
  ['/admin/integrations', /slack|github|integration/i],
  ['/profile', /profile|account/i],
  ['/settings/notifications', /notification/i],
  ['/my-tasks', /my tasks|assigned/i],
  ['/timesheets', /timesheet|time log|hours/i],
  ['/marketplace', /marketplace|power|app/i],
];

test.describe('route tour (owner)', () => {
  for (const [route, marker] of ROUTES) {
    test(`renders ${route}`, async ({ page }) => {
      await loginAs(page, 'owner');
      await page.goto(route);
      await page.waitForTimeout(2500);
      const url = page.url();
      expect(url, 'must not bounce to login').not.toMatch(/\/login/);
      const body = (await page.textContent('body')) || '';
      const clean = body.replace(/\s+/g, ' ');
      expect(clean.length, 'must render content, not blank').toBeGreaterThan(200);
      expect(clean, `route ${route} should mention ${marker}`).toMatch(marker);
    });
  }
});
