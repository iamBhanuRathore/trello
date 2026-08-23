import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { orgService, type OrgMember } from '../../lib/orgService';
import { Search, X, Check, User, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@boardly/ui/button';

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
}

// Deterministic gradient generator for user avatars
const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600 text-white',
  'from-emerald-500 to-teal-600 text-white',
  'from-purple-500 to-pink-600 text-white',
  'from-amber-500 to-orange-600 text-white',
  'from-rose-500 to-red-600 text-white',
  'from-cyan-500 to-blue-600 text-white',
  'from-violet-500 to-purple-600 text-white',
  'from-fuchsia-500 to-pink-600 text-white',
  'from-teal-500 to-emerald-600 text-white',
  'from-indigo-500 to-cyan-600 text-white',
];

function getAvatarGradient(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = (hash << 5) - hash + identifier.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

function getInitials(name?: string, email?: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  if (email && email.trim().length > 0) {
    return email.substring(0, 2).toUpperCase();
  }
  return 'U';
}

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
}: MemberPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query for server-side lookup (200ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 200);
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

  // Query 1: Default organization members list
  const { data: defaultMembers = [], isLoading: isLoadingDefault } = useQuery({
    queryKey: ['orgMembers', orgId],
    queryFn: () => (orgId ? orgService.getMembers(orgId) : Promise.resolve([])),
    enabled: !!orgId,
  });

  // Query 2: Server-side search if debounced query is present (for orgs with thousands of members)
  const { data: searchResults, isFetching: isSearching } = useQuery({
    queryKey: ['orgMembersSearch', orgId, debouncedQuery],
    queryFn: () =>
      orgId
        ? orgService.getMembers(orgId, { search: debouncedQuery, limit: 50 })
        : Promise.resolve([]),
    enabled: !!orgId && debouncedQuery.length > 0,
  });

  // Combine and deduplicate members:
  // Instant in-memory filter on loaded members + Server results from search
  const membersToDisplay = useMemo(() => {
    if (!searchQuery.trim()) {
      return defaultMembers;
    }

    const queryLower = searchQuery.toLowerCase().trim();
    
    // Instant client filter
    const clientFiltered = defaultMembers.filter(
      (m: OrgMember) =>
        m.name?.toLowerCase().includes(queryLower) ||
        m.email?.toLowerCase().includes(queryLower)
    );

    if (!searchResults) {
      return clientFiltered;
    }

    // Merge server results with client filtered results (avoiding duplicates by userId)
    const map = new Map<string, OrgMember>();
    clientFiltered.forEach((m) => map.set(m.userId, m));
    searchResults.forEach((m) => map.set(m.userId, m));
    return Array.from(map.values());
  }, [defaultMembers, searchResults, searchQuery]);

  // Split into Assigned and Unassigned
  const { assignedMembers, unassignedMembers } = useMemo(() => {
    const assigned: OrgMember[] = [];
    const unassigned: OrgMember[] = [];

    membersToDisplay.forEach((m) => {
      if (assignedUserIds.has(m.userId)) {
        assigned.push(m);
      } else {
        unassigned.push(m);
      }
    });

    return { assignedMembers: assigned, unassignedMembers: unassigned };
  }, [membersToDisplay, assignedUserIds]);

  const isCurrentUserAssigned = currentUserId ? assignedUserIds.has(currentUserId) : false;
  const currentMember = defaultMembers.find((m) => m.userId === currentUserId);

  const handleToggle = (userId: string) => {
    if (mode === 'single') {
      if (assignedUserIds.has(userId)) {
        onRemove(userId);
      } else {
        onAssign(userId);
      }
      onClose();
      return;
    }
    if (assignedUserIds.has(userId)) {
      onRemove(userId);
    } else {
      onAssign(userId);
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full max-w-full rounded-2xl border border-border/80 bg-popover/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150 z-50 flex flex-col text-foreground mt-2"
    >
      {/* ─── Header ─── */}
      <div className="p-3 border-b border-border/70 flex items-center justify-between gap-2 bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            {title}
          </span>
          {defaultMembers.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
              {defaultMembers.length}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* ─── Search Bar ─── */}
      <div className="p-2.5 border-b border-border/50 bg-background/50">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3 text-muted-foreground pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full h-8 pl-8 pr-7 text-xs rounded-lg bg-muted/60 border border-input/60 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-muted-foreground/70 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-2 text-muted-foreground hover:text-foreground p-0.5"
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

      {/* ─── Quick Action: Assign to Me ─── */}
      {currentUserId && !isCurrentUserAssigned && currentMember && !searchQuery && (
        <div className="px-2.5 pt-2 pb-1 border-b border-border/40 bg-primary/5">
          <button
            type="button"
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors border border-primary/20"
            onClick={() => onAssign(currentUserId)}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>Assign to me</span>
            </div>
            <span className="text-[10px] text-primary/80 font-semibold uppercase">Quick</span>
          </button>
        </div>
      )}

      {/* ─── Member List ─── */}
      <div className="max-h-72 overflow-y-auto p-2 space-y-3 divide-y divide-border/30">
        {isLoadingDefault && defaultMembers.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Loading organization members...</span>
          </div>
        ) : membersToDisplay.length === 0 ? (
          <div className="p-6 text-center space-y-1.5">
            <User className="w-6 h-6 mx-auto text-muted-foreground/50" />
            <p className="text-xs font-medium text-foreground">No members found</p>
            <p className="text-[11px] text-muted-foreground">
              No team members match &ldquo;{searchQuery}&rdquo;
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-7 text-xs"
              onClick={() => setSearchQuery('')}
            >
              Clear search
            </Button>
          </div>
        ) : (
          <>
            {/* Section: Currently Assigned */}
            {assignedMembers.length > 0 && (
              <div className="space-y-1 pt-1 first:pt-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-0.5 flex items-center justify-between">
                  <span>Assigned ({assignedMembers.length})</span>
                </p>
                {assignedMembers.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    isAssigned={true}
                    onToggle={() => handleToggle(member.userId)}
                  />
                ))}
              </div>
            )}

            {/* Section: Unassigned / Other Members */}
            {unassignedMembers.length > 0 && (
              <div className="space-y-1 pt-2 first:pt-0">
                {assignedMembers.length > 0 && (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-0.5">
                    <span>Other Members ({unassignedMembers.length})</span>
                  </p>
                )}
                {unassignedMembers.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    isAssigned={false}
                    onToggle={() => handleToggle(member.userId)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Footer: Search Indicator / Stats ─── */}
      <div className="p-2 border-t border-border/50 bg-muted/20 flex items-center justify-between text-[10px] text-muted-foreground px-3">
        <span>
          {isSearching ? (
            <span className="inline-flex items-center gap-1 text-primary">
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> Searching server...
            </span>
          ) : (
            `Showing ${membersToDisplay.length} of ${defaultMembers.length || membersToDisplay.length} members`
          )}
        </span>
        <span className="text-muted-foreground/60 font-mono">Press Esc to close</span>
      </div>
    </div>
  );
}

interface MemberRowProps {
  member: OrgMember;
  isAssigned: boolean;
  onToggle: () => void;
}

function MemberRow({ member, isAssigned, onToggle }: MemberRowProps) {
  const initials = getInitials(member.name, member.email);
  const gradientClass = getAvatarGradient(member.name || member.email || member.userId);
  const roleTitle = formatRole(member.role);
  const roleBadgeClass = getRoleBadgeClass(member.role);

  return (
    <button
      type="button"
      className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-all group cursor-pointer ${
        isAssigned
          ? 'bg-primary/10 text-foreground border border-primary/25 shadow-xs'
          : 'hover:bg-muted/70 text-foreground border border-transparent'
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
              className="w-7 h-7 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <div
              className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradientClass} flex items-center justify-center text-[10px] font-bold shadow-xs`}
            >
              {initials}
            </div>
          )}
          {isAssigned && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary ring-1.5 ring-background flex items-center justify-center text-primary-foreground">
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
                className={`text-[9px] px-1 py-0.2 rounded border font-medium ${roleBadgeClass}`}
              >
                {roleTitle}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {member.email}
          </p>
        </div>
      </div>

      {/* Checkbox indicator */}
      <div className="shrink-0">
        <div
          className={`w-5 h-5 rounded-lg flex items-center justify-center transition-colors ${
            isAssigned
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'border border-border/80 group-hover:border-primary/60 group-hover:bg-primary/5 text-transparent group-hover:text-primary/40'
          }`}
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
        </div>
      </div>
    </button>
  );
}
