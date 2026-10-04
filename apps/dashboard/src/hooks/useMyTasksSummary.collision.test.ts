import { describe, it, expect } from 'bun:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

/**
 * My Tasks counters rendered 0 while the API returned 32 assigned tasks.
 *
 * Cause: `pages/MyTasks.tsx` and `components/AppSidebar.tsx` both registered the
 * query key ['my-tasks','summary'] with their OWN queryFn and DIFFERENT return
 * shapes — the page returned `{ summary, total }`, the sidebar returned a bare
 * `summary`. TanStack keeps exactly one cache entry per key and one queryFn per
 * entry, so the last observer to mount decided the cached shape for BOTH. The
 * loser then read `undefined` off a correctly-populated response and every
 * counter hit its `?? 0` fallback. `placeholderData: prev => prev` preserved the
 * wrong shape across transitions instead of masking it.
 *
 * These tests drive real QueryObservers (no React/DOM needed) against the shared
 * key so the mechanism is demonstrated, not asserted in prose.
 */

const API_RESPONSE = {
  summary: {
    totalAssigned: 32,
    totalObserving: 0,
    totalParticipating: 1,
    totalCreated: 0,
    overdueCount: 4,
    dueSoonCount: 0,
    openAssignedCount: 32,
  },
  total: 32,
};

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
}

/** The shape `useMyTasksSummary` returns. */
const envelopeQueryFn = async () => ({
  summary: API_RESPONSE.summary,
  total: API_RESPONSE.total,
});

/** What AppSidebar used to register under the same key — a bare summary. */
const bareSummaryQueryFn = async () => API_RESPONSE.summary;

async function observe<T>(client: QueryClient, queryFn: () => Promise<T>) {
  const observer = new QueryObserver(client, {
    queryKey: ['my-tasks', 'summary'],
    queryFn,
  });
  const unsubscribe = observer.subscribe(() => {});
  await observer.refetch();
  return { observer, unsubscribe };
}

describe("['my-tasks','summary'] is a single shared cache entry", () => {
  it('two observers on one key share ONE entry, so the last queryFn wins', async () => {
    const client = makeClient();

    // Page mounts first with the envelope shape.
    const page = await observe(client, envelopeQueryFn);
    expect((page.observer.getCurrentResult().data as { total: number }).total).toBe(32);

    // Sidebar mounts second with a bare summary under the SAME key.
    const sidebar = await observe(client, bareSummaryQueryFn);

    // The page's cached value is now the sidebar's shape — its `total` is gone.
    const pageData = page.observer.getCurrentResult().data as Record<string, unknown>;
    expect(pageData).not.toHaveProperty('total');
    expect(pageData).toHaveProperty('totalAssigned');

    // Which is exactly why the page's `liveCounts?.total ?? 0` evaluated to 0.
    expect((pageData as { total?: number }).total ?? 0).toBe(0);

    page.unsubscribe();
    sidebar.unsubscribe();
  });

  it('one queryFn keeps both consumers on the same shape', async () => {
    const client = makeClient();

    // The fix: both call sites go through useMyTasksSummary, so there is only
    // ever one queryFn to disagree with itself.
    const page = await observe(client, envelopeQueryFn);
    const sidebar = await observe(client, envelopeQueryFn);

    interface Envelope {
      summary?: { totalAssigned: number; openAssignedCount: number };
      total: number;
    }

    // Structural, not QueryObserver<T>: the observer's generics are invariant in
    // TQueryData, so annotating it here fights the compiler for no extra safety.
    const summaryOf = (o: { observer: { getCurrentResult: () => { data: unknown } } }) =>
      o.observer.getCurrentResult().data as Envelope;

    // Page reads the union total and the per-set counters.
    expect(summaryOf(page).total).toBe(32);
    expect(summaryOf(page).summary?.totalAssigned).toBe(32);

    // Sidebar reads through the envelope rather than off a bare summary.
    expect(summaryOf(sidebar).summary?.openAssignedCount).toBe(32);

    page.unsubscribe();
    sidebar.unsubscribe();
  });

  it('a bare-summary reader cannot silently resolve to undefined on the real shape', async () => {
    const client = makeClient();
    const sidebar = await observe(client, envelopeQueryFn);

    // The exact expression AppSidebar would have used had it stayed on its own
    // queryFn after the page's shape won. Guards the regression from both sides.
    const data = sidebar.observer.getCurrentResult().data as {
      summary?: { openAssignedCount: number };
    };
    expect(data.summary?.openAssignedCount ?? 0).toBe(32);

    sidebar.unsubscribe();
  });
});
