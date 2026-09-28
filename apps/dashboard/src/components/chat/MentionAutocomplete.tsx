import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AtSign } from 'lucide-react';
import { orgService } from '../../lib/orgService';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { PresenceBadge } from './PresenceBadge';

type PresenceStatus = 'available' | 'busy' | 'away' | 'leave' | 'offline';
import { getInitials } from '../../utils/avatar';

const STATUS_RING: Record<string, string> = {
  available: 'ring-emerald-500',
  busy: 'ring-rose-500',
  away: 'ring-amber-500',
  leave: 'ring-sky-500',
  offline: 'ring-muted-foreground/30',
};

export interface MentionMember {
  id: string;
  userId?: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
}

interface UseMentionAutocompleteArgs {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  text: string;
  setText: (text: string) => void;
  afterInsert?: () => void;
}

/**
 * Shared @mention autocomplete (Bitrix-style popup with presence rings).
 * Detection: `@query` at string start or after whitespace, ≤25 chars.
 * Completion inserts a structured `@[Name](userId)` tag, which
 * MarkdownRenderer highlights. Enter/Tab completes, Esc dismisses.
 */
export function useMentionAutocomplete({
  textareaRef,
  text,
  setText,
  afterInsert,
}: UseMentionAutocompleteArgs) {
  const user = useAuthStore((state) => state.user);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [startIndex, setStartIndex] = useState(-1);
  const [activeIndex, setActiveIndex] = useState(0);

  const { data: members = [] } = useQuery({
    queryKey: ['org', 'members', 'mention', user?.organizationId, query],
    queryFn: () =>
      user?.organizationId
        ? orgService.getMembers(user.organizationId, { search: query, limit: 8 })
        : [],
    enabled: open && !!user?.organizationId,
    staleTime: 30_000,
  });

  const filteredMembers = useMemo(
    () => (members as MentionMember[]).filter((m) => (m.userId || m.id) !== user?.id),
    [members, user?.id]
  );

  const close = () => {
    setOpen(false);
    setQuery('');
    setStartIndex(-1);
    setActiveIndex(0);
  };

  const detect = (val: string, cursor: number) => {
    const before = val.slice(0, cursor);
    const match = before.match(/(?:^|\s)@([a-zA-Z0-9_.-]+(?: [a-zA-Z0-9_.-]+)?)$/);
    if (match && match[1].length <= 25) {
      setOpen(true);
      setQuery(match[1]);
      setStartIndex(before.lastIndexOf('@' + match[1]));
      setActiveIndex(0);
      return;
    }
    if (/(?:^|\s)@$/.test(before)) {
      setOpen(true);
      setQuery('');
      setStartIndex(before.lastIndexOf('@'));
      setActiveIndex(0);
      return;
    }
    close();
  };

  const insert = (member: MentionMember) => {
    const targetUserId = member.userId || member.id;
    const beforeAt = text.slice(0, startIndex);
    const afterCursor = text.slice(
      textareaRef.current?.selectionEnd || startIndex + query.length + 1
    );
    const tag = `@[${member.name}](${targetUserId}) `;
    const next = `${beforeAt}${tag}${afterCursor}`;
    setText(next);
    close();
    afterInsert?.();
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const pos = beforeAt.length + tag.length;
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 10);
  };

  /** Returns true when the key was consumed by the popup. */
  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open) return false;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return true;
    }
    if (filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filteredMembers.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filteredMembers.length) % filteredMembers.length);
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const chosen = filteredMembers[activeIndex];
        if (chosen) insert(chosen);
        return true;
      }
      return false;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      close();
    }
    return false;
  };

  return {
    open,
    query,
    members: filteredMembers,
    activeIndex,
    setActiveIndex,
    detect,
    insert,
    close,
    handleKey,
  };
}

export const MentionAutocompletePopup: React.FC<{
  members: MentionMember[];
  activeIndex: number;
  query: string;
  onSelect: (m: MentionMember) => void;
  onHover: (idx: number) => void;
}> = ({ members, activeIndex, query, onSelect, onHover }) => {
  const { presenceMap } = useChatStore();
  return (
    <div className="absolute z-50 bottom-full mb-2 left-3 right-3 rounded-xl border border-border bg-popover/95 backdrop-blur-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
      <div className="px-3 py-1.5 bg-muted/60 border-b border-border text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
        <span className="flex items-center gap-1">
          <AtSign className="w-3 h-3 text-primary" /> Mention teammate
        </span>
        <span className="text-[10px] text-muted-foreground/70">{members.length} found</span>
      </div>
      <div className="max-h-48 overflow-y-auto p-1 divide-y divide-border/20">
        {members.length === 0 ? (
          <div className="p-3 text-center text-xs text-muted-foreground italic">
            No teammate found matching &ldquo;{query}&rdquo;
          </div>
        ) : (
          members.map((m, idx) => {
            const uid = m.userId || m.id;
            const status = (presenceMap[uid]?.status || 'offline') as PresenceStatus;
            const selected = idx === activeIndex;
            return (
              <div
                key={uid}
                role="option"
                aria-selected={selected}
                className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  selected ? 'bg-primary/15 text-primary' : 'hover:bg-muted/60 text-foreground'
                }`}
                onClick={() => onSelect(m)}
                onMouseEnter={() => onHover(idx)}
              >
                <span className="relative shrink-0">
                  {m.avatarUrl ? (
                    <img
                      src={m.avatarUrl}
                      alt={m.name}
                      className={`w-6 h-6 rounded-full object-cover ring-2 ${STATUS_RING[status]}`}
                    />
                  ) : (
                    <span
                      className={`w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold ring-2 ${STATUS_RING[status]}`}
                    >
                      {getInitials(m.name)}
                    </span>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <PresenceBadge status={status} size="sm" />
                  </span>
                </span>
                <span className="text-xs font-semibold truncate flex-1">{m.name}</span>
                {m.email && (
                  <span className="text-[10px] text-muted-foreground truncate">{m.email}</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
