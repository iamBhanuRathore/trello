import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { User as UserIcon, Check, Search } from 'lucide-react';
import { SearchableSelect, type SelectOption } from '@boardly/ui/searchable-select';
import { useOrgMemberSearch } from '../../hooks/useOrgMemberSearch';
import { orgService, type OrgMember } from '../../lib/orgService';

type DirectoryMember = Partial<Pick<OrgMember, 'id' | 'userId' | 'name' | 'email' | 'role'>> & {
  avatarUrl?: string | null;
};

function toOption(m: DirectoryMember, extra?: Partial<SelectOption>): SelectOption {
  const id = m.userId || m.id || '';
  return {
    value: id,
    label: m.name || m.email || 'Team Member',
    sublabel: m.email,
    avatarUrl: m.avatarUrl ?? undefined,
    ...extra,
  };
}

/**
 * Enterprise-scale member dropdown: server-side search (debounced) + infinite
 * scroll + cached pages. Renders the same rows as MemberSearchableSelect but
 * never downloads the full org directory.
 */
export function AsyncMemberSearchableSelect({
  orgId,
  currentUser,
  value,
  onChange,
  allowUnassigned = true,
  placeholder = 'Assign member...',
  size = 'default',
  className,
  triggerClassName,
  pinnedIds = [],
}: {
  orgId?: string;
  currentUser?: any;
  value?: string;
  onChange: (userId: string) => void;
  allowUnassigned?: boolean;
  placeholder?: string;
  size?: 'sm' | 'default';
  className?: string;
  triggerClassName?: string;
  /** Ids that must always resolve (e.g. the current selection) — one cached lookup. */
  pinnedIds?: string[];
}) {
  const { setSearch, members, total, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useOrgMemberSearch(orgId);

  // Pinned lookup: the current selection always resolves a label even when it
  // lives outside the loaded pages (single cached request, same as MemberPicker).
  const { data: pinnedMembers = [] } = useQuery({
    queryKey: ['pinnedOrgMembers', orgId, pinnedIds],
    queryFn: () =>
      orgId && pinnedIds.length > 0
        ? orgService.getMembers(orgId, { userIds: pinnedIds })
        : Promise.resolve([]),
    enabled: !!orgId && pinnedIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const options: SelectOption[] = useMemo(() => {
    const list: SelectOption[] = [];
    if (allowUnassigned) {
      list.push({
        value: '',
        label: 'Unassigned',
        icon: <UserIcon className="w-3.5 h-3.5 opacity-50" />,
      });
    }
    if (currentUser?.id) {
      list.push(
        toOption(
          {
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
            avatarUrl: currentUser.avatarUrl,
          },
          {
            label: `Assign to Me (${currentUser.name || currentUser.email})`,
            badge: (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-primary/20 text-primary border border-primary/30">
                You
              </span>
            ),
          }
        )
      );
    }
    for (const m of members) {
      const id = m.userId || m.id;
      if (!id || id === currentUser?.id) continue;
      if (list.some((o) => o.value === id)) continue;
      list.push(
        toOption(m, {
          badge: m.role ? (
            <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-muted text-muted-foreground border border-border">
              {m.role}
            </span>
          ) : undefined,
        })
      );
    }
    for (const m of pinnedMembers) {
      const id = m.userId || m.id;
      if (!id || list.some((o) => o.value === id)) continue;
      list.push(toOption(m));
    }
    return list;
  }, [members, pinnedMembers, currentUser, allowUnassigned]);

  return (
    <SearchableSelect
      options={options}
      value={value || ''}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="Search by name, email, or role..."
      size={size}
      className={className}
      triggerClassName={triggerClassName}
      onSearchChange={setSearch}
      isLoadingOptions={isLoading}
      isLoadingMore={isFetchingNextPage}
      onReachEnd={() => {
        if (hasNextPage) fetchNextPage();
      }}
      footer={
        total > options.length ? (
          <div className="py-1.5 px-3 text-center text-[10px] text-muted-foreground border-t border-border/50">
            Showing {options.length} of {total.toLocaleString()} — keep typing to narrow
          </div>
        ) : undefined
      }
    />
  );
}

/**
 * Enterprise-scale multi-pick member list for Participants / Observers:
 * debounced server search, paginated, selected chips pinned on top.
 */
export function AsyncMemberChipPicker({
  orgId,
  selectedIds,
  onToggle,
  emptyText = 'No team members found.',
}: {
  orgId?: string;
  selectedIds: string[];
  onToggle: (id: string) => void;
  emptyText?: string;
}) {
  const {
    search,
    setSearch,
    members,
    total,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useOrgMemberSearch(orgId);

  // Pinned: selections stay visible even when a later search filters them out.
  const { data: pinnedMembers = [] } = useQuery({
    queryKey: ['pinnedOrgMembers', orgId, selectedIds],
    queryFn: () =>
      orgId && selectedIds.length > 0
        ? orgService.getMembers(orgId, { userIds: selectedIds })
        : Promise.resolve([]),
    enabled: !!orgId && selectedIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visible = useMemo(() => {
    const byId = new Map<string, (typeof members)[number]>();
    for (const m of [...pinnedMembers, ...members]) byId.set(m.userId || m.id, m);
    const all = [...byId.values()];
    const selected = all.filter((m) => selectedSet.has(m.userId || m.id));
    const rest = all.filter((m) => !selectedSet.has(m.userId || m.id));
    return [...selected, ...rest];
  }, [members, pinnedMembers, selectedSet]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-input bg-background">
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members..."
          className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div
        className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-0.5"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 48 && hasNextPage) {
            fetchNextPage();
          }
        }}
      >
        {isLoading && visible.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Searching…</p>
        ) : visible.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">{emptyText}</p>
        ) : (
          visible.map((m) => {
            const id = m.userId || m.id;
            const selected = selectedSet.has(id);
            const label = m.name || m.email || 'Team Member';
            return (
              <button
                key={id}
                type="button"
                onClick={() => onToggle(id)}
                title={m.email}
                className={`pl-1 pr-2 py-1 rounded-full text-[11px] font-medium flex items-center gap-1.5 border transition-all cursor-pointer ${
                  selected
                    ? 'bg-primary/10 text-primary border-primary/40'
                    : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground hover:bg-muted/70'
                }`}
              >
                {m.avatarUrl ? (
                  <img
                    src={m.avatarUrl}
                    alt={label}
                    className="w-5 h-5 rounded-full object-cover ring-1 ring-border"
                  />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">
                    {label.substring(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="truncate max-w-[110px]">{label}</span>
                {selected && <Check className="w-3 h-3 shrink-0" />}
              </button>
            );
          })
        )}
        {isFetchingNextPage && (
          <p className="text-[11px] text-muted-foreground w-full">Loading more…</p>
        )}
      </div>
      {total > members.length && (
        <p className="text-[10px] text-muted-foreground">
          Showing {members.length} of {total.toLocaleString()} — search to narrow
        </p>
      )}
    </div>
  );
}
