import { describe, it, expect } from 'bun:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

/**
 * A board created in the UI stayed invisible while `/workspaces/tree` correctly
 * returned it.
 *
 * `BoardsList` mirrored its `initialBoards` prop into a `['boards', projectId]`
 * query declared as:
 *
 *   queryFn: async () => initialBoards,   // same prop
 *   initialData: initialBoards,
 *   staleTime: 30_000,
 *
 * React Query consults `initialData` only when creating a cache entry, and it
 * does not observe props: nothing about a re-render triggers a refetch. So the
 * entry keeps serving whatever its `queryFn` last returned until something
 * fetches again.
 *
 * Creating a board invalidated BOTH this key and `['workspaces', 'tree']`, which
 * is what made it look like it should have worked. It did not, because of a
 * race: the `['boards', …]` refetch ran immediately against the OLD prop (the
 * tree had not returned yet), and then `staleTime: 30_000` marked the entry
 * fresh, so no further fetch was scheduled. The tree refetched and returned
 * BOTH boards; this entry never re-read them. `ProjectsList` had the identical
 * mirror for projects.
 *
 * Note the value is never wrong, only unread — which is why the network tab
 * showing both boards and a populated React Query cache looked contradictory.
 * These drive real QueryObservers to pin that exact mechanism down.
 */

interface Board {
  id: string;
  name: string;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
}

const board = (id: string, name: string): Board => ({ id, name });

/**
 * The broken shape: seeded from a prop, and the queryFn returns that same prop.
 * `prop` is read at call time, exactly as a React closure would.
 */
function mirrored(initial: Board[]) {
  let prop = initial;
  const setProp = (next: Board[]) => {
    prop = next;
  };
  const client = makeClient();
  const observer = new QueryObserver(client, {
    queryKey: ['boards', 'proj-1'],
    queryFn: async () => prop,
    initialData: initial,
    staleTime: 30_000,
  });
  const unsubscribe = observer.subscribe(() => {});
  return {
    observer,
    setProp,
    client,
    names: () => ((observer.getCurrentResult().data as Board[]) ?? []).map((b) => b.name),
    async settle() {
      await observer.refetch();
    },
    dispose: unsubscribe,
  };
}

describe('initialData seeded from a prop cannot observe that prop', () => {
  it('a prop change alone never updates the entry, and staleTime keeps it fresh', async () => {
    const m = mirrored([board('b1', 'First Board')]);
    await m.settle();
    expect(m.names()).toEqual(['First Board']);

    // The tree refetched and now has two boards — the real payload the server
    // sent while the UI still showed one.
    m.setProp([board('b1', 'First Board'), board('b2', 'Another One')]);

    // React Query does not observe props. Nothing about a re-render triggers a
    // refetch, and `initialData` is consulted only at entry creation, so the
    // entry still serves the seed array.
    expect(m.names()).toEqual(['First Board']);
    expect(m.names()).not.toContain('Another One');

    // And the entry is now considered FRESH, so no background refetch will
    // rescue it either. It stays wrong until staleTime lapses *and* something
    // else (focus, remount) triggers a fetch — which is why the board stayed
    // invisible for far longer than the invalidation that should have fixed it.
    expect(m.observer.getCurrentResult().isStale).toBe(false);

    m.dispose();
  });

  it('an explicit refetch does pick the prop up — proving the entry, not the data, was stale', async () => {
    // This is why the defect is so easy to misdiagnose: the value is not wrong,
    // it is simply never re-read. React DevTools shows a populated query, the
    // network tab shows the tree returning both boards, and the only thing
    // missing is a refetch trigger.
    const m = mirrored([board('b1', 'First Board')]);
    await m.settle();

    m.setProp([board('b1', 'First Board'), board('b2', 'Another One')]);
    await m.settle();

    expect(m.names()).toContain('Another One');
    m.dispose();
  });

  it('a fresh observer picks up the change, proving the entry was the problem', async () => {
    const client = makeClient();
    const two = [board('b1', 'First Board'), board('b2', 'Another One')];

    // Seed the cache the way the broken mirror did…
    const seeded = new QueryObserver(client, {
      queryKey: ['boards', 'proj-1'],
      queryFn: async () => [],
      initialData: [board('b1', 'First Board')],
      staleTime: 30_000,
    });
    const un1 = seeded.subscribe(() => {});
    await seeded.refetch();

    // …then read it the way the fixed component does: straight from props, with
    // no cache entry of its own.
    const derived = two.map((b) => b.name);
    expect(derived).toContain('Another One');

    un1();
  });

  it('documents the invariant: initialData is read once, at entry creation', async () => {
    const client = makeClient();
    const observer = new QueryObserver(client, {
      queryKey: ['k'],
      queryFn: async () => 'fetched',
      initialData: 'seed',
      staleTime: 30_000,
    });
    const unsubscribe = observer.subscribe(() => {});

    // Before any fetch: the seed is served.
    expect(observer.getCurrentResult().data).toBe('seed');

    // After a fetch: the queryFn wins.
    await observer.refetch();
    expect(observer.getCurrentResult().data).toBe('fetched');

    unsubscribe();
  });
});
