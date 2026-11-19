import {
  getApiModule,
  resolveAllowedFields,
  type ApiModuleField,
  type ApiModuleId,
} from '@boardly/shared-types';
import { httpError } from '../../lib/errors';

export interface ModuleScope {
  module: string;
  read: boolean;
  write: boolean;
  fields: string[] | null;
  hitLimit: number | null;
}

export function readFields(moduleId: ApiModuleId, scopes: ModuleScope[]): Set<string> {
  const scope = scopes.find((s) => s.module === moduleId);
  return new Set(resolveAllowedFields(moduleId, scope?.fields, 'read'));
}

export function writeFields(moduleId: ApiModuleId, scopes: ModuleScope[]): Set<string> {
  const scope = scopes.find((s) => s.module === moduleId);
  return new Set(resolveAllowedFields(moduleId, scope?.fields, 'write'));
}

/** Strip every field the key isn't allowed to see. */
export function pickAllowed<T extends Record<string, unknown>>(
  row: T,
  allowed: Set<string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    if (allowed.has(key)) out[key] = row[key];
  }
  return out;
}

function assertValue(field: ApiModuleField, value: unknown) {
  if (value === null) return;
  switch (field.type) {
    case 'string':
    case 'text':
      if (typeof value !== 'string') throw httpError(422, `${field.id} must be a string`);
      return;
    case 'uuid':
      if (
        typeof value !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
      ) {
        throw httpError(422, `${field.id} must be a UUID`);
      }
      return;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw httpError(422, `${field.id} must be a number`);
      }
      return;
    case 'boolean':
      if (typeof value !== 'boolean') throw httpError(422, `${field.id} must be a boolean`);
      return;
    case 'date':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw httpError(422, `${field.id} must be a date string`);
      }
      return;
    case 'datetime':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw httpError(422, `${field.id} must be an ISO date-time string`);
      }
      return;
  }
}

/**
 * Validate a write body against the catalogue and the key's field allowlist.
 * Unknown, read-only, or out-of-scope fields are rejected with 422 instead of
 * being silently dropped, so integrators get a real signal.
 */
export function validateWriteBody(
  moduleId: ApiModuleId,
  body: unknown,
  allowed: Set<string>,
  mode: 'create' | 'update'
): Record<string, unknown> {
  const definition = getApiModule(moduleId);
  if (!definition) throw httpError(422, `Unknown module: ${moduleId}`);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(422, 'Request body must be a JSON object');
  }
  const input = body as Record<string, unknown>;
  const fieldMap = new Map(definition.fields.map((f) => [f.id, f]));
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    const field = fieldMap.get(key);
    if (!field) throw httpError(422, `Unknown field: ${key}`);
    if (field.readOnly) throw httpError(422, `Field is read-only: ${key}`);
    if (!allowed.has(key)) throw httpError(422, `Field is not permitted by this key: ${key}`);
    assertValue(field, value);
    if (field.type === 'datetime' && typeof value === 'string') {
      out[key] = new Date(value);
    } else {
      out[key] = value;
    }
  }

  if (mode === 'create') {
    for (const field of definition.fields) {
      if (!field.requiredOnCreate) continue;
      const value = out[field.id];
      if (value === undefined || value === null || value === '') {
        throw httpError(422, `Missing required field: ${field.id}`);
      }
    }
  } else if (Object.keys(out).length === 0) {
    throw httpError(422, 'No writable fields supplied');
  }
  return out;
}
