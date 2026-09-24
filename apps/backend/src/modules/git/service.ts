import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq, and, sql, inArray } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  gitRepositories,
  gitLinks,
  cards,
  comments,
  users,
  stages,
  stageTemplates,
  projects,
} from '../../db/schema/index';
import { eventBus } from '../../lib/event-bus';
import { env } from '../../lib/env';
import { getBoardIdForCard } from '../cards/service';
import { encryptToken } from '../calendar/google';

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

const BOT_EMAIL = 'github-bot@boardly.internal';

// Matches BCW-12 / ENG-108 style keys in branches, commits, PR titles.
export const TICKET_KEY_RE = /(?:^|[\s\[\(#/])([A-Z]{2,10}-\d+)\b/g;

export function extractTicketKeys(text: string | null | undefined): string[] {
  if (!text) return [];
  const keys = new Set<string>();
  let m: RegExpExecArray | null;
  TICKET_KEY_RE.lastIndex = 0;
  while ((m = TICKET_KEY_RE.exec(text)) !== null) {
    if (m[1]) keys.add(m[1]);
  }
  return [...keys];
}

export function slugifyBranch(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

export function branchNameFor(key: string, title: string): string {
  const slug = slugifyBranch(title) || 'task';
  return `${key.toLowerCase()}-${slug}`;
}

// ─── Webhook secret crypto (AES-GCM, shared convention with calendar) ───────

function secretsReady(): boolean {
  return !!env.CALENDAR_TOKEN_KEY;
}

function sealSecret(plain: string): string {
  if (!secretsReady()) return `plain:${plain}`;
  return `enc:${encryptToken(plain)}`;
}

export function verifySignature(
  secret: string,
  rawBody: string,
  signature: string | null
): boolean {
  if (!signature || !signature.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const actual = Buffer.from(signature.slice(7), 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// ─── Bot author for automation comments ──────────────────────────────────────

async function getOrCreateBotUser(db: Database): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, BOT_EMAIL))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(users)
    .values({
      name: 'GitHub Bot',
      email: BOT_EMAIL,
      passwordHash: `bot:${Date.now()}:${Math.random()}`,
    })
    .returning({ id: users.id })
    .onConflictDoNothing();
  if (created) return created.id;
  const [retry] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, BOT_EMAIL))
    .limit(1);
  if (!retry) throw httpError(500, 'Could not provision automation bot user');
  return retry.id;
}

// ─── Repository CRUD ─────────────────────────────────────────────────────────

export async function connectRepository(
  db: Database,
  organizationId: string,
  input: { owner: string; repo: string; projectId?: string; webhookSecret?: string }
) {
  if (!input.owner?.trim() || !input.repo?.trim()) {
    throw httpError(400, 'Repository owner and name are required');
  }
  const secret =
    input.webhookSecret?.trim() ||
    [...Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)])].join(
      ''
    );

  if (input.projectId) {
    const [proj] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, organizationId)))
      .limit(1);
    if (!proj) throw httpError(404, 'Project not found in this organization');
  }

  const [row] = await db
    .insert(gitRepositories)
    .values({
      organizationId,
      projectId: input.projectId || null,
      provider: 'github',
      owner: input.owner.trim(),
      repo: input.repo.trim(),
      webhookSecret: sealSecret(secret),
    })
    .onConflictDoNothing()
    .returning();

  if (row) return { ...sanitizeRepo(row), webhookSecret: secret };

  // Already linked → rotate secret to the provided (or fresh) value.
  const [updated] = await db
    .update(gitRepositories)
    .set({ webhookSecret: sealSecret(secret), isActive: true, updatedAt: new Date() })
    .where(
      and(
        eq(gitRepositories.organizationId, organizationId),
        eq(gitRepositories.owner, input.owner.trim()),
        eq(gitRepositories.repo, input.repo.trim())
      )
    )
    .returning();
  return { ...sanitizeRepo(updated!), webhookSecret: secret };
}

function sanitizeRepo(row: any) {
  const { webhookSecret, ...rest } = row;
  return rest;
}

export async function listRepositories(db: Database, organizationId: string) {
  const rows = await db
    .select()
    .from(gitRepositories)
    .where(eq(gitRepositories.organizationId, organizationId));
  const withCounts = await Promise.all(
    rows.map(async (r) => {
      const [cnt] = await db
        .select({ count: sql<number>`count(*)` })
        .from(gitLinks)
        .where(eq(gitLinks.repositoryId, r.id));
      return { ...sanitizeRepo(r), linkCount: Number(cnt?.count || 0) };
    })
  );
  return withCounts;
}

export async function disconnectRepository(db: Database, organizationId: string, repoId: string) {
  const [row] = await db
    .select()
    .from(gitRepositories)
    .where(and(eq(gitRepositories.id, repoId), eq(gitRepositories.organizationId, organizationId)))
    .limit(1);
  if (!row) throw httpError(404, 'Repository not found');

  await db.delete(gitLinks).where(eq(gitLinks.repositoryId, repoId));
  await db.delete(gitRepositories).where(eq(gitRepositories.id, repoId));
  return { success: true };
}

export async function listCardLinks(db: Database, organizationId: string, cardId: string) {
  const rows = await db
    .select({
      id: gitLinks.id,
      kind: gitLinks.kind,
      ref: gitLinks.ref,
      url: gitLinks.url,
      title: gitLinks.title,
      state: gitLinks.state,
      author: gitLinks.author,
      createdAt: gitLinks.createdAt,
      owner: gitRepositories.owner,
      repo: gitRepositories.repo,
    })
    .from(gitLinks)
    .innerJoin(gitRepositories, eq(gitLinks.repositoryId, gitRepositories.id))
    .where(and(eq(gitLinks.cardId, cardId), eq(gitLinks.organizationId, organizationId)));
  return rows;
}

// ─── Card helpers ────────────────────────────────────────────────────────────

async function findCardsByKeys(
  db: Database,
  organizationId: string,
  keys: string[]
): Promise<{ id: string; key: string | null; title: string; stageId: string | null }[]> {
  if (keys.length === 0) return [];
  return db
    .select({ id: cards.id, key: cards.key, title: cards.title, stageId: cards.stageId })
    .from(cards)
    .where(and(eq(cards.organizationId, organizationId), inArray(cards.key, keys)));
}

async function postBotComment(db: Database, cardId: string, body: string): Promise<void> {
  try {
    const botId = await getOrCreateBotUser(db);
    await db.insert(comments).values({ cardId, userId: botId, body });
    const boardId = await getBoardIdForCard(db, cardId).catch(() => null);
    if (boardId) eventBus.broadcast(`board:${boardId}`, 'card.commented', { cardId });
  } catch {
    // Comments are best-effort; links are the source of truth.
  }
}

async function upsertLink(
  db: Database,
  organizationId: string,
  repositoryId: string,
  cardId: string,
  link: {
    kind: string;
    ref: string;
    url?: string | null;
    title?: string | null;
    state?: string;
    author?: string | null;
  }
): Promise<void> {
  await db
    .insert(gitLinks)
    .values({
      organizationId,
      repositoryId,
      cardId,
      kind: link.kind,
      ref: link.ref,
      url: link.url || null,
      title: link.title || null,
      state: link.state || 'open',
      author: link.author || null,
    })
    .onConflictDoNothing();
  if (link.state) {
    await db
      .update(gitLinks)
      .set({ state: link.state, title: link.title || undefined, url: link.url || undefined })
      .where(
        and(eq(gitLinks.cardId, cardId), eq(gitLinks.kind, link.kind), eq(gitLinks.ref, link.ref))
      )
      .catch(() => {});
  }
}

/** Move card to the org's first stage of the given category (review/done automation). */
async function moveCardToStageCategory(
  db: Database,
  organizationId: string,
  cardId: string,
  category: 'in_progress' | 'done'
): Promise<boolean> {
  const [stage] = await db
    .select({ id: stages.id })
    .from(stages)
    .innerJoin(stageTemplates, eq(stages.templateId, stageTemplates.id))
    .where(
      and(eq(stageTemplates.organizationId, organizationId), eq(stages.category, category as any))
    )
    .limit(1);
  if (!stage) return false;
  await db
    .update(cards)
    .set({ stageId: stage.id, updatedAt: new Date() })
    .where(eq(cards.id, cardId));
  return true;
}

// ─── Webhook entrypoint ──────────────────────────────────────────────────────

export interface GitHubWebhookResult {
  delivery: string;
  matchedCards: number;
  linksCreated: number;
}

export async function findRepositoriesForWebhook(
  db: Database,
  owner: string,
  repo: string
): Promise<any[]> {
  const rows = await db.select().from(gitRepositories).where(eq(gitRepositories.owner, owner));
  return rows.filter((r) => r.repo.toLowerCase() === repo.toLowerCase() && r.isActive);
}

/** Back-compat single lookup (first match). Prefer fan-out via handleGitHubWebhook. */
export async function findRepositoryForWebhook(
  db: Database,
  owner: string,
  repo: string
): Promise<any | null> {
  const rows = await findRepositoriesForWebhook(db, owner, repo);
  return rows[0] || null;
}

export async function handleGitHubWebhook(
  db: Database,
  event: string,
  deliveryId: string,
  payload: any
): Promise<GitHubWebhookResult> {
  const fullName: string = payload?.repository?.full_name || '';
  const [owner, repo] = fullName.split('/');
  if (!owner || !repo) throw httpError(400, 'Webhook payload missing repository.full_name');

  const repoRows = await findRepositoriesForWebhook(db, owner, repo);
  if (repoRows.length === 0) throw httpError(404, 'No linked repository for ' + fullName);

  // Fan out to every linked org (same repo can be connected by multiple tenants).
  let matchedCards = 0;
  let linksCreated = 0;
  let delivery = '';
  for (const repoRow of repoRows) {
    await db
      .update(gitRepositories)
      .set({ lastEventAt: new Date(), lastError: null })
      .where(eq(gitRepositories.id, repoRow.id))
      .catch(() => {});

    let res: GitHubWebhookResult;
    if (event === 'push') res = await handlePush(db, repoRow, payload);
    else if (event === 'pull_request') res = await handlePullRequest(db, repoRow, payload);
    else if (event === 'pull_request_review') res = await handleReview(db, repoRow, payload);
    else return { delivery: deliveryId, matchedCards: 0, linksCreated: 0 };
    matchedCards += res.matchedCards;
    linksCreated += res.linksCreated;
    delivery = res.delivery;
  }
  return { delivery, matchedCards, linksCreated };
}

async function handlePush(db: Database, repoRow: any, payload: any): Promise<GitHubWebhookResult> {
  const commits: any[] = payload.commits || [];
  let matched = 0;
  let links = 0;
  for (const commit of commits.slice(0, 20)) {
    const keys = extractTicketKeys(`${commit.message || ''}`);
    if (keys.length === 0) continue;
    const found = await findCardsByKeys(db, repoRow.organizationId, keys);
    const shortSha = String(commit.id || 'unknown').slice(0, 7);
    for (const card of found) {
      matched++;
      const url = commit.url || `${payload.repository?.html_url}/commit/${commit.id}`;
      await upsertLink(db, repoRow.organizationId, repoRow.id, card.id, {
        kind: 'commit',
        ref: String(commit.id),
        url,
        title: (String(commit.message || '').split('\n')[0] || '').slice(0, 200),
        state: 'pushed',
        author: commit.author?.name || commit.author?.username || null,
      });
      links++;
      await postBotComment(
        db,
        card.id,
        `🔗 Commit [\`${shortSha}\`](${url}) linked${commit.author?.name ? ` by **${commit.author.name}**` : ''}`
      );
    }
  }
  return { delivery: 'push', matchedCards: matched, linksCreated: links };
}

async function handlePullRequest(
  db: Database,
  repoRow: any,
  payload: any
): Promise<GitHubWebhookResult> {
  const action: string = payload.action || '';
  const pr: any = payload.pull_request || {};
  const keys = extractTicketKeys(`${pr.title || ''} ${pr.body || ''} ${pr.head?.ref || ''}`);
  if (keys.length === 0) return { delivery: `pr:${action}`, matchedCards: 0, linksCreated: 0 };

  const found = await findCardsByKeys(db, repoRow.organizationId, keys);
  const prRef = String(pr.number);
  const prUrl = pr.html_url || '';
  const merged = action === 'closed' && pr.merged === true;
  const state = merged
    ? 'merged'
    : action === 'closed'
      ? 'closed'
      : action === 'opened' || action === 'reopened'
        ? 'open'
        : 'updated';

  let matched = 0;
  let links = 0;
  for (const card of found) {
    matched++;
    await upsertLink(db, repoRow.organizationId, repoRow.id, card.id, {
      kind: 'pr',
      ref: prRef,
      url: prUrl,
      title: String(pr.title || '').slice(0, 200),
      state,
      author: pr.user?.login || null,
    });
    links++;

    if (action === 'opened' || action === 'reopened' || action === 'ready_for_review') {
      await postBotComment(
        db,
        card.id,
        `🔀 PR [#${prRef}](${prUrl}) opened${pr.user?.login ? ` by **${pr.user.login}**` : ''} — moved to In Review`
      );
      await moveCardToStageCategory(db, repoRow.organizationId, card.id, 'in_progress').catch(
        () => {}
      );
    } else if (merged) {
      await postBotComment(db, card.id, `✅ PR [#${prRef}](${prUrl}) merged — moved to Done`);
      await moveCardToStageCategory(db, repoRow.organizationId, card.id, 'done').catch(() => {});
    } else if (action === 'closed') {
      await postBotComment(db, card.id, `❌ PR [#${prRef}](${prUrl}) closed without merging`);
    } else if (action === 'synchronize') {
      await postBotComment(db, card.id, `🔄 PR [#${prRef}](${prUrl}) updated with new commits`);
    }
  }
  return { delivery: `pr:${action}`, matchedCards: matched, linksCreated: links };
}

async function handleReview(
  db: Database,
  repoRow: any,
  payload: any
): Promise<GitHubWebhookResult> {
  const review: any = payload.review || {};
  const pr: any = payload.pull_request || {};
  const keys = extractTicketKeys(`${pr.title || ''} ${pr.head?.ref || ''}`);
  if (keys.length === 0) return { delivery: 'review', matchedCards: 0, linksCreated: 0 };

  const found = await findCardsByKeys(db, repoRow.organizationId, keys);
  const state =
    review.state === 'approved'
      ? 'approved'
      : review.state === 'changes_requested'
        ? 'changes_requested'
        : 'commented';
  const icon = state === 'approved' ? '✅' : state === 'changes_requested' ? '🔁' : '💬';
  for (const card of found) {
    await upsertLink(db, repoRow.organizationId, repoRow.id, card.id, {
      kind: 'pr',
      ref: String(pr.number),
      url: pr.html_url || '',
      title: String(pr.title || '').slice(0, 200),
      state,
      author: review.user?.login || null,
    }).catch(() => {});
    await postBotComment(
      db,
      card.id,
      `${icon} Review ${state.replace('_', ' ')} on PR [#${pr.number}](${pr.html_url || ''})${review.user?.login ? ` by **${review.user.login}**` : ''}`
    );
  }
  return { delivery: 'review', matchedCards: found.length, linksCreated: 0 };
}
