import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { outboundIntegrationRuns, outboundIntegrations } from '../../db/schema/index';
import { httpError } from '../../lib/errors';
import { assertSafeWebhookUrl } from '../../lib/ssrf';
import { decryptSecret, encryptSecret } from '../../lib/secret-box';
import { getApiModule, getOutboundTriggers, isApiModuleId } from '@boardly/shared-types';
import type { FieldMapping } from './outbound-mapping';

export interface AuthConfig {
  url: string;
  method?: 'POST' | 'GET';
  headers?: Record<string, string>;
  body?: string;
  tokenPath: string;
  token2Path?: string;
  ttlSeconds?: number;
}

export interface DataConfig {
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  bodyTemplate?: string;
}

export interface SuccessCheck {
  path?: string;
  equals?: string;
}

export interface OutboundInput {
  name: string;
  sourceModule: string;
  triggerEvents: string[];
  triggerFilter?: { listId?: string; stageId?: string } | null;
  authEnabled?: boolean;
  authConfig?: AuthConfig | null;
  dataConfig: DataConfig;
  fieldMappings?: FieldMapping[];
  successCheck?: SuccessCheck | null;
  isActive?: boolean;
}

function seal(value: unknown): { enc: string } | null {
  if (value === null || value === undefined) return null;
  return { enc: encryptSecret(JSON.stringify(value)) };
}

function open<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === 'object' && value !== null && 'enc' in value) {
    try {
      return JSON.parse(decryptSecret((value as { enc: string }).enc)) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

function assertUrl(value: string, label: string) {
  try {
    new URL(value);
  } catch {
    throw httpError(422, `${label} must be a valid URL`);
  }
}

async function validateInput(input: OutboundInput) {
  if (!input.name?.trim()) throw httpError(422, 'Integration name is required');
  if (!isApiModuleId(input.sourceModule)) {
    throw httpError(422, `Unknown source module: ${input.sourceModule}`);
  }
  const triggers = new Set(getOutboundTriggers(input.sourceModule).map((t) => t.id));
  if (!Array.isArray(input.triggerEvents) || input.triggerEvents.length === 0) {
    throw httpError(422, 'At least one trigger event is required');
  }
  const unknown = input.triggerEvents.filter((e) => !triggers.has(e));
  if (unknown.length > 0) throw httpError(422, `Unsupported trigger events: ${unknown.join(', ')}`);

  if (!input.dataConfig?.url) throw httpError(422, 'Data call URL is required');
  assertUrl(input.dataConfig.url, 'Data call URL');
  await assertSafeWebhookUrl(input.dataConfig.url);

  if (input.authEnabled) {
    if (!input.authConfig?.url) throw httpError(422, 'Auth call URL is required');
    if (!input.authConfig.tokenPath) throw httpError(422, 'Auth token path is required');
    assertUrl(input.authConfig.url, 'Auth call URL');
    await assertSafeWebhookUrl(input.authConfig.url);
  }

  const module = getApiModule(input.sourceModule)!;
  const validSources = new Set(module.fields.map((f) => f.id));
  for (const mapping of input.fieldMappings ?? []) {
    if (!mapping.targetPath) throw httpError(422, 'Every mapping needs a target path');
    if (mapping.mode === 'crm_field') {
      const root = (mapping.source || '').split('.')[0];
      if (!root || !validSources.has(root)) {
        throw httpError(422, `Unknown CRM field: ${mapping.source}`);
      }
    }
  }
}

function serialize(row: typeof outboundIntegrations.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    sourceModule: row.sourceModule,
    triggerEvents: row.triggerEvents as string[],
    triggerFilter: row.triggerFilter,
    authEnabled: row.authEnabled,
    authConfig: row.authEnabled ? open<AuthConfig>(row.authConfig) : null,
    dataConfig: open<DataConfig>(row.dataConfig) ?? { url: '' },
    fieldMappings: (row.fieldMappings as FieldMapping[]) ?? [],
    successCheck: row.successCheck,
    isActive: row.isActive,
    lastStatus: row.lastStatus,
    lastStatusCode: row.lastStatusCode,
    lastRunAt: row.lastRunAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listOutboundIntegrations(db: Database, organizationId: string) {
  const rows = await db
    .select()
    .from(outboundIntegrations)
    .where(eq(outboundIntegrations.organizationId, organizationId))
    .orderBy(desc(outboundIntegrations.createdAt));
  return rows.map(serialize);
}

export async function getOutboundIntegration(db: Database, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(outboundIntegrations)
    .where(
      and(eq(outboundIntegrations.id, id), eq(outboundIntegrations.organizationId, organizationId))
    )
    .limit(1);
  if (!row) throw httpError(404, 'Outbound integration not found');
  return serialize(row);
}

export async function createOutboundIntegration(
  db: Database,
  organizationId: string,
  input: OutboundInput
) {
  await validateInput(input);
  const [row] = await db
    .insert(outboundIntegrations)
    .values({
      organizationId,
      name: input.name.trim(),
      sourceModule: input.sourceModule,
      triggerEvents: input.triggerEvents,
      triggerFilter: input.triggerFilter ?? null,
      authEnabled: !!input.authEnabled,
      authConfig: input.authEnabled ? seal(input.authConfig) : null,
      dataConfig: seal(input.dataConfig)!,
      fieldMappings: input.fieldMappings ?? [],
      successCheck: input.successCheck ?? null,
      isActive: input.isActive ?? true,
    })
    .returning();
  return serialize(row!);
}

export async function updateOutboundIntegration(
  db: Database,
  organizationId: string,
  id: string,
  input: OutboundInput
) {
  await validateInput(input);
  const [row] = await db
    .update(outboundIntegrations)
    .set({
      name: input.name.trim(),
      sourceModule: input.sourceModule,
      triggerEvents: input.triggerEvents,
      triggerFilter: input.triggerFilter ?? null,
      authEnabled: !!input.authEnabled,
      authConfig: input.authEnabled ? seal(input.authConfig) : null,
      dataConfig: seal(input.dataConfig)!,
      fieldMappings: input.fieldMappings ?? [],
      successCheck: input.successCheck ?? null,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(outboundIntegrations.id, id), eq(outboundIntegrations.organizationId, organizationId))
    )
    .returning();
  if (!row) throw httpError(404, 'Outbound integration not found');
  return serialize(row);
}

export async function setOutboundActive(
  db: Database,
  organizationId: string,
  id: string,
  isActive: boolean
) {
  const [row] = await db
    .update(outboundIntegrations)
    .set({ isActive, updatedAt: new Date() })
    .where(
      and(eq(outboundIntegrations.id, id), eq(outboundIntegrations.organizationId, organizationId))
    )
    .returning();
  if (!row) throw httpError(404, 'Outbound integration not found');
  return serialize(row);
}

export async function deleteOutboundIntegration(db: Database, organizationId: string, id: string) {
  const [row] = await db
    .delete(outboundIntegrations)
    .where(
      and(eq(outboundIntegrations.id, id), eq(outboundIntegrations.organizationId, organizationId))
    )
    .returning({ id: outboundIntegrations.id });
  if (!row) throw httpError(404, 'Outbound integration not found');
  return { success: true, id };
}

export async function listOutboundRuns(
  db: Database,
  organizationId: string,
  integrationId: string
) {
  const [integration] = await db
    .select({ id: outboundIntegrations.id })
    .from(outboundIntegrations)
    .where(
      and(
        eq(outboundIntegrations.id, integrationId),
        eq(outboundIntegrations.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!integration) throw httpError(404, 'Outbound integration not found');
  return db
    .select()
    .from(outboundIntegrationRuns)
    .where(eq(outboundIntegrationRuns.integrationId, integrationId))
    .orderBy(desc(outboundIntegrationRuns.createdAt))
    .limit(50);
}

/** Exported for the engine and tests. */
export const outboundConfig = { seal, open };
