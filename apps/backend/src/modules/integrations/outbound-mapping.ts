import { DATE_FORMATS, type DateFormatId, type FieldMappingMode } from '@boardly/shared-types';

export interface FieldMapping {
  targetPath: string;
  mode: FieldMappingMode;
  /** CRM field dot path (crm_field). */
  source?: string;
  /** Literal value (static). */
  value?: string;
  /** Placeholder (auth_token). */
  token?: string;
  dateFormat?: DateFormatId;
}

export interface MappingContext {
  entity: Record<string, unknown>;
  authToken?: string | null;
  authToken2?: string | null;
}

/** Path segments that would reach or mutate an object's prototype. */
const UNSAFE_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

/** Dot-path read with array index support (`items.0.rate`). */
export function getPath(source: unknown, path: string): unknown {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc === null || acc === undefined || UNSAFE_SEGMENTS.has(segment)) return undefined;
    if (Array.isArray(acc)) {
      const index = Number(segment);
      return Number.isInteger(index) ? acc[index] : undefined;
    }
    if (typeof acc === 'object') return (acc as Record<string, unknown>)[segment];
    return undefined;
  }, source);
}

export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.replace(/\[\]/g, '.[]').split('.').filter(Boolean);
  assign(target, segments, value);
}

function assign(container: unknown, segments: string[], value: unknown): void {
  const [head, ...rest] = segments;
  if (!head) return;
  // A target path like `__proto__.polluted` must never walk or write through
  // Object.prototype (the mapping editor is admin-authored but still untrusted).
  if (UNSAFE_SEGMENTS.has(head) || UNSAFE_SEGMENTS.has(head.replace(/\[\]$/, ''))) return;

  if (head === '[]') {
    if (Array.isArray(container)) {
      if (rest.length === 0) container.push(value);
      else {
        if (container.length === 0) container.push({});
        for (const item of container) assign(item, rest, value);
      }
    }
    return;
  }

  if (!container || typeof container !== 'object' || Array.isArray(container)) return;
  const obj = container as Record<string, unknown>;

  if (head.endsWith('[]')) {
    const key = head.slice(0, -2);
    const arr = Array.isArray(obj[key]) ? (obj[key] as unknown[]) : [];
    obj[key] = arr;
    if (rest.length === 0) {
      arr.push(value);
      return;
    }
    if (arr.length === 0) arr.push({});
    for (const item of arr) assign(item, rest, value);
    return;
  }

  if (rest.length === 0) {
    obj[head] = value;
    return;
  }
  if (obj[head] === undefined) obj[head] = rest[0] === '[]' ? [] : {};
  assign(obj[head], rest, value);
}

/**
 * Flatten a pasted JSON schema into mapping target paths.
 * `{ items: [{ rate: 1 }] }` → `items[].rate`
 */
export function flattenJsonSchema(input: unknown, prefix = ''): string[] {
  if (Array.isArray(input)) {
    const base = prefix.endsWith('.') ? prefix.slice(0, -1) : prefix;
    if (input.length === 0) return base ? [`${base}[]`] : [];
    const first = input[0];
    // Array of objects: descend into the first item and suffix the segment
    // with `[]` so paths read `items[].rate`.
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return flattenJsonSchema(first, `${base}[].`);
    }
    return base ? [`${base}[]`] : [];
  }
  if (!input || typeof input !== 'object') return prefix ? [prefix] : [];
  const paths: string[] = [];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const path = `${prefix}${key}`;
    if (Array.isArray(value)) {
      paths.push(...flattenJsonSchema(value, path));
    } else if (value && typeof value === 'object') {
      paths.push(...flattenJsonSchema(value, `${path}.`));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

export function formatDateValue(value: unknown, format: DateFormatId = 'iso8601'): unknown {
  if (value === null || value === undefined || value === '') return value;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return value;
  if (format === 'iso8601') return date.toISOString();
  if (format === 'date') return date.toISOString().slice(0, 10);
  if (format === 'unix_seconds') return Math.floor(date.getTime() / 1000);
  if (format === 'unix_millis') return date.getTime();
  return value;
}

function coerceStatic(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

export function resolveMappingValue(mapping: FieldMapping, ctx: MappingContext): unknown {
  let value: unknown;
  if (mapping.mode === 'crm_field') value = getPath(ctx.entity, mapping.source || '');
  else if (mapping.mode === 'auth_token') {
    value = mapping.token === '{{auth_token_2}}' ? ctx.authToken2 : ctx.authToken;
  } else value = coerceStatic(mapping.value);

  if (mapping.dateFormat && mapping.dateFormat !== 'iso8601') {
    value = formatDateValue(value, mapping.dateFormat);
  }
  return value;
}

export function buildMappedPayload(
  mappings: FieldMapping[],
  ctx: MappingContext
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const mapping of mappings) {
    if (!mapping.targetPath) continue;
    const value = resolveMappingValue(mapping, ctx);
    if (value === undefined) continue;
    setPath(payload, mapping.targetPath, value);
  }
  return payload;
}

export function substituteAuthPlaceholders(
  text: string,
  tokens: { authToken?: string | null; authToken2?: string | null }
): string {
  return text
    .replaceAll('{{auth_token_2}}', tokens.authToken2 ?? '')
    .replaceAll('{{auth_token}}', tokens.authToken ?? '');
}

export function dateFormatLabel(id: DateFormatId): string {
  return DATE_FORMATS.find((f) => f.id === id)?.label ?? id;
}
