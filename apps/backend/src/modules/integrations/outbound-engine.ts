import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../../db/index';
import {
  boards,
  cards,
  comments,
  outboundIntegrationRuns,
  outboundIntegrations,
  projects,
  users,
} from '../../db/schema/index';
import { eventBus } from '../../lib/event-bus';
import { logger } from '../../lib/logger';
import { assertSafeWebhookUrl, safeFetch } from '../../lib/ssrf';
import { getOutboundTriggers } from '@boardly/shared-types';
import {
  outboundConfig,
  type AuthConfig,
  type DataConfig,
  type SuccessCheck,
} from './outbound-service';
import {
  buildMappedPayload,
  flattenJsonSchema,
  getPath,
  substituteAuthPlaceholders,
  type FieldMapping,
} from './outbound-mapping';

type IntegrationRow = typeof outboundIntegrations.$inferSelect;
type Entity = Record<string, unknown> & { id?: string; stageId?: string };

interface InternalEvent {
  event: string;
  payload: unknown;
  actorId: string;
  organizationId: string;
}

const authCache = new Map<
  string,
  { token: string | null; token2: string | null; expiresAt: number }
>();

export function clearOutboundAuthCache() {
  authCache.clear();
}

// ─── Auth call ────────────────────────────────────────────────────────────────
export interface AuthCallResult {
  ok: boolean;
  status: number;
  token: string | null;
  token2: string | null;
  candidatePaths: string[];
  responsePreview: string;
}

export async function executeAuthCall(config: AuthConfig): Promise<AuthCallResult> {
  await assertSafeWebhookUrl(config.url);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(config.headers ?? {}),
  };
  const res = await safeFetch(config.url, {
    method: config.method ?? 'POST',
    headers,
    ...(config.method === 'GET' ? {} : { body: config.body || '{}' }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  const token = json ? getPath(json, config.tokenPath) : undefined;
  const token2 = json && config.token2Path ? getPath(json, config.token2Path) : undefined;
  const paths = json ? flattenJsonSchema(json) : [];
  const candidatePaths = paths
    .filter((p) => typeof getPath(json, p) === 'string')
    .sort(
      (a, b) =>
        Number(b.toLowerCase().includes('token')) - Number(a.toLowerCase().includes('token'))
    )
    .slice(0, 25);

  return {
    ok: res.ok,
    status: res.status,
    token: typeof token === 'string' ? token : token === undefined ? null : String(token),
    token2: typeof token2 === 'string' ? token2 : token2 === undefined ? null : String(token2),
    candidatePaths,
    responsePreview: text.slice(0, 500),
  };
}

async function resolveAuthTokens(
  integration: IntegrationRow,
  authConfig: AuthConfig
): Promise<{ token: string | null; token2: string | null }> {
  const cached = authCache.get(integration.id);
  if (cached && cached.expiresAt > Date.now())
    return { token: cached.token, token2: cached.token2 };

  const result = await executeAuthCall(authConfig);
  if (!result.ok || !result.token) {
    throw Object.assign(new Error(`Auth call failed with status ${result.status}`), {
      status: result.status,
    });
  }
  const ttlMs = Math.max(30, authConfig.ttlSeconds ?? 300) * 1000;
  authCache.set(integration.id, {
    token: result.token,
    token2: result.token2,
    expiresAt: Date.now() + ttlMs,
  });
  return { token: result.token, token2: result.token2 };
}

// ─── Entity loading ───────────────────────────────────────────────────────────
async function loadEntity(
  db: Database,
  organizationId: string,
  module: string,
  payload: Record<string, unknown>
): Promise<Entity | null> {
  if (module === 'cards') {
    const cardId = payload.cardId as string | undefined;
    if (!cardId) return null;
    const [row] = await db
      .select()
      .from(cards)
      .where(
        and(eq(cards.id, cardId), eq(cards.organizationId, organizationId), isNull(cards.deletedAt))
      )
      .limit(1);
    return (row as Entity) ?? null;
  }
  if (module === 'boards') {
    const boardId = payload.boardId as string | undefined;
    if (!boardId) return null;
    const [row] = await db
      .select()
      .from(boards)
      .where(and(eq(boards.id, boardId), eq(boards.organizationId, organizationId)))
      .limit(1);
    return (row as Entity) ?? null;
  }
  if (module === 'projects') {
    const projectId = payload.projectId as string | undefined;
    if (!projectId) return null;
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
      .limit(1);
    return (row as Entity) ?? null;
  }
  const commentId = payload.commentId as string | undefined;
  if (!commentId) return null;
  const [row] = await db
    .select({
      id: comments.id,
      cardId: comments.cardId,
      userId: comments.userId,
      body: comments.body,
      isEdited: comments.isEdited,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      authorName: users.name,
    })
    .from(comments)
    .innerJoin(cards, eq(cards.id, comments.cardId))
    .leftJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.id, commentId), eq(cards.organizationId, organizationId)))
    .limit(1);
  return (row as Entity) ?? null;
}

export function integrationMatches(
  integration: IntegrationRow,
  event: string,
  payload: Record<string, unknown>,
  entity: Entity | null
): boolean {
  const triggers = getOutboundTriggers(integration.sourceModule).map((t) => t.id);
  if (!triggers.includes(event)) return false;
  if (!(integration.triggerEvents as string[]).includes(event)) return false;
  const filter = (integration.triggerFilter ?? {}) as { listId?: string; stageId?: string };
  if (filter.listId && payload.listId !== filter.listId) return false;
  if (filter.stageId && entity?.stageId !== filter.stageId) return false;
  return true;
}

// ─── Delivery ─────────────────────────────────────────────────────────────────
interface DeliveryOutcome {
  ok: boolean;
  statusCode: number | null;
  stage: 'auth' | 'data' | 'skip';
  error: string | null;
  durationMs: number;
  responseBody: string | null;
  requestSummary: Record<string, unknown>;
}

async function deliver(
  integration: IntegrationRow,
  event: string,
  entity: Entity
): Promise<DeliveryOutcome> {
  const started = Date.now();
  const dataConfig = outboundConfig.open<DataConfig>(integration.dataConfig);
  if (!dataConfig?.url) {
    return {
      ok: false,
      statusCode: null,
      stage: 'data',
      error: 'Integration has no data call URL',
      durationMs: 0,
      responseBody: null,
      requestSummary: {},
    };
  }

  let tokens: { token: string | null; token2: string | null } = { token: null, token2: null };
  if (integration.authEnabled) {
    const authConfig = outboundConfig.open<AuthConfig>(integration.authConfig);
    if (!authConfig) {
      return {
        ok: false,
        statusCode: null,
        stage: 'auth',
        error: 'Auth is enabled but auth config is missing',
        durationMs: Date.now() - started,
        responseBody: null,
        requestSummary: {},
      };
    }
    tokens = await resolveAuthTokens(integration, authConfig);
  }

  const mappings = (integration.fieldMappings as FieldMapping[]) ?? [];
  const payload = mappings.length
    ? buildMappedPayload(mappings, {
        entity,
        authToken: tokens.token,
        authToken2: tokens.token2,
      })
    : { event, entity };

  const url = substituteAuthPlaceholders(dataConfig.url, {
    authToken: tokens.token,
    authToken2: tokens.token2,
  });
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  for (const [key, value] of Object.entries(dataConfig.headers ?? {})) {
    headers[key] = substituteAuthPlaceholders(value, {
      authToken: tokens.token,
      authToken2: tokens.token2,
    });
  }
  const body = dataConfig.bodyTemplate
    ? substituteAuthPlaceholders(dataConfig.bodyTemplate, {
        authToken: tokens.token,
        authToken2: tokens.token2,
      })
    : JSON.stringify(payload);

  const summary = {
    method: dataConfig.method ?? 'POST',
    host: (() => {
      try {
        return new URL(url).host;
      } catch {
        return null;
      }
    })(),
    payloadKeys: Object.keys(payload),
  };

  let lastStatus: number | null = null;
  let lastError: string | null = null;
  let lastBody: string | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await safeFetch(url, {
        method: dataConfig.method ?? 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });
      lastStatus = res.status;
      const text = await res.text();
      lastBody = text.slice(0, 1000);

      const successCheck = (integration.successCheck ?? null) as SuccessCheck | null;
      let ok = res.ok;
      if (successCheck?.path) {
        try {
          const json = text ? JSON.parse(text) : null;
          const actual = getPath(json, successCheck.path);
          if (successCheck.equals !== undefined)
            ok = String(actual) === String(successCheck.equals);
        } catch {
          ok = false;
        }
      }
      if (ok) {
        return {
          ok: true,
          statusCode: res.status,
          stage: 'data',
          error: null,
          durationMs: Date.now() - started,
          responseBody: lastBody,
          requestSummary: summary,
        };
      }
      lastError = `Data call returned ${res.status}`;
      if (res.status < 500) break; // 4xx is not retryable
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : 'Data call failed';
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }

  return {
    ok: false,
    statusCode: lastStatus,
    stage: 'data',
    error: lastError,
    durationMs: Date.now() - started,
    responseBody: lastBody,
    requestSummary: summary,
  };
}

export async function runOutboundIntegration(
  db: Database,
  integration: IntegrationRow,
  event: string,
  payload: Record<string, unknown>
): Promise<{ status: string; runId: string | null }> {
  const entity = await loadEntity(
    db,
    integration.organizationId,
    integration.sourceModule,
    payload
  );
  if (!entity) {
    return { status: 'skipped', runId: null };
  }

  let outcome: DeliveryOutcome;
  try {
    outcome = await deliver(integration, event, entity);
  } catch (err: unknown) {
    outcome = {
      ok: false,
      statusCode: null,
      stage: 'auth',
      error: err instanceof Error ? err.message : 'Outbound delivery failed',
      durationMs: 0,
      responseBody: null,
      requestSummary: {},
    };
  }

  const runId = randomUUID();
  await db
    .insert(outboundIntegrationRuns)
    .values({
      id: runId,
      integrationId: integration.id,
      organizationId: integration.organizationId,
      event,
      entityType: integration.sourceModule,
      entityId: entity.id ?? null,
      status: outcome.ok ? 'success' : 'failed',
      stage: outcome.stage,
      requestSummary: outcome.requestSummary,
      responseStatus: outcome.statusCode,
      responseBody: outcome.responseBody,
      durationMs: outcome.durationMs,
      error: outcome.error,
    })
    .catch((err: unknown) =>
      logger.warn({ err, integrationId: integration.id }, 'Failed to persist outbound run')
    );

  await db
    .update(outboundIntegrations)
    .set({
      lastStatus: outcome.ok ? 'success' : 'failed',
      lastStatusCode: outcome.statusCode,
      lastRunAt: new Date(),
      lastError: outcome.error,
      updatedAt: new Date(),
    })
    .where(eq(outboundIntegrations.id, integration.id))
    .catch((err: unknown) =>
      logger.warn({ err, integrationId: integration.id }, 'Failed to update outbound status')
    );

  return { status: outcome.ok ? 'success' : 'failed', runId };
}

export async function dispatchOutboundEvent(db: Database, data: InternalEvent) {
  const payload = (data.payload ?? {}) as Record<string, unknown>;
  const rows = await db
    .select()
    .from(outboundIntegrations)
    .where(
      and(
        eq(outboundIntegrations.organizationId, data.organizationId),
        eq(outboundIntegrations.isActive, true)
      )
    );

  const results = [];
  for (const integration of rows) {
    const entity = await loadEntity(
      db,
      integration.organizationId,
      integration.sourceModule,
      payload
    );
    if (!integrationMatches(integration, data.event, payload, entity)) continue;
    results.push(await runOutboundIntegration(db, integration, data.event, payload));
  }
  return results;
}

export function setupOutboundDispatcher(db: Database) {
  eventBus.on('internal', async (data: InternalEvent) => {
    try {
      await dispatchOutboundEvent(db, data);
    } catch (err: unknown) {
      logger.error({ err, event: data.event }, 'Outbound dispatcher error');
    }
  });
}

/** Dispatch the integration's first trigger against the newest matching entity. */
export async function testOutboundIntegration(db: Database, organizationId: string, id: string) {
  const [integration] = await db
    .select()
    .from(outboundIntegrations)
    .where(
      and(eq(outboundIntegrations.id, id), eq(outboundIntegrations.organizationId, organizationId))
    )
    .limit(1);
  if (!integration)
    throw Object.assign(new Error('Outbound integration not found'), { status: 404 });

  const sample = await samplePayload(db, organizationId, integration.sourceModule);
  if (!sample) {
    throw Object.assign(new Error('No entity available to test this integration'), {
      status: 422,
    });
  }
  const event = ((integration.triggerEvents as string[]) ?? [])[0];
  if (!event) throw Object.assign(new Error('Integration has no trigger event'), { status: 422 });
  return runOutboundIntegration(db, integration, event, sample);
}

async function samplePayload(db: Database, organizationId: string, module: string) {
  if (module === 'cards') {
    const [row] = await db
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.organizationId, organizationId), isNull(cards.deletedAt)))
      .orderBy(desc(cards.createdAt))
      .limit(1);
    return row ? { cardId: row.id, listId: null } : null;
  }
  if (module === 'boards') {
    const [row] = await db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.organizationId, organizationId))
      .orderBy(desc(boards.createdAt))
      .limit(1);
    return row ? { boardId: row.id } : null;
  }
  if (module === 'projects') {
    const [row] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.organizationId, organizationId))
      .orderBy(desc(projects.createdAt))
      .limit(1);
    return row ? { projectId: row.id } : null;
  }
  const [row] = await db
    .select({ id: comments.id })
    .from(comments)
    .innerJoin(cards, eq(cards.id, comments.cardId))
    .where(eq(cards.organizationId, organizationId))
    .orderBy(desc(comments.createdAt))
    .limit(1);
  return row ? { commentId: row.id } : null;
}

/** Runs older than 30 days are deleted daily. */
export function startOutboundRunRetention(db: Database) {
  const cutoff = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const tick = () =>
    db
      .delete(outboundIntegrationRuns)
      .where(lt(outboundIntegrationRuns.createdAt, cutoff()))
      .catch((err: unknown) => logger.warn({ err }, 'Outbound run retention failed'));
  void tick();
  const timer = setInterval(() => void tick(), 24 * 60 * 60 * 1000);
  timer.unref?.();
  return () => clearInterval(timer);
}
