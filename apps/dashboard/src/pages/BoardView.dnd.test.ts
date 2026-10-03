import { describe, it, expect } from 'bun:test';
import { arrayMove } from '@dnd-kit/sortable';

/**
 * Board drag-and-drop (P2-3).
 *
 * Three defects, all in `pages/BoardView.tsx`:
 *
 *  1. The pre-drag snapshot lived in state, but `handleDragStart` returned early
 *     when `!canMoveCard` without setting it. A denied drag's `handleDragEnd`
 *     therefore read whatever the PREVIOUS drag had left there and restored that
 *     stale board.
 *  2. Cross-list drops landed one slot too far. `handleDragOver` already splices
 *     the card into the target list at the drop index, so on drop the card sits
 *     immediately BEFORE `over`; running `arrayMove` against `overIndex` pushed it
 *     one position further than the pointer intended.
 *  3. A failed move rolled back to the `['board','full']` query cache, which
 *     never had the optimistic move applied — discarding the move AND any
 *     concurrent realtime board update.
 *
 * The reorder decision is modelled here against the same `arrayMove` the page
 * uses, so the tests fail if the page's rule is inverted.
 */

interface Card {
  id: string;
  position: number;
  version?: number;
}

/** The page's rule: only reorder within a list; a cross-list move is already placed. */
function applyDrop(
  cards: Card[],
  activeId: string,
  overId: string,
  sourceListId: string | null,
  currentListId: string
): Card[] {
  const activeIndex = cards.findIndex((c) => c.id === activeId);
  const overIndex = cards.findIndex((c) => c.id === overId);
  const movedAcrossLists = sourceListId !== null && sourceListId !== currentListId;
  if (movedAcrossLists) return cards;
  if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return cards;
  return arrayMove(cards, activeIndex, overIndex);
}

/** Midpoint position, matching the page. */
function positionFor(cards: Card[], id: string): number {
  const i = cards.findIndex((c) => c.id === id);
  const prev = cards[i - 1];
  const next = cards[i + 1];
  if (!prev && !next) return 65536;
  if (!prev) return (next!.position || 65536) / 2;
  if (!next) return (prev.position || 0) + 65536;
  return ((prev.position || 0) + (next.position || 0)) / 2;
}

describe('cross-list drop lands where the pointer released', () => {
  const target: Card[] = [
    { id: 'a', position: 65536 },
    { id: 'b', position: 131072 },
    { id: 'c', position: 196608 },
  ];

  it('handleDragOver splices the card in immediately BEFORE the hovered card', () => {
    // This is the state handleDragOver leaves behind when dragging onto `b`.
    const dragged: Card = { id: 'x', position: 0 };
    const overIndex = target.findIndex((c) => c.id === 'b');
    const after = [...target];
    after.splice(overIndex, 0, dragged);

    expect(after.map((c) => c.id)).toEqual(['a', 'x', 'b', 'c']);
  });

  it('a cross-list drop does NOT run arrayMove (the old rule pushed it one too far)', () => {
    const afterOver = [
      { id: 'a', position: 65536 },
      { id: 'x', position: 0 },
      { id: 'b', position: 131072 },
      { id: 'c', position: 196608 },
    ];
    const result = applyDrop(afterOver, 'x', 'b', 'source-list', 'target-list');
    // Correct: 'x' stays where the drop put it.
    expect(result.map((c) => c.id)).toEqual(['a', 'x', 'b', 'c']);
  });

  it('the old unconditional arrayMove put the card in the wrong slot', () => {
    const afterOver = [
      { id: 'a', position: 65536 },
      { id: 'x', position: 0 },
      { id: 'b', position: 131072 },
      { id: 'c', position: 196608 },
    ];
    // arrayMove(x=1 -> b=2) yields the buggy ordering.
    const buggy = arrayMove(afterOver, 1, 2);
    expect(buggy.map((c) => c.id)).not.toEqual(['a', 'x', 'b', 'c']);
    // This is the regression the fix prevents.
    expect(buggy.map((c) => c.id)).toEqual(['a', 'b', 'x', 'c']);
  });

  it('a same-list drop still reorders', () => {
    const cards = [
      { id: 'a', position: 65536 },
      { id: 'b', position: 131072 },
      { id: 'c', position: 196608 },
    ];
    const result = applyDrop(cards, 'c', 'a', 'list-1', 'list-1');
    expect(result.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });

  it('a same-list drop onto itself is a no-op', () => {
    const cards = [
      { id: 'a', position: 65536 },
      { id: 'b', position: 131072 },
    ];
    expect(applyDrop(cards, 'a', 'a', 'list-1', 'list-1').map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('a cross-list drop into an empty list is accepted', () => {
    const empty: Card[] = [];
    // handleDragOver appends when the drop index is -1.
    const after = [...empty];
    after.splice(0, 0, { id: 'x', position: 0 });
    expect(applyDrop(after, 'x', 'x', 'src', 'dst').map((c) => c.id)).toEqual(['x']);
  });

  it('an unknown source list is treated as same-list rather than skipped', () => {
    // Defensive: dragSourceListRef is null when the card was not found at start.
    const cards = [
      { id: 'a', position: 65536 },
      { id: 'b', position: 131072 },
    ];
    expect(applyDrop(cards, 'a', 'b', null, 'list-1').map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('position derived from the final ordering', () => {
  it('computes a midpoint between neighbours', () => {
    const cards = [
      { id: 'a', position: 100 },
      { id: 'x', position: 0 },
      { id: 'b', position: 300 },
    ];
    expect(positionFor(cards, 'x')).toBe(200);
  });

  it('uses the standard gap when there is no previous sibling', () => {
    const cards = [
      { id: 'x', position: 0 },
      { id: 'b', position: 131072 },
    ];
    expect(positionFor(cards, 'x')).toBe(65536);
  });

  it('appends after the last sibling', () => {
    const cards = [
      { id: 'a', position: 65536 },
      { id: 'x', position: 0 },
    ];
    expect(positionFor(cards, 'x')).toBe(131072);
  });

  it('uses the default gap for a lone card', () => {
    expect(positionFor([{ id: 'x', position: 0 }], 'x')).toBe(65536);
  });

  it('stays between its neighbours after a cross-list drop', () => {
    const afterOver = [
      { id: 'a', position: 65536 },
      { id: 'x', position: 0 },
      { id: 'b', position: 131072 },
    ];
    const pos = positionFor(afterOver, 'x');
    expect(pos).toBeGreaterThan(afterOver[0]!.position);
    expect(pos).toBeLessThan(afterOver[2]!.position);
  });
});

describe('page source holds the fixed invariants', () => {
  // Prettier freely rewraps these expressions, so compare against a
  // whitespace-stripped copy rather than a line break that may move.
  const flat = (src: string) => src.replace(/\s+/g, '');
  const read = async () =>
    flat((await Bun.file(new URL('../pages/BoardView.tsx', import.meta.url)).text()) as string);

  it('captures the snapshot in a ref, unconditionally, at drag start', async () => {
    const src = await read();
    // The snapshot must be taken BEFORE the permission gate, otherwise a denied
    // drag reads a previous drag's leftover state.
    const startIdx = src.indexOf('consthandleDragStart');
    const endIdx = src.indexOf('consthandleDragOver');
    const body = src.slice(startIdx, endIdx);
    const snapAt = body.indexOf('dragSnapshotRef.current=lists');
    const gateAt = body.indexOf('if(!canMoveCard)return;');
    expect(snapAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(-1);
    expect(snapAt).toBeLessThan(gateAt);
  });

  it('no longer keeps the snapshot in state', async () => {
    const src = await read();
    expect(src.includes('clonedLists')).toBe(false);
    expect(src.includes('setClonedLists')).toBe(false);
  });

  it('skips arrayMove when the card moved across lists', async () => {
    const src = await read();
    expect(src.includes('movedAcrossLists')).toBe(true);
    expect(src.includes('if(!movedAcrossLists&&activeIndex!==-1')).toBe(true);
  });

  it('rolls back from the captured snapshot, not the query cache', async () => {
    const src = await read();
    const onErr = src.slice(src.indexOf('onErrorExtra'), src.indexOf('errorMessage:'));
    expect(flat(onErr).includes('setLists(variables.snapshot)')).toBe(true);
    expect(flat(onErr).includes('getQueryData')).toBe(false);
  });

  it('sets touch-action on the draggable so touch drag does not scroll', async () => {
    const src = await Bun.file(
      new URL('../components/board/kanban/SortableCard.tsx', import.meta.url)
    ).text();
    expect(flat(src)).toContain("touchAction:'none'");
  });
});
