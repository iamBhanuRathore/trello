import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { apiSignIn, authHeaders, API_URL } from '../helpers';

function sign(secret: string, raw: string): string {
  return `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
}

test.describe('git automations (HTTP)', () => {
  test('connect repo, signed push links card, bad signature rejected', async ({ request }) => {
    const { accessToken } = await apiSignIn(request, 'alex.vance@acme.corp');

    // Connect a uniquely-named repo (owner-scoped, no cross-test collision).
    const owner = `e2eorg${Date.now().toString(36)}`;
    const connectRes = await request.post(`${API_URL}/git/repos`, {
      headers: authHeaders(accessToken),
      data: { owner, repo: 'webapp' },
    });
    expect(connectRes.ok(), 'repo connected').toBe(true);
    const repo = await connectRes.json();
    expect(repo.webhookSecret, 'secret revealed once').toBeTruthy();

    // Resolve one of Alex's cards to target: use first assigned card via my-tasks.
    const tasksRes = await request.get(`${API_URL}/cards/my-tasks?limit=5`, {
      headers: authHeaders(accessToken),
    });
    expect(tasksRes.ok()).toBe(true);
    const tasks = await tasksRes.json();
    const list = Array.isArray(tasks) ? tasks : tasks.cards || tasks.tasks || [];
    expect(list.length, 'owner has tasks to link').toBeGreaterThan(0);
    const cardKey: string = list[0].key;
    expect(cardKey, 'card has a ticket key').toBeTruthy();

    const payload = {
      repository: { full_name: `${owner}/webapp`, html_url: `https://github.com/${owner}/webapp` },
      commits: [
        {
          id: 'e2e1234567890',
          message: `feat: e2e check\n\nCloses ${cardKey}`,
          url: `https://github.com/${owner}/webapp/commit/e2e1234567890`,
          author: { name: 'E2E Bot' },
        },
      ],
    };
    const raw = JSON.stringify(payload);
    const pushRes = await request.post(`${API_URL}/git/webhooks/github`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': sign(repo.webhookSecret, raw),
        'X-GitHub-Event': 'push',
        'X-GitHub-Delivery': `e2e-${Date.now()}`,
      },
      data: raw,
    });
    expect(pushRes.ok(), 'signed webhook accepted').toBe(true);
    const pushBody = await pushRes.json();
    // Seed data may share ticket keys across cards; assert ours is linked.
    expect(pushBody.matchedCards).toBeGreaterThanOrEqual(1);

    // Tampered signature rejected.
    const badRes = await request.post(`${API_URL}/git/webhooks/github`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': 'sha256=deadbeef',
        'X-GitHub-Event': 'push',
      },
      data: raw,
    });
    expect(badRes.status(), 'bad signature rejected').toBe(401);

    // Card shows the linked commit.
    const linksRes = await request.get(`${API_URL}/git/cards/${list[0].id}/links`, {
      headers: authHeaders(accessToken),
    });
    expect(linksRes.ok()).toBe(true);
    const links = await linksRes.json();
    expect(
      links.some((l: any) => l.kind === 'commit'),
      'commit link present'
    ).toBe(true);

    // Cleanup.
    await request.delete(`${API_URL}/git/repos/${repo.id}`, { headers: authHeaders(accessToken) });
  });
});
