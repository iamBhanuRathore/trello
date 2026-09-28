import { httpError } from './errors';

export interface BoundedJsonOptions {
  maxDepth?: number;
  maxKeys?: number;
  maxStringLength?: number;
  maxArrayLength?: number;
  maxBytes?: number;
}

const DEFAULTS = {
  maxDepth: 8,
  maxKeys: 500,
  maxStringLength: 10_000,
  maxArrayLength: 500,
  maxBytes: 1_000_000,
} as const;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Bounds on free-form JSON ingestion (automation rules, intake forms, Trello
 * imports). Rejects prototype-pollution keys, runaway depth/breadth, and
 * oversized strings — iterative walk, no recursion blowup.
 * Throws 400 httpError on violation.
 */
export function assertBoundedJson(value: unknown, opts: BoundedJsonOptions = {}): void {
  const { maxDepth, maxKeys, maxStringLength, maxArrayLength, maxBytes } = {
    ...DEFAULTS,
    ...opts,
  };
  let bytes = 0;
  let keys = 0;
  const stack: Array<{ node: unknown; depth: number }> = [{ node: value, depth: 0 }];
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (depth > maxDepth) throw httpError(400, 'JSON exceeds maximum nesting depth');
    if (node === null || node === undefined) continue;
    const t = typeof node;
    if (t === 'string') {
      bytes += (node as string).length;
      if ((node as string).length > maxStringLength) {
        throw httpError(400, 'JSON string exceeds maximum length');
      }
    } else if (t === 'number' || t === 'boolean') {
      bytes += 8;
    } else if (Array.isArray(node)) {
      if (node.length > maxArrayLength) throw httpError(400, 'JSON array too large');
      for (let i = node.length - 1; i >= 0; i--) stack.push({ node: node[i], depth: depth + 1 });
    } else if (t === 'object') {
      const entries = Object.entries(node as Record<string, unknown>);
      keys += entries.length;
      if (keys > maxKeys) throw httpError(400, 'JSON object has too many keys');
      for (const [k, v] of entries) {
        if (FORBIDDEN_KEYS.has(k)) throw httpError(400, 'Forbidden JSON key');
        bytes += k.length;
        stack.push({ node: v, depth: depth + 1 });
      }
    }
    if (bytes > maxBytes) throw httpError(400, 'JSON payload too large');
  }
}
