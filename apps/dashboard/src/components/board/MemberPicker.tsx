import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { orgService, type OrgMember } from '../../lib/orgService';
import { Search, X, Check, User, Sparkles, Loader2, Users } from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { getAvatarGradient, getInitials } from '../../utils/avatar';

interface MemberPickerProps {
  orgId?: string;
  assignedUserIds: Set<string>;
  onAssign: (userId: string) => void;
  onRemove: (userId: string) => void;
  onClose: () => void;
  currentUserId?: string;
  title?: string;
  mode?: 'single' | 'multiple';
  placeholder?: string;
  /**
   * Staged mode: row clicks only toggle a local selection — no API calls.
   * Footer shows Cancel + Submit; `onSubmit` receives the absolute staged
   * selection (ids + member directory for optimistic rows). Omit for the
   * legacy immediate per-click behavior.
   */
  onSubmit?: (selection: { ids: string[]; members: Map<string, OrgMember> }) => void;
  submitLabel?: string;
  isSubmitting?: boolean;
}

const PAGE_SIZE = 20;

function formatRole(role?: string): string {
  if (!role) return 'Member';
  switch (role) {
    case 'org_admin':
    case 'admin':
      return 'Admin';
    case 'billing_manager':
      return 'Billing';
    case 'workspace_admin':
      return 'Workspace Admin';
    case 'guest':
      return 'Guest';
    default:
      return 'Member';
  }
}

function getRoleBadgeClass(role?: string): string {
  switch (role) {
    case 'org_admin':
    case 'admin':
      return 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30';
    case 'workspace_admin':
      return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
    case 'billing_manager':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

export function MemberPicker({
  orgId,
  assignedUserIds,
  onAssign,
  onRemove,
  onClose,
  currentUserId,
  title = 'Assign Team Members',
  mode = 'multiple',
  placeholder = 'Search by name or email...',
  onSubmit,
  submitLabel = 'Save',
  isSubmitting = false,
}: MemberPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'selected' | 'admin' | 'member'>('all');

  // Staged mode: selection lives locally until Submit. The picker mounts fresh
  // on every open, so initializing once is correct; Escape/outside-click
  // discards the staged set without any API call.
  const isStaged = !!onSubmit;
  const [stagedIds, setStagedIds] = useState<Set<string>>(() => new Set(assignedUserIds));
  const effectiveIds = isStaged ? stagedIds : assignedUserIds;

  // Debounce search query for server-side lookup (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Close on Escape or click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Pinned query: Assigned members and current user are always fetched and preserved
  const pinnedUserIds = useMemo(() => {
    const ids = new Set<string>(effectiveIds);
    if (currentUserId) ids.add(currentUserId);
    return Array.from(ids);
  }, [effectiveIds, currentUserId]);

  const { data: pinnedMembers = [] } = useQuery({
    queryKey: ['pinnedOrgMembers', orgId, pinnedUserIds],
    queryFn: () =>
      orgId && pinnedUserIds.length > 0
        ? orgService.getMembers(orgId, { userIds: pinnedUserIds })
        : Promise.resolve([]),
    enabled: !!orgId && pinnedUserIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Server-Side Infinite Query for Paginated Progressive Loading
  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingMembers,
    isFetching,
  } = useInfiniteQuery({
    queryKey: ['orgMembersInfinite', orgId, debouncedQuery, roleFilter],
    queryFn: ({ pageParam = 0 }) =>
      orgId
        ? orgService.getMembersWithCount(orgId, {
            search: debouncedQuery || undefined,
            role: roleFilter === 'admin' ? 'admin' : roleFilter === 'member' ? 'member' : undefined,
            limit: PAGE_SIZE,
            offset: pageParam,
          })
        : Promise.resolve({ members: [], total: 0 }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetchedSoFar = allPages.reduce((acc, p) => acc + p.members.length, 0);
      if (fetchedSoFar >= lastPage.total || lastPage.members.length < PAGE_SIZE) {
        return undefined;
      }
      return fetchedSoFar;
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const totalServerCount = infiniteData?.pages[0]?.total ?? 0;
  const loadedMembers = useMemo(
    () => infiniteData?.pages.flatMap((page) => page.members) ?? [],
    [infiniteData]
  );

  // Consolidated member dictionary for fast lookups
  const memberMap = useMemo(() => {
    const map = new Map<string, OrgMember>();
    pinnedMembers.forEach((m) => map.set(m.userId, m));
    loadedMembers.forEach((m) => map.set(m.userId, m));
    return map;
  }, [pinnedMembers, loadedMembers]);

  // Split into Assigned and Unassigned
  const assignedMembers = useMemo(() => {
    const list: OrgMember[] = [];
    effectiveIds.forEach((uid) => {
      const m = memberMap.get(uid);
      if (m) {
        if (
          roleFilter === 'admin' &&
          !['admin', 'org_admin', 'org_owner', 'workspace_admin'].includes(m.role)
        ) {
          return;
        }
        if (roleFilter === 'member' && m.role !== 'member' && m.role) {
          return;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          if (!m.name?.toLowerCase().includes(q) && !m.email?.toLowerCase().includes(q)) {
            return;
          }
        }
        list.push(m);
      }
    });
    return list;
  }, [effectiveIds, memberMap, roleFilter, searchQuery]);

  const unassignedMembers = useMemo(() => {
    if (roleFilter === 'selected') return [];
    return loadedMembers.filter((m) => !effectiveIds.has(m.userId));
  }, [loadedMembers, effectiveIds, roleFilter]);

  const isCurrentUserAssigned = currentUserId ? effectiveIds.has(currentUserId) : false;
  const currentMember = memberMap.get(currentUserId || '');

  // Infinite scroll trigger when reaching bottom of container
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 60) {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }
  };

  const totalVisibleCount = assignedMembers.length + unassignedMembers.length;
  const remainingCount = Math.max(0, totalServerCount - totalVisibleCount);

  const handleToggle = (userId: string) => {
    if (mode === 'single') {
      if (effectiveIds.has(userId)) {
        onRemove(userId);
      } else {
        onAssign(userId);
      }
      onClose();
      return;
    }
    if (isStaged) {
      // Staged mode: toggle locally only — the batch API call happens on Submit.
      setStagedIds((prev) => {
        const next = new Set(prev);
        if (next.has(userId)) {
          next.delete(userId);
        } else {
          next.add(userId);
        }
        return next;
      });
      return;
    }
    if (effectiveIds.has(userId)) {
      onRemove(userId);
    } else {
      onAssign(userId);
    }
  };

  // Staged changes vs the committed selection (for the Submit label/count).
  const stagedChangeCount = (() => {
    if (!isStaged) return 0;
    let count = 0;
    stagedIds.forEach((id) => {
      if (!assignedUserIds.has(id)) count += 1;
    });
    assignedUserIds.forEach((id) => {
      if (!stagedIds.has(id)) count += 1;
    });
    return count;
  })();

  return (
    <div
      ref={containerRef}
      className="w-full max-w-full rounded-2xl border border-border/80 bg-popover/98 dark:bg-slate-900/98 backdrop-blur-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-50 flex flex-col text-foreground ring-1 ring-white/5"
    >
      {/* ─── Header ─── */}
      <div className="px-3.5 py-3 border-b border-border/50 flex items-center justify-between gap-2 bg-muted/20">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Users className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            {title}
          </span>
          {totalServerCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
              {totalServerCount}
            </span>
          )}
        </div>
        <button
          type="button"
          className="h-6 w-6 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          onClick={onClose}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ─── Search Bar ─── */}
      <div className="p-3 pb-2 border-b border-border/40 bg-background/30">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3 text-muted-foreground/80 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
            }}
            placeholder={placeholder}
            className="w-full h-8.5 pl-9 pr-7 text-xs rounded-xl bg-muted/40 hover:bg-muted/60 focus:bg-background border border-input/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 focus:outline-none placeholder:text-muted-foreground/60 transition-all text-foreground"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted/80 transition-colors cursor-pointer"
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Role & Selection Filter Chips ─── */}
      <div className="px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-border/30 bg-muted/10 text-xs">
        <button
          type="button"
          onClick={() => setRoleFilter('all')}
          className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer shrink-0 ${
            roleFilter === 'all'
              ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
              : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          All {totalServerCount > 0 && `(${totalServerCount})`}
        </button>

        {effectiveIds.size > 0 && (
          <button
            type="button"
            onClick={() => setRoleFilter('selected')}
            className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer shrink-0 ${
              roleFilter === 'selected'
                ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            Selected ({effectiveIds.size})
          </button>
        )}

        <button
          type="button"
          onClick={() => setRoleFilter('admin')}
          className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer shrink-0 ${
            roleFilter === 'admin'
              ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
              : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          Admins
        </button>

        <button
          type="button"
          onClick={() => setRoleFilter('member')}
          className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer shrink-0 ${
            roleFilter === 'member'
              ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
              : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          Members
        </button>
      </div>

      {/* ─── Quick Action: Assign to Me ─── */}
      {currentUserId &&
        !isCurrentUserAssigned &&
        currentMember &&
        !searchQuery &&
        roleFilter !== 'selected' && (
          <div className="px-3 pt-2 pb-0.5">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium text-primary bg-primary/10 hover:bg-primary/15 border border-primary/20 transition-all cursor-pointer group shadow-2xs"
              onClick={() => handleToggle(currentUserId)}
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Sparkles className="w-3 h-3 text-primary" />
                </div>
                <span className="font-semibold">Assign to me</span>
              </div>
              <span className="text-[10px] bg-primary/20 text-primary font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md">
                Quick
              </span>
            </button>
          </div>
        )}

      {/* ─── Member List ─── */}
      <div className="max-h-72 overflow-y-auto p-2 space-y-3" onScroll={handleScroll}>
        {isLoadingMembers && loadedMembers.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span>Loading team members...</span>
          </div>
        ) : assignedMembers.length === 0 && unassignedMembers.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground/60">
              <User className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-foreground">No members found</p>
            <p className="text-[11px] text-muted-foreground">
              {searchQuery
                ? `No team members match "${searchQuery}"`
                : `No members match the selected filter`}
            </p>
            {(searchQuery || roleFilter !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs rounded-lg cursor-pointer"
                onClick={() => {
                  setSearchQuery('');
                  setRoleFilter('all');
                }}
              >
                Reset filters
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Section: Currently Assigned */}
            {assignedMembers.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 px-2.5 py-0.5 flex items-center justify-between">
                  <span>Selected ({assignedMembers.length})</span>
                </p>
                <div className="space-y-1">
                  {assignedMembers.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      isAssigned={true}
                      mode={mode}
                      onToggle={() => handleToggle(member.userId)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Section: Unassigned / Other Members */}
            {unassignedMembers.length > 0 && (
              <div className="space-y-1">
                {assignedMembers.length > 0 && (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 px-2.5 pt-2 pb-0.5">
                    <span>Other Members ({unassignedMembers.length})</span>
                  </p>
                )}
                <div className="space-y-1">
                  {unassignedMembers.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      isAssigned={false}
                      mode={mode}
                      onToggle={() => handleToggle(member.userId)}
                    />
                  ))}
                </div>

                {/* Progressive server-side chunking */}
                {hasNextPage && (
                  <div className="pt-2 px-1">
                    <button
                      type="button"
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className="w-full py-1.5 px-3 rounded-xl text-xs font-semibold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-60"
                    >
                      {isFetchingNextPage ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Loading next page...</span>
                        </>
                      ) : (
                        <>
                          <span>Load next 20 members</span>
                          {remainingCount > 0 && (
                            <span className="text-[10px] text-muted-foreground font-normal">
                              ({remainingCount} remaining)
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  </div>
                )}

                {!hasNextPage && loadedMembers.length > 0 && (
                  <div className="pt-2 pb-1 text-center">
                    <span className="text-[10px] text-muted-foreground/70 font-medium">
                      All {totalServerCount} members loaded
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Footer: Submit (staged mode) + stats ─── */}
      {isStaged && (
        <div className="px-3 py-2 border-t border-border/50 bg-muted/15 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 flex-1 text-xs rounded-lg cursor-pointer"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 flex-1 text-xs font-semibold rounded-lg cursor-pointer"
            disabled={stagedChangeCount === 0 || isSubmitting}
            onClick={() => onSubmit?.({ ids: Array.from(stagedIds), members: memberMap })}
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
              </span>
            ) : stagedChangeCount > 0 ? (
              `${submitLabel} (${stagedChangeCount} change${stagedChangeCount === 1 ? '' : 's'})`
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      )}
      <div className="px-3.5 py-2 border-t border-border/50 bg-muted/15 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {isFetching && !isFetchingNextPage ? (
            <span className="inline-flex items-center gap-1.5 text-primary font-medium">
              <Loader2 className="w-3 h-3 animate-spin" /> Searching server...
            </span>
          ) : (
            <span>
              Showing <span className="font-semibold text-foreground">{totalVisibleCount}</span> of{' '}
              {totalServerCount} members
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/80">
          <span>Press</span>
          <kbd className="px-1.5 py-0.5 rounded-md bg-muted border border-border/70 text-[10px] font-mono text-foreground/80 shadow-2xs">
            Esc
          </kbd>
          <span>to close</span>
        </span>
      </div>
    </div>
  );
}

interface MemberRowProps {
  member: OrgMember;
  isAssigned: boolean;
  mode?: 'single' | 'multiple';
  onToggle: () => void;
}

function MemberRow({ member, isAssigned, mode = 'multiple', onToggle }: MemberRowProps) {
  const initials = getInitials(member.name, member.email);
  const gradientClass = getAvatarGradient(member.name || member.email || member.userId);
  const roleTitle = formatRole(member.role);
  const roleBadgeClass = getRoleBadgeClass(member.role);

  return (
    <button
      type="button"
      className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-all duration-150 group cursor-pointer ${
        isAssigned
          ? 'bg-primary/12 hover:bg-primary/18 text-foreground border border-primary/25 shadow-2xs'
          : 'hover:bg-muted/60 text-foreground border border-transparent'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2.5 min-w-0 pr-2">
        {/* Avatar */}
        <div className="relative shrink-0">
          {member.avatarUrl ? (
            <img
              src={member.avatarUrl}
              alt={member.name || member.email}
              className="w-7.5 h-7.5 rounded-full object-cover ring-1 ring-border/50"
            />
          ) : (
            <div
              className={`w-7.5 h-7.5 rounded-full bg-gradient-to-br ${gradientClass} flex items-center justify-center text-[10px] font-bold shadow-xs text-white`}
            >
              {initials}
            </div>
          )}
          {isAssigned && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary ring-1.5 ring-background flex items-center justify-center text-primary-foreground">
              <Check className="w-2 h-2 stroke-[3]" />
            </div>
          )}
        </div>

        {/* Member Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground truncate">
              {member.name || 'Unnamed Member'}
            </span>
            {roleTitle !== 'Member' && (
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded-md border font-medium ${roleBadgeClass}`}
              >
                {roleTitle}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground/80 truncate">{member.email}</p>
        </div>
      </div>

      {/* Selection indicator */}
      <div className="shrink-0 pl-1">
        {mode === 'single' ? (
          <div
            className={`w-4.5 h-4.5 rounded-full flex items-center justify-center transition-all ${
              isAssigned
                ? 'bg-primary text-primary-foreground shadow-xs scale-105'
                : 'border border-border/80 group-hover:border-primary/60 group-hover:bg-primary/5 text-transparent'
            }`}
          >
            {isAssigned && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
          </div>
        ) : (
          <div
            className={`w-4.5 h-4.5 rounded-md flex items-center justify-center transition-all ${
              isAssigned
                ? 'bg-primary text-primary-foreground shadow-xs scale-105'
                : 'border border-border/80 group-hover:border-primary/60 group-hover:bg-primary/5 text-transparent'
            }`}
          >
            {isAssigned && <Check className="w-3 h-3 stroke-[3]" />}
          </div>
        )}
      </div>
    </button>
  );
}
