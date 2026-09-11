import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { orgService, type OrgMember } from '../lib/orgService';

export const MEMBER_PAGE_SIZE = 25;
const DEBOUNCE_MS = 250;

/**
 * Enterprise-scale org member search: debounced server-side filtering with
 * paginated infinite loading and react-query caching (2-min fresh, 5-min GC).
 * Never downloads the full directory — safe for orgs with thousands of members.
 */
export function useOrgMemberSearch(orgId?: string, pageSize: number = MEMBER_PAGE_SIZE) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useInfiniteQuery({
    queryKey: ['orgMembersSearch', orgId, debouncedSearch, pageSize],
    queryFn: ({ pageParam = 0 }) =>
      orgId
        ? orgService.getMembersWithCount(orgId, {
            search: debouncedSearch || undefined,
            limit: pageSize,
            offset: pageParam,
          })
        : Promise.resolve({ members: [], total: 0 }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetchedSoFar = allPages.reduce((acc, p) => acc + p.members.length, 0);
      if (fetchedSoFar >= lastPage.total || lastPage.members.length < pageSize) {
        return undefined;
      }
      return fetchedSoFar;
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const members: OrgMember[] = query.data?.pages.flatMap((p) => p.members) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  return {
    search,
    setSearch,
    debouncedSearch,
    members,
    total,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
