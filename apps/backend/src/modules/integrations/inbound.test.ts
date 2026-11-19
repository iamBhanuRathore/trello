import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard } from '../cards/card-crud';
import { deleteTestOrg, deleteTestUser, uniqueTestEmail, uniqueTestSlug } from '../../test-utils';
import {
  createInboundEndpoint,
  listInboundEndpoints,
  receiveInbound,
  updateInboundEndpoint,
} from './inbound-service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Inbound webhook endpoints', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let userId: string;
  let userEmail: string;
  let projectId: string;
  let boardId: string;
  let listId: string;
  let cardId: string;
  let listToken: string;
  let boardToken: string;
  let commentToken: string;
  let cardEndpointId: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema }) as unknown as Database;

    const email = uniqueTestEmail('inbound_hub');
    userEmail = email;
    const { organization, user } = await signUp(db, {
      name: 'Inbound Hub Admin',
      email,
      password: 'pass',
      orgName: 'Inbound Hub Org',
      orgSlug: uniqueTestSlug('inbound-hub'),
    });
    orgId = organization.id;
    userId = user.id;

    const workspace = await createWorkspace(db, { organizationId: orgId, name: 'Inbound WS' });
    const project = await createProject(db, {
      organizationId: orgId,
      workspaceId: workspace!.id,
      name: 'Inbound Project',
    });
    projectId = project!.id;
    const board = await createBoard(db, {
      organizationId: orgId,
      projectId,
      name: 'Inbound Board',
    });
    boardId = board!.id;
    const list = await createList(db, orgId, { boardId, name: 'Inbox' });
    listId = list!.id;
    const card = await createCard(db, orgId, { listId, title: 'Existing card' });
    cardId = card!.id;

    const cardEndpoint = await createInboundEndpoint(db, orgId, {
      label: 'Card intake',
      targetModule: 'cards',
      defaultRefId: listId,
      createdBy: userId,
    });
    listToken = tokenFromUrl(cardEndpoint.url);
    cardEndpointId = cardEndpoint.id;

    const boardEndpoint = await createInboundEndpoint(db, orgId, {
      label: 'Board intake',
      targetModule: 'boards',
      defaultRefId: projectId,
      createdBy: userId,
    });
    boardToken = tokenFromUrl(boardEndpoint.url);

    const commentEndpoint = await createInboundEndpoint(db, orgId, {
      label: 'Comment intake',
      targetModule: 'comments',
      defaultRefId: cardId,
      createdBy: userId,
    });
    commentToken = tokenFromUrl(commentEndpoint.url);
  });

  afterAll(async () => {
    await deleteTestOrg(db, orgId);
    await deleteTestUser(db, userEmail);
    await client.end();
  });

  it('creates a card in the default list and records usage', async () => {
    const result = await receiveInbound(db, listToken, {
      title: 'From the website',
      description: 'Submitted by a form',
    });
    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({ type: 'cards' });

    const [created] = await db
      .select()
      .from(schema.cards)
      .where(eq(schema.cards.id, (result.body as { id: string }).id));
    expect(created?.listId).toBe(listId);
    expect(created?.title).toBe('From the website');

    const endpoints = await listInboundEndpoints(db, orgId);
    const endpoint = endpoints.find((e) => e.id === cardEndpointId)!;
    expect(Number(endpoint.hits)).toBe(1);
    expect(endpoint.lastStatusCode).toBe(201);
    expect(endpoint.lastUsedAt).not.toBeNull();
  });

  it('ignores unknown payload fields but rejects invalid required values', async () => {
    const result = await receiveInbound(db, listToken, {
      title: 'With noise',
      someUnknownField: 'ignored',
    });
    expect(result.statusCode).toBe(201);

    await expect(receiveInbound(db, listToken, { description: 'no title' })).rejects.toThrow(
      /Missing required field: title/
    );

    const [delivery] = await db
      .select()
      .from(schema.inboundWebhookDeliveries)
      .where(eq(schema.inboundWebhookDeliveries.endpointId, cardEndpointId))
      .orderBy(schema.inboundWebhookDeliveries.createdAt)
      .limit(10);
    expect(delivery).toBeDefined();
  });

  it('deduplicates retries with Idempotency-Key', async () => {
    const first = await receiveInbound(db, listToken, { title: 'Exactly once' }, 'idem-123');
    expect(first.statusCode).toBe(201);
    const second = await receiveInbound(db, listToken, { title: 'Exactly once' }, 'idem-123');
    expect(second.statusCode).toBe(200);
    expect(second.body).toMatchObject({
      id: (first.body as { id: string }).id,
      idempotent: true,
    });

    const rows = await db
      .select({ id: schema.cards.id })
      .from(schema.cards)
      .where(eq(schema.cards.organizationId, orgId));
    const matching = rows.filter((r) => r.id === (first.body as { id: string }).id);
    expect(matching).toHaveLength(1);
  });

  it('creates boards against the default project', async () => {
    const result = await receiveInbound(db, boardToken, { name: 'Board from Zapier' });
    expect(result.statusCode).toBe(201);
    const [created] = await db
      .select()
      .from(schema.boards)
      .where(eq(schema.boards.id, (result.body as { id: string }).id));
    expect(created?.projectId).toBe(projectId);
  });

  it('creates comments against the default card', async () => {
    const result = await receiveInbound(db, commentToken, { body: 'Looks good to me' });
    expect(result.statusCode).toBe(201);
    const [created] = await db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, (result.body as { id: string }).id));
    expect(created?.cardId).toBe(cardId);
    expect(created?.userId).toBe(userId);
  });

  it('rejects unknown tokens and disabled endpoints', async () => {
    await expect(receiveInbound(db, 'binw_not_a_real_token', { title: 'x' })).rejects.toThrow(
      /Invalid inbound token/
    );
    await expect(receiveInbound(db, 'garbage', { title: 'x' })).rejects.toThrow(
      /Invalid inbound token/
    );

    await updateInboundEndpoint(db, orgId, cardEndpointId, { isActive: false });
    await expect(receiveInbound(db, listToken, { title: 'blocked' })).rejects.toThrow(/disabled/);
    await updateInboundEndpoint(db, orgId, cardEndpointId, { isActive: true });
  });

  it('scopes endpoint listings to the organization', async () => {
    const otherEmail = uniqueTestEmail('inbound_other');
    const other = await signUp(db, {
      name: 'Other Org',
      email: otherEmail,
      password: 'pass',
      orgName: 'Other Inbound Org',
      orgSlug: uniqueTestSlug('other-inbound'),
    });
    await createInboundEndpoint(db, other.organization.id, {
      label: 'Theirs',
      targetModule: 'cards',
      createdBy: other.user.id,
    });
    const mine = await listInboundEndpoints(db, orgId);
    expect(mine.every((e) => e.label !== 'Theirs')).toBe(true);
    await deleteTestOrg(db, other.organization.id);
    await deleteTestUser(db, otherEmail);
  });
});

function tokenFromUrl(url: string): string {
  return url.split('/').pop()!;
}
