import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createHmac } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard, listComments } from '../cards/service';
import {
  extractTicketKeys,
  branchNameFor,
  slugifyBranch,
  verifySignature,
  connectRepository,
  listRepositories,
  disconnectRepository,
  listCardLinks,
  handleGitHubWebhook,
} from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;
let db: Database;

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema });
});

afterAll(async () => {
  await client.end();
});

describe('Ticket key extraction & branch names', () => {
  it('extracts keys from branches, commits, and PR text', () => {
    expect(extractTicketKeys('bcw-12/add-login')).toEqual([]);
    expect(extractTicketKeys('BCW-12/add-login')).toEqual(['BCW-12']);
    expect(extractTicketKeys('Fix [ENG-108] and also ENG-109.')).toEqual(['ENG-108', 'ENG-109']);
    expect(extractTicketKeys('Merge pull request #5 from feat/XYZ-1-x')).toEqual(['XYZ-1']);
    expect(extractTicketKeys(null)).toEqual([]);
    expect(extractTicketKeys('no keys here')).toEqual([]);
  });

  it('builds clean branch names', () => {
    expect(branchNameFor('BCW-12', 'Add Google OAuth login!')).toBe(
      'bcw-12-add-google-oauth-login'
    );
    expect(branchNameFor('ENG-108', '!!!')).toBe('eng-108-task');
    expect(slugifyBranch('Fix: card modal (v2)')).toBe('fix-card-modal-v2');
  });
});

describe('Webhook signature verification', () => {
  it('accepts a valid HMAC and rejects tampering', () => {
    const secret = 'webhook-secret-123';
    const raw = JSON.stringify({ action: 'opened' });
    const sig = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
    expect(verifySignature(secret, raw, sig)).toBe(true);
    expect(verifySignature(secret, raw + 'x', sig)).toBe(false);
    expect(verifySignature('wrong', raw, sig)).toBe(false);
    expect(verifySignature(secret, raw, null)).toBe(false);
    expect(verifySignature(secret, raw, 'md5=abc')).toBe(false);
  });
});

describe('Repository management & webhook automation', () => {
  async function setup() {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { user, organization } = await signUp(db, {
      name: 'Git Owner',
      email: `git_${id}@git.com`,
      password: 'pass',
      orgName: `Git Org ${id}`,
      orgSlug: `git-org-${id}`,
    });
    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'WS' });
    const proj = await createProject(db, {
      organizationId: organization.id,
      workspaceId: ws!.id,
      name: 'App',
    });
    const board = await createBoard(db, {
      organizationId: organization.id,
      projectId: proj!.id,
      name: 'B1',
    });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
    const card = await createCard(db, organization.id, {
      listId: list!.id,
      title: 'Wire webhook',
      actorId: user.id,
    });
    return { user, organization, proj: proj!, card: card! };
  }

  function pushPayload(cardKey: string, owner = 'acme') {
    return {
      repository: {
        full_name: `${owner}/webapp`,
        html_url: `https://github.com/${owner}/webapp`,
      },
      commits: [
        {
          id: 'abc1234567890',
          message: `feat: implement login\n\nCloses ${cardKey}`,
          url: `https://github.com/${owner}/webapp/commit/abc1234567890`,
          author: { name: 'Dev Dan' },
        },
        { id: 'def0000', message: 'chore: bump deps', url: '', author: {} },
      ],
    };
  }

  function prPayload(cardKey: string, action: string, merged = false, owner = 'acme') {
    return {
      action,
      repository: { full_name: `${owner}/webapp`, html_url: `https://github.com/${owner}/webapp` },
      pull_request: {
        number: 42,
        title: `[${cardKey}] Add login flow`,
        body: 'Implements the thing',
        html_url: `https://github.com/${owner}/webapp/pull/42`,
        head: { ref: `${cardKey.toLowerCase()}-add-login-flow` },
        user: { login: 'devdan' },
        merged,
      },
    };
  }

  it('connects, lists, and disconnects a repository', async () => {
    const { organization, proj } = await setup();
    const connected: any = await connectRepository(db, organization.id, {
      owner: 'acme',
      repo: 'webapp',
      projectId: proj.id,
    });
    expect(connected.webhookSecret).toBeDefined();
    expect(connected.owner).toBe('acme');

    const repos = await listRepositories(db, organization.id);
    expect(repos.some((r: any) => r.repo === 'webapp')).toBe(true);

    await disconnectRepository(db, organization.id, connected.id);
    const after = await listRepositories(db, organization.id);
    expect(after.some((r: any) => r.repo === 'webapp')).toBe(false);
  });

  it('rejects invalid repo input', async () => {
    const { organization } = await setup();
    expect(connectRepository(db, organization.id, { owner: ' ', repo: 'x' })).rejects.toThrow(
      'owner and name are required'
    );
  });

  it('links commits to cards and posts bot comments on push', async () => {
    const { organization, card, user } = await setup();
    const owner = `acme${Date.now() % 100000}`;
    await connectRepository(db, organization.id, { owner, repo: 'webapp' });

    const res = await handleGitHubWebhook(db, 'push', 'd-1', pushPayload(card.key!, owner));
    expect(res.matchedCards).toBe(1);
    expect(res.linksCreated).toBe(1);

    const links = await listCardLinks(db, organization.id, card.id, { userId: user.id });
    expect(links.some((l) => l.kind === 'commit' && l.state === 'pushed')).toBe(true);

    const commentsList = await listComments(db, card.id, organization.id);
    expect(commentsList.some((c: any) => c.body.includes('abc1234'))).toBe(true);
  });

  it('links PRs, comments, and moves stage on open/merge', async () => {
    const { organization, card, user } = await setup();
    const owner = `acme${(Date.now() + 7) % 100000}`;
    await connectRepository(db, organization.id, { owner, repo: 'webapp' });

    const opened = await handleGitHubWebhook(
      db,
      'pull_request',
      'd-2',
      prPayload(card.key!, 'opened', false, owner)
    );
    expect(opened.matchedCards).toBe(1);

    let links = await listCardLinks(db, organization.id, card.id, { userId: user.id });
    expect(links.some((l) => l.kind === 'pr' && l.state === 'open')).toBe(true);

    const merged = await handleGitHubWebhook(
      db,
      'pull_request',
      'd-3',
      prPayload(card.key!, 'closed', true, owner)
    );
    expect(merged.matchedCards).toBe(1);

    links = await listCardLinks(db, organization.id, card.id, { userId: user.id });
    expect(links.some((l) => l.kind === 'pr' && l.state === 'merged')).toBe(true);

    const commentsList = await listComments(db, card.id, organization.id);
    expect(commentsList.some((c: any) => c.body.includes('merged'))).toBe(true);
  });

  it('ignores events with no ticket keys and unknown repos', async () => {
    const { organization, card } = await setup();
    await connectRepository(db, organization.id, { owner: 'acme', repo: 'webapp' });

    const res = await handleGitHubWebhook(db, 'push', 'd-4', {
      repository: { full_name: 'acme/webapp' },
      commits: [{ id: 'x', message: 'random chore', url: '', author: {} }],
    });
    expect(res.matchedCards).toBe(0);

    expect(
      handleGitHubWebhook(db, 'push', 'd-5', {
        repository: { full_name: 'ghost/unknown' },
        commits: [],
      })
    ).rejects.toThrow('No linked repository');
    expect(card.id).toBeDefined();
  });

  it('refuses git links on a private card to a member who cannot see the card', async () => {
    // Regression: /git/cards/:id/links and /git/cards/:id/branch sat behind
    // integration.manage, which was the only access check either route had.
    // listCardLinks did org scoping alone — no private-task gate — and the branch
    // route called getCard without `actor`, so requireCardAccess never ran.
    // Moving both routes to plain card access without adding the gate here would
    // have leaked the key/title of private cards to every org member.
    const { organization, card, user } = await setup();

    await db.update(schema.cards).set({ isPrivate: true }).where(eq(schema.cards.id, card.id));

    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { user: outsider } = await signUp(db, {
      name: 'Git Outsider',
      email: `outsider_${id}@git.com`,
      password: 'pass',
      orgName: `Outsider Org ${id}`,
      orgSlug: `outsider-org-${id}`,
    });
    await db.insert(schema.organizationMembers).values({
      organizationId: organization.id,
      userId: outsider.id,
      role: 'member',
      status: 'active',
    });

    // A member who cannot see the private card must not read its links…
    expect(listCardLinks(db, organization.id, card.id, { userId: outsider.id })).rejects.toThrow();
    // …while the creator still can, so the gate is not simply closed.
    const asCreator = await listCardLinks(db, organization.id, card.id, { userId: user.id });
    expect(Array.isArray(asCreator)).toBe(true);
  });

  it('still allows reads on a public card', async () => {
    const { organization, card, user } = await setup();
    const links = await listCardLinks(db, organization.id, card.id, { userId: user.id });
    expect(links).toEqual([]);
  });
});
