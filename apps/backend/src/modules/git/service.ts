import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq, and, sql, inArray } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  gitRepositories,
  gitLinks,
  cards,
  comments,
  users,
  lists,
  stages,
  stageTemplates,
  projects,
  notifications,
  cardAssignees,
  cardWatchers,
} from '../../db/schema/index';
import { eventBus } from '../../lib/event-bus';
import { env } from '../../lib/env';
import { encryptToken } from '../calendar/google';

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

const BOT_EMAIL = 'github-bot@boardly.internal';

// Matches BCW-12 / ENG-108 style keys in branches, commits, PR titles.
export const TICKET_KEY_RE = /(?:^|[\s[(#/])([A-Z]{2,10}-\d+)\b/g;

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
  const secret = input.webhookSecret?.trim() || randomBytes(16).toString('hex');

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

function sanitizeRepo(row: GitRepositoryRow) {
  const { webhookSecret: _webhookSecret, ...rest } = row;
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

export interface LinkEntry {
  repositoryId: string;
  cardId: string;
  kind: string;
  ref: string;
  url?: string | null;
  title?: string | null;
  state?: string;
  author?: string | null;
}

/**
 * Bulk link upsert — one statement no matter how many cards matched.
 * `ON CONFLICT (card_id, kind, ref) DO UPDATE` preserves the old
 * insert-then-refresh semantics per row via `excluded.*`.
 */
async function upsertLinksBulk(
  db: Database,
  organizationId: string,
  entries: LinkEntry[]
): Promise<void> {
  if (entries.length === 0) return;
  await db
    .insert(gitLinks)
    .values(
      entries.map((link) => ({
        organizationId,
        repositoryId: link.repositoryId,
        cardId: link.cardId,
        kind: link.kind,
        ref: link.ref,
        url: link.url || null,
        title: link.title || null,
        state: link.state || 'open',
        author: link.author || null,
      }))
    )
    .onConflictDoUpdate({
      target: [gitLinks.cardId, gitLinks.kind, gitLinks.ref],
      set: {
        state: sql`excluded.state`,
        title: sql`excluded.title`,
        url: sql`excluded.url`,
      },
    });
}

let cachedBotUserId: string | null = null;

/**
 * Bulk bot comments — 1 bot lookup + 1 comment insert + 1 board lookup +
 * one broadcast per distinct board, regardless of card count.
 * Best-effort (links are the source of truth); never throws.
 */
async function postBotCommentsBulk(
  db: Database,
  items: { cardId: string; body: string }[]
): Promise<void> {
  if (items.length === 0) return;
  try {
    if (!cachedBotUserId) cachedBotUserId = await getOrCreateBotUser(db);
    const botId = cachedBotUserId;
    await db
      .insert(comments)
      .values(items.map((i) => ({ cardId: i.cardId, userId: botId, body: i.body })));
    const cardIds = [...new Set(items.map((i) => i.cardId))];
    const boardRows = await db
      .select({ cardId: cards.id, boardId: lists.boardId })
      .from(cards)
      .innerJoin(lists, eq(lists.id, cards.listId))
      .where(inArray(cards.id, cardIds))
      .catch(() => []);
    const seenBoards = new Set<string>();
    for (const row of boardRows) {
      if (row.boardId && !seenBoards.has(row.boardId)) {
        seenBoards.add(row.boardId);
        eventBus.broadcast(`board:${row.boardId}`, 'card.commented', {
          cardIds: cardIds.filter((id) =>
            boardRows.some((r) => r.cardId === id && r.boardId === row.boardId)
          ),
        });
      }
    }
  } catch {
    // Comments are best-effort; links are the source of truth.
  }
}

/** Move card to the org's first stage of the given category (review/done automation). */
async function moveCardToStageCategory(
  db: Database,
  organizationId: string,
  cardId: string,
  category: typeof stages.$inferSelect.category
): Promise<boolean> {
  const [stage] = await db
    .select({ id: stages.id })
    .from(stages)
    .innerJoin(stageTemplates, eq(stages.templateId, stageTemplates.id))
    .where(and(eq(stageTemplates.organizationId, organizationId), eq(stages.category, category)))
    .limit(1);
  if (!stage) return false;
  await db
    .update(cards)
    .set({ stageId: stage.id, updatedAt: new Date() })
    .where(eq(cards.id, cardId));
  return true;
}

// ─── Webhook entrypoint ──────────────────────────────────────────────────────

export interface GitHubWebhookPayload {
  repository?: { full_name?: string; html_url?: string };
  commits?: {
    id?: string;
    message?: string;
    url?: string;
    author?: { name?: string; username?: string };
  }[];
  action?: string;
  pull_request?: {
    number?: number;
    title?: string;
    body?: string;
    html_url?: string;
    merged?: boolean;
    head?: { ref?: string };
    user?: { login?: string };
  };
  review?: { state?: string; user?: { login?: string } };
  [key: string]: unknown;
}

type GitRepositoryRow = typeof gitRepositories.$inferSelect;

export interface GitHubWebhookResult {
  delivery: string;
  matchedCards: number;
  linksCreated: number;
}

export async function findRepositoriesForWebhook(
  db: Database,
  owner: string,
  repo: string
): Promise<GitRepositoryRow[]> {
  // Both predicates in SQL (was: owner-only + JS lowercase filter).
  return db
    .select()
    .from(gitRepositories)
    .where(
      and(
        eq(gitRepositories.owner, owner),
        sql`lower(${gitRepositories.repo}) = lower(${repo})`,
        eq(gitRepositories.isActive, true)
      )
    );
}

/** Back-compat single lookup (first match). Prefer fan-out via handleGitHubWebhook. */
export async function findRepositoryForWebhook(
  db: Database,
  owner: string,
  repo: string
): Promise<GitRepositoryRow | null> {
  const rows = await findRepositoriesForWebhook(db, owner, repo);
  return rows[0] || null;
}

export async function handleGitHubWebhook(
  db: Database,
  event: string,
  deliveryId: string,
  payload: GitHubWebhookPayload
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

async function handlePush(
  db: Database,
  repoRow: GitRepositoryRow,
  payload: GitHubWebhookPayload
): Promise<GitHubWebhookResult> {
  const commits: any[] = payload.commits || [];
  let matched = 0;
  let links = 0;
  for (const commit of commits.slice(0, 20)) {
    const keys = extractTicketKeys(`${commit.message || ''}`);
    if (keys.length === 0) continue;
    const found = await findCardsByKeys(db, repoRow.organizationId, keys);
    if (found.length === 0) continue;
    const shortSha = String(commit.id || 'unknown').slice(0, 7);
    const url = commit.url || `${payload.repository?.html_url}/commit/${commit.id}`;
    const title = (String(commit.message || '').split('\n')[0] || '').slice(0, 200);
    const author = commit.author?.name || commit.author?.username || null;
    // Batched writes: ticket keys repeat across boards, so one commit can fan
    // out to dozens of cards. Per-card sequential awaits held the webhook HTTP
    // request open 25s+ (one remote-DB round trip per query per card).
    await upsertLinksBulk(
      db,
      repoRow.organizationId,
      found.map((card) => ({
        repositoryId: repoRow.id,
        cardId: card.id,
        kind: 'commit',
        ref: String(commit.id),
        url,
        title,
        state: 'pushed',
        author,
      }))
    );
    await postBotCommentsBulk(
      db,
      found.map((card) => ({
        cardId: card.id,
        body: `🔗 Commit [\`${shortSha}\`](${url}) linked${author ? ` by **${author}**` : ''}`,
      }))
    );
    matched += found.length;
    links += found.length;
  }
  return { delivery: 'push', matchedCards: matched, linksCreated: links };
}

async function handlePullRequest(
  db: Database,
  repoRow: GitRepositoryRow,
  payload: GitHubWebhookPayload
): Promise<GitHubWebhookResult> {
  const action: string = payload.action || '';
  const pr = payload.pull_request || {};
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
  // Batched writes (see handlePush: keys repeat across boards).
  await upsertLinksBulk(
    db,
    repoRow.organizationId,
    found.map((card) => ({
      repositoryId: repoRow.id,
      cardId: card.id,
      kind: 'pr',
      ref: prRef,
      url: prUrl,
      title: String(pr.title || '').slice(0, 200),
      state,
      author: pr.user?.login || null,
    }))
  );

  if (action === 'opened' || action === 'reopened' || action === 'ready_for_review') {
    await postBotCommentsBulk(
      db,
      found.map((card) => ({
        cardId: card.id,
        body: `🔀 PR [#${prRef}](${prUrl}) opened${pr.user?.login ? ` by **${pr.user.login}**` : ''} — moved to In Review`,
      }))
    );
    await Promise.all(
      found.map((card) =>
        moveCardToStageCategory(db, repoRow.organizationId, card.id, 'in_progress').catch(() => {})
      )
    );
  } else if (merged) {
    await postBotCommentsBulk(
      db,
      found.map((card) => ({
        cardId: card.id,
        body: `✅ PR [#${prRef}](${prUrl}) merged — moved to Done`,
      }))
    );
    await Promise.all(
      found.map((card) =>
        moveCardToStageCategory(db, repoRow.organizationId, card.id, 'done').catch(() => {})
      )
    );
  } else if (action === 'closed') {
    await postBotCommentsBulk(
      db,
      found.map((card) => ({
        cardId: card.id,
        body: `❌ PR [#${prRef}](${prUrl}) closed without merging`,
      }))
    );
  } else if (action === 'synchronize') {
    await postBotCommentsBulk(
      db,
      found.map((card) => ({
        cardId: card.id,
        body: `🔄 PR [#${prRef}](${prUrl}) updated with new commits`,
      }))
    );
  }
  matched += found.length;
  links += found.length;
  return { delivery: `pr:${action}`, matchedCards: matched, linksCreated: links };
}

async function handleReview(
  db: Database,
  repoRow: GitRepositoryRow,
  payload: GitHubWebhookPayload
): Promise<GitHubWebhookResult> {
  const review = payload.review || {};
  const pr = payload.pull_request || {};
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
  // Batched writes (see handlePush: keys repeat across boards).
  await upsertLinksBulk(
    db,
    repoRow.organizationId,
    found.map((card) => ({
      repositoryId: repoRow.id,
      cardId: card.id,
      kind: 'pr',
      ref: String(pr.number),
      url: pr.html_url || '',
      title: String(pr.title || '').slice(0, 200),
      state,
      author: review.user?.login || null,
    }))
  ).catch(() => {});
  await postBotCommentsBulk(
    db,
    found.map((card) => ({
      cardId: card.id,
      body: `${icon} Review ${state.replace('_', ' ')} on PR [#${pr.number}](${pr.html_url || ''})${review.user?.login ? ` by **${review.user.login}**` : ''}`,
    }))
  );
  // 4.6a: fan out review.requested to everyone triaging the card (assignees +
  // watchers). GitHub logins don't map to Boardly users, so the card's own
  // triage set is the recipient list; the inbox merges it as a `git` facet.
  try {
    const cardIds = found.map((c) => c.id);
    const [assignees, watchers] = await Promise.all([
      db
        .select({ cardId: cardAssignees.cardId, userId: cardAssignees.userId })
        .from(cardAssignees)
        .where(inArray(cardAssignees.cardId, cardIds)),
      db
        .select({ cardId: cardWatchers.cardId, userId: cardWatchers.userId })
        .from(cardWatchers)
        .where(inArray(cardWatchers.cardId, cardIds)),
    ]);
    const meta = new Map(found.map((c) => [c.id, c]));
    const seen = new Set<string>();
    const rows: Array<{
      userId: string;
      organizationId: string;
      eventType: string;
      payload: Record<string, unknown>;
      searchText: string;
    }> = [];
    for (const entry of [...assignees, ...watchers]) {
      const k = `${entry.cardId}:${entry.userId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const card = meta.get(entry.cardId);
      if (!card) continue;
      const payload = {
        cardId: entry.cardId,
        cardKey: card.key,
        cardTitle: card.title,
        actorName: review.user?.login || 'GitHub',
        messagePreview: `Review ${state.replace('_', ' ')} on PR #${pr.number}: ${String(pr.title || '').slice(0, 120)}`,
        prUrl: pr.html_url || '',
        prNumber: pr.number,
        reviewState: state,
      };
      rows.push({
        userId: entry.userId,
        organizationId: repoRow.organizationId,
        eventType: 'review.requested',
        payload,
        searchText: `${card.title} ${card.key || ''} review requested`.toLowerCase(),
      });
    }
    if (rows.length > 0) await db.insert(notifications).values(rows);
  } catch {}
  return { delivery: 'review', matchedCards: found.length, linksCreated: 0 };
}
