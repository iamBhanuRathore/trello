import { api } from '../../../lib/api';
import type { ApiModuleId, FieldMappingMode } from '@boardly/shared-types';

export interface ApiKeyModuleScope {
  module: ApiModuleId;
  read: boolean;
  write: boolean;
  fields: string[] | null;
  hitLimit: number | null;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  moduleScopes: ApiKeyModuleScope[];
  hitLimit: number | null;
  hits: number;
  hitsPeriodStart: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateApiKeyBody {
  name: string;
  hitLimit?: number | null;
  moduleScopes: ApiKeyModuleScope[];
  expiresInDays?: number;
}

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const { data } = await api.get('/developer/keys');
  return data;
}

export async function createApiKey(
  body: CreateApiKeyBody
): Promise<ApiKeyRecord & { rawKey: string }> {
  const { data } = await api.post('/developer/keys', body);
  return data;
}

export async function revokeApiKey(id: string) {
  const { data } = await api.post(`/developer/keys/${id}/revoke`);
  return data;
}

export async function deleteApiKey(id: string) {
  const { data } = await api.delete(`/developer/keys/${id}`);
  return data;
}

// ─── Inbound ─────────────────────────────────────────────────────────────────
export interface InboundEndpoint {
  id: string;
  label: string;
  targetModule: ApiModuleId;
  defaultRefId: string | null;
  tokenPrefix: string;
  isActive: boolean;
  hits: number;
  lastUsedAt: string | null;
  lastStatusCode: number | null;
  createdAt: string;
  url: string | null;
}

export async function listInboundEndpoints(): Promise<InboundEndpoint[]> {
  const { data } = await api.get('/integrations/inbound');
  return data;
}

export async function createInboundEndpoint(body: {
  label?: string;
  targetModule: string;
  defaultRefId?: string | null;
}): Promise<InboundEndpoint> {
  const { data } = await api.post('/integrations/inbound', body);
  return data;
}

export async function updateInboundEndpoint(
  id: string,
  body: { label?: string; isActive?: boolean }
): Promise<InboundEndpoint> {
  const { data } = await api.patch(`/integrations/inbound/${id}`, body);
  return data;
}

export async function deleteInboundEndpoint(id: string) {
  const { data } = await api.delete(`/integrations/inbound/${id}`);
  return data;
}

// ─── Outbound ────────────────────────────────────────────────────────────────
export interface FieldMapping {
  targetPath: string;
  mode: FieldMappingMode;
  source?: string;
  value?: string;
  token?: string;
  dateFormat?: string;
}

export interface OutboundIntegration {
  id: string;
  name: string;
  sourceModule: ApiModuleId;
  triggerEvents: string[];
  triggerFilter: { listId?: string; stageId?: string } | null;
  authEnabled: boolean;
  authConfig: Record<string, unknown> | null;
  dataConfig: Record<string, unknown>;
  fieldMappings: FieldMapping[];
  successCheck: { path?: string; equals?: string } | null;
  isActive: boolean;
  lastStatus: string | null;
  lastStatusCode: number | null;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export async function listOutbound(): Promise<OutboundIntegration[]> {
  const { data } = await api.get('/integrations/outbound');
  return data;
}

export async function createOutbound(body: Record<string, unknown>): Promise<OutboundIntegration> {
  const { data } = await api.post('/integrations/outbound', body);
  return data;
}

export async function updateOutbound(
  id: string,
  body: Record<string, unknown>
): Promise<OutboundIntegration> {
  const { data } = await api.put(`/integrations/outbound/${id}`, body);
  return data;
}

export async function setOutboundActive(id: string, isActive: boolean) {
  const { data } = await api.patch(`/integrations/outbound/${id}`, { isActive });
  return data;
}

export async function deleteOutbound(id: string) {
  const { data } = await api.delete(`/integrations/outbound/${id}`);
  return data;
}

export async function testAuthCall(config: Record<string, unknown>) {
  const { data } = await api.post('/integrations/outbound/test-auth', config);
  return data as {
    ok: boolean;
    status: number;
    tokenPreview: string | null;
    hasSecondToken: boolean;
    candidatePaths: string[];
    responsePreview: string;
  };
}

export async function testOutbound(id: string) {
  const { data } = await api.post(`/integrations/outbound/${id}/test`);
  return data as { status: string; runId: string | null };
}

export interface OutboundRun {
  id: string;
  event: string;
  entityType: string;
  entityId: string | null;
  status: string;
  stage: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}

export async function listOutboundRuns(id: string): Promise<OutboundRun[]> {
  const { data } = await api.get(`/integrations/outbound/${id}/runs`);
  return data;
}
