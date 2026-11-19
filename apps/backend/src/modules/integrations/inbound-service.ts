import { timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { inboundWebhookDeliveries, inboundWebhookEndpoints } from '../../db/schema/index';
import { httpError } from '../../lib/errors';
import {
  encryptSecret,
  decryptSecret,
  randomToken,
  sha256Hex,
  tokenPrefix,
} from '../../lib/secret-box';
import { getApiModule, isApiModuleId, type ApiModuleId } from '@boardly/shared-types';
import { validateWriteBody } from '../public-api/serializers';
import { createCard } from '../cards/card-crud';
import { createBoard } from '../boards/service';
import { createProject } from '../projects/service';
import { createComment } from '../cards/card-activity';
import { resolveApiActor } from '../public-api/service';

const MODULE_FALLBACK_LABEL: Record<string, string> = {
  cards: 'Card intake',
  boards: 'Board intake',
  projects: 'Project intake',
  comments: 'Comment intake',
};

function assertTargetModule(module: string): ApiModuleId {
  if (!isApiModuleId(module)) throw httpError(422, `Unknown target module: ${module}`);
  return module;
}

function publicUrl(token: string): string {
  const base = (process.env['API_URL'] || 'http://localhost:3001').replace(/\/$/, '');
  return `${base}/v1/public/inbound/${token}`;
}

function decryptToken(ciphertext: string): string | null {
  try {
    return decryptSecret(ciphertext);
  } catch {
    return null;
  }
}

export async function listInboundEndpoints(db: Database, organizationId: string) {
  const rows = await db
    .select()
    .from(inboundWebhookEndpoints)
    .where(eq(inboundWebhookEndpoints.organizationId, organizationId))
    .orderBy(desc(inboundWebhookEndpoints.createdAt));

  return rows.map((row) => {
    const token = decryptToken(row.tokenCiphertext);
    return {
      id: row.id,
      label: row.label,
      targetModule: row.targetModule,
      defaultRefId: row.defaultRefId,
      tokenPrefix: row.tokenPrefix,
      isActive: row.isActive,
      hits: row.hits,
      lastUsedAt: row.lastUsedAt,
      lastStatusCode: row.lastStatusCode,
      createdAt: row.createdAt,
      // Redisplayed from ciphertext so the admin can copy the URL again.
      url: token ? publicUrl(token) : null,
    };
  });
}

export async function createInboundEndpoint(
  db: Database,
  organizationId: string,
  input: { label?: string; targetModule: string; defaultRefId?: string | null; createdBy?: string }
) {
  const targetModule = assertTargetModule(input.targetModule);
  const token = randomToken('binw_');
  const [row] = await db
    .insert(inboundWebhookEndpoints)
    .values({
      organizationId,
      label: input.label?.trim() || MODULE_FALLBACK_LABEL[targetModule] || 'Inbound endpoint',
      targetModule,
      defaultRefId: input.defaultRefId || null,
      tokenHash: sha256Hex(token),
      tokenCiphertext: encryptSecret(token),
      tokenPrefix: tokenPrefix(token),
      createdBy: input.createdBy || null,
    })
    .returning();

  return {
    id: row!.id,
    label: row!.label,
    targetModule: row!.targetModule,
    defaultRefId: row!.defaultRefId,
    tokenPrefix: row!.tokenPrefix,
    isActive: row!.isActive,
    hits: row!.hits,
    url: publicUrl(token),
    createdAt: row!.createdAt,
  };
}

export async function updateInboundEndpoint(
  db: Database,
  organizationId: string,
  id: string,
  input: { label?: string; isActive?: boolean }
) {
  const [row] = await db
    .update(inboundWebhookEndpoints)
    .set({
      ...(input.label !== undefined ? { label: input.label.trim() } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(inboundWebhookEndpoints.id, id),
        eq(inboundWebhookEndpoints.organizationId, organizationId)
      )
    )
    .returning();
  if (!row) throw httpError(404, 'Inbound endpoint not found');
  const token = decryptToken(row.tokenCiphertext);
  const { tokenCiphertext: _ciphertext, tokenHash: _hash, ...safe } = row;
  return { ...safe, url: token ? publicUrl(token) : null };
}

export async function deleteInboundEndpoint(db: Database, organizationId: string, id: string) {
  const [row] = await db
    .delete(inboundWebhookEndpoints)
    .where(
      and(
        eq(inboundWebhookEndpoints.id, id),
        eq(inboundWebhookEndpoints.organizationId, organizationId)
      )
    )
    .returning({ id: inboundWebhookEndpoints.id });
  if (!row) throw httpError(404, 'Inbound endpoint not found');
  return { success: true, id };
}

function constantTimeTokenMatch(raw: string, expectedHash: string): boolean {
  const actual = Buffer.from(sha256Hex(raw));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Lenient inbound mapping: unknown fields are ignored (form tools add noise),
 * but known read-only/invalid fields are rejected with 422 — a caller that
 * thinks it is setting `id` or `boardId` should hear about it.
 */
function mapPayload(module: ApiModuleId, payload: Record<string, unknown>) {
  const definition = getApiModule(module)!;
  const known = new Set(definition.fields.map((f) => f.id));
  const writable = new Set(definition.fields.filter((f) => !f.readOnly).map((f) => f.id));
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (known.has(key)) filtered[key] = value;
  }
  return validateWriteBody(module, filtered, writable, 'create');
}

export async function receiveInbound(
  db: Database,
  token: string,
  payload: unknown,
  idempotencyKey?: string
) {
  if (!token || !token.startsWith('binw_')) throw httpError(401, 'Invalid inbound token');
  const tokenHash = sha256Hex(token);
  const [endpoint] = await db
    .select()
    .from(inboundWebhookEndpoints)
    .where(eq(inboundWebhookEndpoints.tokenHash, tokenHash))
    .limit(1);

  if (!endpoint || !constantTimeTokenMatch(token, endpoint.tokenHash)) {
    throw httpError(401, 'Invalid inbound token');
  }
  if (!endpoint.isActive) throw httpError(403, 'Inbound endpoint is disabled');

  const module = assertTargetModule(endpoint.targetModule);

  // Claim the idempotency key BEFORE creating anything. A check-then-create
  // sequence lets two concurrent retries both pass the check and create two
  // entities; the unique index only catches the duplicate delivery row, which
  // was being swallowed. The claim row starts at 102 (processing) and is
  // rewritten with the final outcome in `finally`.
  let deliveryId: string | null = null;
  if (idempotencyKey) {
    const [claimed] = await db
      .insert(inboundWebhookDeliveries)
      .values({
        endpointId: endpoint.id,
        idempotencyKey,
        statusCode: 102,
        entityType: module,
        entityId: null,
        error: null,
      })
      .onConflictDoNothing()
      .returning({ id: inboundWebhookDeliveries.id });

    if (!claimed) {
      const [prior] = await db
        .select()
        .from(inboundWebhookDeliveries)
        .where(
          and(
            eq(inboundWebhookDeliveries.endpointId, endpoint.id),
            eq(inboundWebhookDeliveries.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);
      if (!prior || prior.statusCode === 102) {
        throw httpError(409, 'A request with this Idempotency-Key is still being processed');
      }
      if (prior.statusCode < 300) {
        return {
          statusCode: 200,
          body: { id: prior.entityId, type: prior.entityType, idempotent: true },
        };
      }
      throw httpError(
        prior.statusCode >= 400 && prior.statusCode < 500 ? prior.statusCode : 500,
        prior.error || 'A previous request with this Idempotency-Key failed'
      );
    }
    deliveryId = claimed.id;
  }

  let statusCode = 201;
  let entityType: string = module;
  let entityId: string | null = null;
  let error: string | null = null;

  try {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw httpError(422, 'Payload must be a JSON object');
    }
    const raw = { ...(payload as Record<string, unknown>) };
    const defaultRef = endpoint.defaultRefId;

    if (module === 'cards') {
      if (!raw.listId && defaultRef) raw.listId = defaultRef;
      if (!raw.listId) throw httpError(422, 'listId is required (or set a default list)');
      const input = mapPayload('cards', raw);
      const card = await createCard(db, endpoint.organizationId, {
        listId: input.listId as string,
        title: input.title as string,
        description: input.description as string | undefined,
        dueDate: input.dueDate instanceof Date ? input.dueDate.toISOString() : undefined,
        stageId: input.stageId as string | undefined,
        priorityId: (input.priorityId as string | undefined) ?? undefined,
        storyPoints: input.storyPoints as number | undefined,
        estimateMinutes: input.estimateMinutes as number | undefined,
      });
      entityId = card!.id;
    } else if (module === 'boards') {
      if (!raw.projectId && defaultRef) raw.projectId = defaultRef;
      if (!raw.projectId) throw httpError(422, 'projectId is required (or set a default project)');
      const input = mapPayload('boards', raw);
      const board = await createBoard(db, {
        organizationId: endpoint.organizationId,
        projectId: input.projectId as string,
        name: input.name as string,
        background: input.background as string | undefined,
      });
      entityId = board!.id;
    } else if (module === 'projects') {
      if (!raw.workspaceId && defaultRef) raw.workspaceId = defaultRef;
      if (!raw.workspaceId) {
        throw httpError(422, 'workspaceId is required (or set a default workspace)');
      }
      const input = mapPayload('projects', raw);
      const project = await createProject(db, {
        organizationId: endpoint.organizationId,
        workspaceId: input.workspaceId as string,
        name: input.name as string,
        key: input.key as string | undefined,
        description: input.description as string | undefined,
      });
      entityId = project!.id;
    } else {
      if (!raw.cardId && defaultRef) raw.cardId = defaultRef;
      if (!raw.cardId) throw httpError(422, 'cardId is required (or set a default card)');
      const input = mapPayload('comments', raw);
      const authorId = endpoint.createdBy ?? (await resolveApiActor(db, endpoint.organizationId));
      const comment = await createComment(
        db,
        input.cardId as string,
        endpoint.organizationId,
        authorId,
        input.body as string
      );
      entityId = comment!.id;
      entityType = 'comment';
    }
  } catch (err: unknown) {
    statusCode = (err as { status?: number }).status ?? 500;
    error = err instanceof Error ? err.message : 'Inbound processing failed';
    throw err;
  } finally {
    await db
      .update(inboundWebhookEndpoints)
      .set({
        // Atomic increment: read-modify-write loses hits under concurrent posts.
        hits: sql`${inboundWebhookEndpoints.hits} + 1`,
        lastUsedAt: new Date(),
        lastStatusCode: statusCode,
        updatedAt: new Date(),
      })
      .where(eq(inboundWebhookEndpoints.id, endpoint.id))
      .catch(() => undefined);
    if (deliveryId) {
      await db
        .update(inboundWebhookDeliveries)
        .set({ statusCode, entityType, entityId, error })
        .where(eq(inboundWebhookDeliveries.id, deliveryId))
        .catch(() => undefined);
    } else {
      await db
        .insert(inboundWebhookDeliveries)
        .values({
          endpointId: endpoint.id,
          idempotencyKey: idempotencyKey || null,
          statusCode,
          entityType,
          entityId,
          error,
        })
        .catch(() => undefined);
    }
  }

  return { statusCode: 201, body: { id: entityId, type: entityType } };
}

export async function listInboundDeliveries(
  db: Database,
  organizationId: string,
  endpointId: string
) {
  const [endpoint] = await db
    .select({ id: inboundWebhookEndpoints.id })
    .from(inboundWebhookEndpoints)
    .where(
      and(
        eq(inboundWebhookEndpoints.id, endpointId),
        eq(inboundWebhookEndpoints.organizationId, organizationId),
        isNull(inboundWebhookEndpoints.deletedAt)
      )
    )
    .limit(1);
  if (!endpoint) throw httpError(404, 'Inbound endpoint not found');
  return db
    .select()
    .from(inboundWebhookDeliveries)
    .where(eq(inboundWebhookDeliveries.endpointId, endpointId))
    .orderBy(desc(inboundWebhookDeliveries.createdAt))
    .limit(50);
}
