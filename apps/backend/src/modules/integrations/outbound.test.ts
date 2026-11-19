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
import { env } from '../../lib/env';
import { createOutboundIntegration, type OutboundInput } from './outbound-service';
import {
  buildMappedPayload,
  flattenJsonSchema,
  getPath,
  setPath,
  substituteAuthPlaceholders,
} from './outbound-mapping';
import {
  clearOutboundAuthCache,
  integrationMatches,
  runOutboundIntegration,
} from './outbound-engine';
import { outboundIntegrations } from '../../db/schema/index';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

type IntegrationRow = typeof outboundIntegrations.$inferSelect;

describe('Outbound mapping', () => {
  it('flattens JSON schemas into target paths, including arrays', () => {
    expect(
      flattenJsonSchema({
        title: '',
        owner: { email: '' },
        items: [{ rate: 1 }, { rate: 2 }],
        tags: ['a'],
      })
    ).toEqual(['title', 'owner.email', 'items[].rate', 'tags[]']);
  });

  it('reads dot paths and array indexes', () => {
    expect(getPath({ a: { b: [{ c: 5 }] } }, 'a.b.0.c')).toBe(5);
    expect(getPath({ a: 1 }, 'a.b')).toBeUndefined();
  });

  it('creates array items from bracket paths', () => {
    const payload: Record<string, unknown> = {};
    setPath(payload, 'items[].rate', 7);
    setPath(payload, 'items[].currency', 'USD');
    expect(payload).toEqual({ items: [{ rate: 7, currency: 'USD' }] });
  });

  it('never writes through prototype paths', () => {
    const payload: Record<string, unknown> = {};
    setPath(payload, '__proto__.polluted', 'yes');
    setPath(payload, 'constructor.prototype.polluted', 'yes');
    setPath(payload, 'a.__proto__.b', 'yes');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(payload).toEqual({ a: {} });
    expect(getPath({}, '__proto__')).toBeUndefined();
  });

  it('resolves CRM fields, static values, tokens and date formats', () => {
    const payload = buildMappedPayload(
      [
        { targetPath: 'name', mode: 'crm_field', source: 'title' },
        { targetPath: 'active', mode: 'static', value: 'true' },
        { targetPath: 'priority', mode: 'static', value: '7' },
        { targetPath: 'token', mode: 'auth_token', token: '{{auth_token}}' },
        { targetPath: 'refresh', mode: 'auth_token', token: '{{auth_token_2}}' },
        {
          targetPath: 'day',
          mode: 'crm_field',
          source: 'createdAt',
          dateFormat: 'date',
        },
        {
          targetPath: 'epoch',
          mode: 'crm_field',
          source: 'createdAt',
          dateFormat: 'unix_seconds',
        },
      ],
      {
        entity: { title: 'Ship it', createdAt: '2026-02-03T04:05:06.000Z' },
        authToken: 'tok_1',
        authToken2: 'tok_2',
      }
    );

    expect(payload.name).toBe('Ship it');
    expect(payload.active).toBe(true);
    expect(payload.priority).toBe(7);
    expect(payload.token).toBe('tok_1');
    expect(payload.refresh).toBe('tok_2');
    expect(payload.day).toBe('2026-02-03');
    expect(payload.epoch).toBe(1770091506);
  });

  it('substitutes both auth placeholders in headers and URLs', () => {
    expect(
      substituteAuthPlaceholders('{{auth_token}}/{{auth_token_2}}', {
        authToken: 'a',
        authToken2: 'b',
      })
    ).toBe('a/b');
    expect(substituteAuthPlaceholders('{{auth_token_2}}', { authToken: 'a' })).toBe('');
  });
});

describe('Outbound engine', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let userEmail: string;
  let cardId: string;
  let server: ReturnType<typeof Bun.serve>;
  let baseUrl: string;
  let authHits = 0;
  let dataHits = 0;
  let lastAuth: string | null = null;
  let lastBody: Record<string, unknown> | null = null;
  const previousAllowHttp = env.ALLOW_HTTP_WEBHOOKS;

  beforeAll(async () => {
    env.ALLOW_HTTP_WEBHOOKS = true;
    clearOutboundAuthCache();

    server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/auth') {
          authHits++;
          return Response.json({ data: { access_token: 'tok_abc' } });
        }
        if (url.pathname === '/data') {
          dataHits++;
          lastAuth = request.headers.get('authorization');
          lastBody = (await request.json()) as Record<string, unknown>;
          if (dataHits === 1) return new Response('boom', { status: 500 });
          return Response.json({ ok: true });
        }
        if (url.pathname === '/never-ok') {
          return Response.json({ ok: false });
        }
        return new Response('not found', { status: 404 });
      },
    });
    baseUrl = `http://127.0.0.1:${server.port}`;

    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema }) as unknown as Database;

    const email = uniqueTestEmail('outbound_hub');
    userEmail = email;
    const { organization } = await signUp(db, {
      name: 'Outbound Hub Admin',
      email,
      password: 'pass',
      orgName: 'Outbound Hub Org',
      orgSlug: uniqueTestSlug('outbound-hub'),
    });
    orgId = organization.id;
    const workspace = await createWorkspace(db, { organizationId: orgId, name: 'Outbound WS' });
    const project = await createProject(db, {
      organizationId: orgId,
      workspaceId: workspace!.id,
      name: 'Outbound Project',
    });
    const board = await createBoard(db, {
      organizationId: orgId,
      projectId: project!.id,
      name: 'Outbound Board',
    });
    const list = await createList(db, orgId, { boardId: board!.id, name: 'Outbound List' });
    const card = await createCard(db, orgId, { listId: list!.id, title: 'Engine card' });
    cardId = card!.id;
  });

  afterAll(async () => {
    env.ALLOW_HTTP_WEBHOOKS = previousAllowHttp;
    clearOutboundAuthCache();
    server?.stop(true);
    await deleteTestOrg(db, orgId);
    await deleteTestUser(db, userEmail);
    await client.end();
  });

  function baseInput(overrides: Partial<OutboundInput> = {}): OutboundInput {
    return {
      name: 'Test outbound',
      sourceModule: 'cards',
      triggerEvents: ['card.created'],
      dataConfig: { url: `${baseUrl}/data`, headers: { authorization: 'Bearer {{auth_token}}' } },
      fieldMappings: [
        { targetPath: 'name', mode: 'crm_field', source: 'title' },
        { targetPath: 'token', mode: 'auth_token', token: '{{auth_token}}' },
      ],
      ...overrides,
    };
  }

  async function loadRow(id: string): Promise<IntegrationRow> {
    const [row] = await db
      .select()
      .from(outboundIntegrations)
      .where(eq(outboundIntegrations.id, id));
    return row!;
  }

  it('runs auth once, caches the token, retries 5xx and logs each run', async () => {
    const created = await createOutboundIntegration(
      db,
      orgId,
      baseInput({
        authEnabled: true,
        authConfig: {
          url: `${baseUrl}/auth`,
          tokenPath: 'data.access_token',
          ttlSeconds: 300,
        },
        successCheck: { path: 'ok', equals: 'true' },
      })
    );
    const row = await loadRow(created.id);

    const first = await runOutboundIntegration(db, row, 'card.created', { cardId });
    expect(first.status).toBe('success');
    expect(dataHits).toBe(2); // 500, then retry succeeds

    const second = await runOutboundIntegration(db, row, 'card.created', { cardId });
    expect(second.status).toBe('success');
    expect(dataHits).toBe(3);
    expect(authHits).toBe(1); // cached across runs

    expect(lastAuth).toBe('Bearer tok_abc');
    expect(lastBody?.name).toBe('Engine card');
    expect(lastBody?.token).toBe('tok_abc');

    const runs = await db
      .select()
      .from(schema.outboundIntegrationRuns)
      .where(eq(schema.outboundIntegrationRuns.integrationId, created.id));
    expect(runs).toHaveLength(2);
    expect(runs.every((run) => run.status === 'success')).toBe(true);

    const [updated] = await db
      .select()
      .from(outboundIntegrations)
      .where(eq(outboundIntegrations.id, created.id));
    expect(updated?.lastStatus).toBe('success');
    expect(updated?.lastStatusCode).toBe(200);
  });

  it('treats a failed success check as a failed run without retrying', async () => {
    const created = await createOutboundIntegration(
      db,
      orgId,
      baseInput({
        name: 'Never ok',
        dataConfig: { url: `${baseUrl}/never-ok` },
        fieldMappings: [],
        successCheck: { path: 'ok', equals: 'true' },
      })
    );
    const row = await loadRow(created.id);
    const result = await runOutboundIntegration(db, row, 'card.created', { cardId });
    expect(result.status).toBe('failed');

    const runs = await db
      .select()
      .from(schema.outboundIntegrationRuns)
      .where(eq(schema.outboundIntegrationRuns.integrationId, created.id));
    expect(runs[0]?.status).toBe('failed');
    expect(runs[0]?.responseStatus).toBe(200);
  });

  it('matches triggers and list filters', () => {
    const row = {
      sourceModule: 'cards',
      triggerEvents: ['card.created', 'card.moved'],
      triggerFilter: { listId: 'list-1' },
    } as unknown as IntegrationRow;

    expect(integrationMatches(row, 'card.created', { listId: 'list-1' }, null)).toBe(true);
    expect(integrationMatches(row, 'card.created', { listId: 'list-2' }, null)).toBe(false);
    expect(integrationMatches(row, 'card.updated', { listId: 'list-1' }, null)).toBe(false);
  });

  it('rejects unknown triggers and unsafe URLs', async () => {
    await expect(
      createOutboundIntegration(db, orgId, baseInput({ triggerEvents: ['card.exploded'] }))
    ).rejects.toThrow(/Unsupported trigger events/);

    await expect(
      createOutboundIntegration(
        db,
        orgId,
        baseInput({
          dataConfig: { url: 'http://example.com/hook' },
        })
      )
    ).rejects.toThrow(/https/);

    await expect(
      createOutboundIntegration(
        db,
        orgId,
        baseInput({
          dataConfig: { url: 'https://127.0.0.1/hook' },
        })
      )
    ).rejects.toThrow(/blocked/);

    await expect(
      createOutboundIntegration(
        db,
        orgId,
        baseInput({
          fieldMappings: [{ targetPath: 'x', mode: 'crm_field', source: 'unknownField' }],
        })
      )
    ).rejects.toThrow(/Unknown CRM field/);
  });
});
