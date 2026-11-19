import { API_MODULES, countConfiguredModules, getApiModule } from '@boardly/shared-types';
import type { ApiKeyModuleScope } from './integrationsApi';

export interface ScopeDraft extends ApiKeyModuleScope {
  unlimited: boolean;
}

/** One row per catalogue module, nothing selected by default. */
export function emptyScopeDrafts(): ScopeDraft[] {
  return API_MODULES.map((m) => ({
    module: m.id,
    read: false,
    write: false,
    fields: null,
    hitLimit: null,
    unlimited: true,
  }));
}

export function toggleModuleScope(
  drafts: ScopeDraft[],
  module: string,
  action: 'read' | 'write',
  enabled: boolean
): ScopeDraft[] {
  return drafts.map((draft) => (draft.module === module ? { ...draft, [action]: enabled } : draft));
}

export function toggleModuleField(
  drafts: ScopeDraft[],
  module: string,
  fieldId: string,
  enabled: boolean
): ScopeDraft[] {
  return drafts.map((draft) => {
    if (draft.module !== module) return draft;
    const definition = getApiModule(module);
    const all = definition?.fields.map((f) => f.id) ?? [];
    const current = draft.fields ?? all;
    const next = enabled
      ? [...new Set([...current, fieldId])]
      : current.filter((f) => f !== fieldId);
    // Restrict only when there is a real subset; all-selected collapses to null.
    return { ...draft, fields: next.length === all.length ? null : next };
  });
}

export function configuredModuleCount(drafts: ScopeDraft[]): number {
  return countConfiguredModules(drafts);
}

/** Payload sent to POST /developer/keys. */
export function serializeScopeDrafts(drafts: ScopeDraft[]): ApiKeyModuleScope[] {
  return drafts
    .filter((d) => d.read || d.write)
    .map((d) => ({
      module: d.module,
      read: d.read,
      write: d.write,
      fields: d.fields,
      hitLimit: d.unlimited ? null : d.hitLimit,
    }));
}

export function isScopeValid(drafts: ScopeDraft[]): boolean {
  return serializeScopeDrafts(drafts).length > 0;
}

export function scopeChipsFor(drafts: ScopeDraft[]): string[] {
  return drafts.flatMap((d) => [
    ...(d.read ? [`${d.module}:read`] : []),
    ...(d.write ? [`${d.module}:write`] : []),
  ]);
}

/** Field-mapping rows generated from a pasted JSON schema. */
export function mappingRowsFromSchema(paths: string[]): Array<{
  targetPath: string;
  mode: 'crm_field';
  source: string;
}> {
  return paths.map((targetPath) => ({ targetPath, mode: 'crm_field', source: '' }));
}
