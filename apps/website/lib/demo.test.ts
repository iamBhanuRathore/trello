import { describe, expect, test } from 'bun:test';
import { SEED_BOARD, applyMove, templateToBoard, TEMPLATES } from './demo';

describe('applyMove', () => {
  test('reorders within the same column', () => {
    const next = applyMove(SEED_BOARD, 'c1', 'c3');
    expect(next.columns[0]!.cardIds).toEqual(['c2', 'c3', 'c1']);
  });

  test('moves across columns before the target card', () => {
    const next = applyMove(SEED_BOARD, 'c1', 'c5');
    expect(next.columns[0]!.cardIds).toEqual(['c2', 'c3']);
    expect(next.columns[1]!.cardIds).toEqual(['c4', 'c1', 'c5']);
  });

  test('dropping on a column appends to the end', () => {
    const next = applyMove(SEED_BOARD, 'c1', 'doing');
    expect(next.columns[0]!.cardIds).toEqual(['c2', 'c3']);
    expect(next.columns[1]!.cardIds).toEqual(['c4', 'c5', 'c1']);
  });

  test('unknown ids are a no-op', () => {
    expect(applyMove(SEED_BOARD, 'nope', 'c1')).toBe(SEED_BOARD);
    expect(applyMove(SEED_BOARD, 'c1', 'nope')).toBe(SEED_BOARD);
  });

  test('re-applying the same move is idempotent', () => {
    const once = applyMove(SEED_BOARD, 'c1', 'c5');
    const twice = applyMove(once, 'c1', 'c5');
    expect(twice.columns[1]!.cardIds).toEqual(once.columns[1]!.cardIds);
  });

  test('card count is preserved across moves', () => {
    const count = (b: typeof SEED_BOARD) => b.columns.reduce((s, c) => s + c.cardIds.length, 0);
    const total = count(SEED_BOARD);
    expect(count(applyMove(SEED_BOARD, 'c4', 'done'))).toBe(total);
    expect(count(applyMove(SEED_BOARD, 'c8', 'c1'))).toBe(total);
  });
});

describe('templateToBoard', () => {
  test('every template builds a valid board', () => {
    for (const t of TEMPLATES) {
      const b = templateToBoard(t);
      expect(b.columns.length).toBe(t.columns.length);
      const total = b.columns.reduce((s, c) => s + c.cardIds.length, 0);
      expect(total).toBeGreaterThan(0);
      expect(total).toBe(Object.keys(b.cards).length);
    }
  });
});
