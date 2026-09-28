import { QueryClient } from '@tanstack/react-query';

// Single shared client (previously constructed inline in main.tsx) so
// non-component code — notably the auth store — can drop cached server state
// on identity change without prop-drilling the client through the tree.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute default stale time
      gcTime: 10 * 60 * 1000, // 10 minutes cache retention
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * Drop every cached query whenever the session identity changes or is
 * revoked (login, logout, expiry, account switch). Query keys are not
 * user-scoped, so without this the next account is served the previous
 * account's boards, tasks, and chat straight from cache — a cross-user data
 * leak. In-flight requests are cancelled first so their late responses can't
 * repopulate the fresh cache with the old identity's data.
 */
export function clearCachedData(): void {
  void queryClient.cancelQueries().catch(() => {});
  queryClient.clear();
}
