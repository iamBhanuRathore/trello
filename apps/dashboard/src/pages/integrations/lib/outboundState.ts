import {
  getApiModule,
  getOutboundTriggers,
  type ApiModuleId,
  type DateFormatId,
  type FieldMappingMode,
} from '@boardly/shared-types';

export interface MappingDraft {
  targetPath: string;
  mode: FieldMappingMode;
  source: string;
  value: string;
  token: string;
  dateFormat: DateFormatId;
}

export interface OutboundDraft {
  name: string;
  sourceModule: ApiModuleId;
  triggerEvents: string[];
  triggerFilter: { listId?: string; stageId?: string };
  authEnabled: boolean;
  authConfig: {
    url: string;
    method: 'POST' | 'GET';
    headers: string;
    body: string;
    tokenPath: string;
    token2Path: string;
    ttlSeconds: number;
  };
  dataConfig: {
    url: string;
    method: 'POST' | 'PUT' | 'PATCH';
    headers: string;
    bodyTemplate: string;
  };
  fieldMappings: MappingDraft[];
  successCheck: { path: string; equals: string };
  isActive: boolean;
}

export function emptyMapping(targetPath = ''): MappingDraft {
  return {
    targetPath,
    mode: 'crm_field',
    source: '',
    value: '',
    token: '{{auth_token}}',
    dateFormat: 'iso8601',
  };
}

export function emptyOutboundDraft(): OutboundDraft {
  return {
    name: '',
    sourceModule: 'cards',
    triggerEvents: ['card.created'],
    triggerFilter: {},
    authEnabled: false,
    authConfig: {
      url: '',
      method: 'POST',
      headers: '',
      body: '{}',
      tokenPath: '',
      token2Path: '',
      ttlSeconds: 300,
    },
    dataConfig: { url: '', method: 'POST', headers: '', bodyTemplate: '' },
    fieldMappings: [],
    successCheck: { path: '', equals: '' },
    isActive: true,
  };
}

/** Hydrate an existing integration (as returned by the API) into form state. */
export function draftFromIntegration(input: {
  name: string;
  sourceModule: ApiModuleId;
  triggerEvents: string[];
  triggerFilter: { listId?: string; stageId?: string } | null;
  authEnabled: boolean;
  authConfig: Record<string, unknown> | null;
  dataConfig: Record<string, unknown>;
  fieldMappings: ReadonlyArray<{
    targetPath?: unknown;
    mode?: unknown;
    source?: unknown;
    value?: unknown;
    token?: unknown;
    dateFormat?: unknown;
  }>;
  successCheck: { path?: string; equals?: string } | null;
  isActive: boolean;
}): OutboundDraft {
  const auth = (input.authConfig ?? {}) as Record<string, unknown>;
  const data = (input.dataConfig ?? {}) as Record<string, unknown>;
  return {
    name: input.name,
    sourceModule: input.sourceModule,
    triggerEvents: input.triggerEvents ?? [],
    triggerFilter: input.triggerFilter ?? {},
    authEnabled: input.authEnabled,
    authConfig: {
      url: String(auth.url ?? ''),
      method: (auth.method === 'GET' ? 'GET' : 'POST') as 'POST' | 'GET',
      headers: headersToText(auth.headers),
      body: String(auth.body ?? '{}'),
      tokenPath: String(auth.tokenPath ?? ''),
      token2Path: String(auth.token2Path ?? ''),
      ttlSeconds: Number(auth.ttlSeconds ?? 300),
    },
    dataConfig: {
      url: String(data.url ?? ''),
      method: (['PUT', 'PATCH'].includes(String(data.method)) ? data.method : 'POST') as
        'POST' | 'PUT' | 'PATCH',
      headers: headersToText(data.headers),
      bodyTemplate: String(data.bodyTemplate ?? ''),
    },
    fieldMappings: (input.fieldMappings ?? []).map((mapping) => ({
      targetPath: String(mapping.targetPath ?? ''),
      mode: (mapping.mode ?? 'crm_field') as FieldMappingMode,
      source: String(mapping.source ?? ''),
      value: String(mapping.value ?? ''),
      token: String(mapping.token ?? '{{auth_token}}'),
      dateFormat: (mapping.dateFormat ?? 'iso8601') as DateFormatId,
    })),
    successCheck: {
      path: String(input.successCheck?.path ?? ''),
      equals: String(input.successCheck?.equals ?? ''),
    },
    isActive: input.isActive,
  };
}

function headersToText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  return Object.entries(value as Record<string, unknown>)
    .map(([key, val]) => `${key}: ${String(val)}`)
    .join('\n');
}

export function parseHeaders(text: string): Record<string, string> | undefined {
  const entries = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf(':');
      if (index === -1) return null;
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()] as const;
    })
    .filter((entry): entry is readonly [string, string] => !!entry && !!entry[0]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/** Backend payload. Empty optional sections are omitted, not sent as blanks. */
export function serializeOutboundDraft(draft: OutboundDraft): Record<string, unknown> {
  const headers = parseHeaders(draft.dataConfig.headers);
  const authHeaders = parseHeaders(draft.authConfig.headers);
  return {
    name: draft.name.trim(),
    sourceModule: draft.sourceModule,
    triggerEvents: draft.triggerEvents,
    triggerFilter:
      draft.triggerFilter.listId || draft.triggerFilter.stageId
        ? {
            ...(draft.triggerFilter.listId ? { listId: draft.triggerFilter.listId } : {}),
            ...(draft.triggerFilter.stageId ? { stageId: draft.triggerFilter.stageId } : {}),
          }
        : null,
    authEnabled: draft.authEnabled,
    authConfig: draft.authEnabled
      ? {
          url: draft.authConfig.url.trim(),
          method: draft.authConfig.method,
          ...(authHeaders ? { headers: authHeaders } : {}),
          ...(draft.authConfig.body.trim() ? { body: draft.authConfig.body } : {}),
          tokenPath: draft.authConfig.tokenPath.trim(),
          ...(draft.authConfig.token2Path.trim()
            ? { token2Path: draft.authConfig.token2Path.trim() }
            : {}),
          ttlSeconds: draft.authConfig.ttlSeconds,
        }
      : null,
    dataConfig: {
      url: draft.dataConfig.url.trim(),
      method: draft.dataConfig.method,
      ...(headers ? { headers } : {}),
      ...(draft.dataConfig.bodyTemplate.trim()
        ? { bodyTemplate: draft.dataConfig.bodyTemplate }
        : {}),
    },
    fieldMappings: draft.fieldMappings
      .filter((mapping) => mapping.targetPath.trim())
      .map((mapping) => ({
        targetPath: mapping.targetPath.trim(),
        mode: mapping.mode,
        ...(mapping.mode === 'crm_field' ? { source: mapping.source.trim() } : {}),
        ...(mapping.mode === 'static' ? { value: mapping.value } : {}),
        ...(mapping.mode === 'auth_token' ? { token: mapping.token } : {}),
        ...(mapping.dateFormat !== 'iso8601' ? { dateFormat: mapping.dateFormat } : {}),
      })),
    successCheck: draft.successCheck.path.trim()
      ? {
          path: draft.successCheck.path.trim(),
          ...(draft.successCheck.equals ? { equals: draft.successCheck.equals } : {}),
        }
      : null,
    isActive: draft.isActive,
  };
}

/** First blocking problem, or null when the draft can be submitted. */
export function validateOutboundDraft(draft: OutboundDraft): string | null {
  if (!draft.name.trim()) return 'Give the integration a name';
  if (draft.triggerEvents.length === 0) return 'Select at least one trigger event';
  if (!draft.dataConfig.url.trim()) return 'Data call URL is required';
  if (!isUrl(draft.dataConfig.url)) return 'Data call URL must be a valid URL';
  if (draft.authEnabled) {
    if (!draft.authConfig.url.trim()) return 'Auth call URL is required';
    if (!isUrl(draft.authConfig.url)) return 'Auth call URL must be a valid URL';
    if (!draft.authConfig.tokenPath.trim()) return 'Token path is required';
  }
  for (const mapping of draft.fieldMappings) {
    if (!mapping.targetPath.trim()) return 'Remove empty mapping rows or fill their target path';
    if (mapping.mode === 'crm_field' && !mapping.source.trim()) {
      return `Pick a CRM field for "${mapping.targetPath}"`;
    }
  }
  return null;
}

function isUrl(value: string): boolean {
  try {
    new URL(value.trim());
    return true;
  } catch {
    return false;
  }
}

export function toggleTrigger(
  draft: OutboundDraft,
  eventId: string,
  enabled: boolean
): OutboundDraft {
  const next = enabled
    ? [...new Set([...draft.triggerEvents, eventId])]
    : draft.triggerEvents.filter((e) => e !== eventId);
  return { ...draft, triggerEvents: next };
}

/** Switching source module resets triggers (they belong to the module). */
export function setSourceModule(draft: OutboundDraft, module: ApiModuleId): OutboundDraft {
  const defaults = getOutboundTriggers(module);
  return {
    ...draft,
    sourceModule: module,
    triggerEvents: defaults.length ? [defaults[0]!.id] : [],
    triggerFilter: {},
  };
}

export function supportsMoveFilter(draft: OutboundDraft): boolean {
  return getOutboundTriggers(draft.sourceModule).some(
    (trigger) => trigger.supportsMoveFilter && draft.triggerEvents.includes(trigger.id)
  );
}

export function crmFieldOptions(module: ApiModuleId) {
  return getApiModule(module)?.fields ?? [];
}

export function triggerLabel(module: ApiModuleId, eventId: string): string {
  return getOutboundTriggers(module).find((trigger) => trigger.id === eventId)?.label ?? eventId;
}
