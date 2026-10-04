import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * Counters for the My Tasks surface. Every field is optional because the
 * backend omits a relationship's block entirely when it has no rows — the zero
 * fallback belongs to the consumer, not to this type.
 */
export interface MyTasksSummary {
  totalAssigned?: number;
  totalObserving?: number;
  totalParticipating?: number;
  totalCreated?: number;
  overdueCount?: number;
  dueSoonCount?: number;
  openAssignedCount?: number;
}

/**
 * `summary` plus the union `total`. Both are needed: `total` is
 * `count(distinct cards.id)` across the four relationship sets, which is not
 * derivable from summing their sizes.
 */
export interface MyTasksSummaryEnvelope {
  summary?: MyTasksSummary;
  total: number;
}

/**
 * Single owner of the `['my-tasks','summary']` cache entry.
 *
 * Both the My Tasks page and the sidebar badge mount on every `/my-tasks`
 * render. They previously each declared this key with their OWN `queryFn` and
 * DIFFERENT return shapes — the page returned `{ summary, total }`, the sidebar
 * returned a bare `summary`. TanStack keeps one cache entry per key and one
 * `queryFn` per entry, so whichever observer mounted last decided the cached
 * shape for BOTH. The loser read `undefined` and every counter silently fell
 * back to `0` while the API response was correct — 32 assigned tasks rendered as
 * an empty page.
 *
 * Collapsing both call sites onto this one hook removes the second `queryFn`, so
 * the shape can no longer disagree with itself. Consumers destructure from the
 * envelope rather than re-deriving it.
 *
 * `limit=1` — only the counts envelope is read; the page's own list comes from
 * the separate `['my-tasks', …]` infinite query.
 */
export function useMyTasksSummary() {
  return useQuery<MyTasksSummaryEnvelope>({
    queryKey: ['my-tasks', 'summary'],
    queryFn: async () => {
      const res = await api.get('/cards/my-tasks?limit=1');
      return { summary: res.data?.summary, total: res.data?.total ?? 0 };
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}
