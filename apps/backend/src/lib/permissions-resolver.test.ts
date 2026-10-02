/**
 * permissions-resolver tests — pure logic, no DB required.
 * Run: bun test src/lib/permissions-resolver.test.ts
 */
import { describe, it, expect } from 'bun:test';
import {
  PERMISSION_ALIASES,
  PERMISSION_DENIED_CODE,
  permissionDenied,
  satisfiesPermission,
} from './permissions-resolver';
import { ALL_PERMISSION_KEYS } from '@boardly/shared-types';

describe('PERMISSION_ALIASES', () => {
  it('covers the backend alias cases and nothing else', () => {
    expect(Object.keys(PERMISSION_ALIASES).sort()).toEqual(
      ['board.archive', 'card.archive', 'card.move'].sort()
    );
  });

  it('only references keys from the registry', () => {
    const registry = new Set<string>(ALL_PERMISSION_KEYS);
    for (const [key, aliases] of Object.entries(PERMISSION_ALIASES)) {
      expect(registry.has(key)).toBe(true);
      for (const a of aliases) expect(registry.has(a)).toBe(true);
    }
  });
});

describe('satisfiesPermission', () => {
  it('grants exact keys', () => {
    expect(satisfiesPermission(new Set(['board.update']), 'board.update')).toBe(true);
    expect(satisfiesPermission(new Set(['board.read']), 'board.update')).toBe(false);
  });

  it('applies aliases any-of style', () => {
    expect(satisfiesPermission(new Set(['card.update']), 'card.move')).toBe(true);
    expect(satisfiesPermission(new Set(['card.move']), 'card.move')).toBe(true);
    expect(satisfiesPermission(new Set(['card.read']), 'card.move')).toBe(false);
    expect(satisfiesPermission(new Set(['card.delete']), 'card.archive')).toBe(true);
    expect(satisfiesPermission(new Set(['board.delete']), 'board.archive')).toBe(true);
  });

  it('fails closed on an empty set', () => {
    expect(satisfiesPermission(new Set(), 'board.read')).toBe(false);
    expect(satisfiesPermission(new Set(), 'card.move')).toBe(false);
  });
});

describe('permissionDenied', () => {
  it('carries the distinct machine-readable code plus the key', () => {
    const body = permissionDenied('board.update');
    expect(body.details.code).toBe(PERMISSION_DENIED_CODE);
    expect(body.details.permission).toBe('board.update');
    // details must stay an object — the dashboard parser treats arrays as
    // validation issues, and the backend validation formatter uses arrays.
    expect(Array.isArray(body.details)).toBe(false);
    expect(typeof body.error).toBe('string');
  });
});
