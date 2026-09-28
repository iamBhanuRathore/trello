import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, AtSign, Loader2 } from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { orgService } from '../../lib/orgService';
import { useAuthStore } from '../../store/authStore';
import { Kbd } from '../ui/Kbd';
import { formatShortcut } from '../../lib/platform';

interface MentionCommentBoxProps {
  onSubmit: (body: string, mentionedUserIds: string[]) => Promise<void> | void;
  isSubmitting?: boolean;
  placeholder?: string;
}

export function MentionCommentBox({
  onSubmit,
  isSubmitting = false,
  placeholder,
}: MentionCommentBoxProps) {
  const effectivePlaceholder =
    placeholder ||
    `Write a comment... (Type @ to tag a teammate, ${formatShortcut('mod+enter')} to post)`;
  const user = useAuthStore((state) => state.user);
  const orgId = user?.organizationId;

  const [text, setText] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedMentionIds, setSelectedMentionIds] = useState<Set<string>>(new Set());

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Query members with search
  const { data: members = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: ['org-members-mention', orgId, mentionQuery],
    queryFn: () => (orgId ? orgService.getMembers(orgId, { search: mentionQuery, limit: 10 }) : []),
    enabled: !!orgId && showMentionMenu,
    staleTime: 1000 * 60,
  });

  // Filter out current logged in user from mention suggestions if preferred
  const filteredMembers = members.slice(0, 8);

  useEffect(() => {
    setSelectedIndex(0);
  }, [mentionQuery, members]);

  // Handle text change and detect @
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    setText(val);

    // Look for active @mention trigger immediately preceding the cursor
    const textBeforeCursor = val.slice(0, cursor);
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_.-]+(?: [a-zA-Z0-9_.-]+)?)$/);

    if (match) {
      const query = match[1];
      if (query.length <= 25) {
        const matchIndex = textBeforeCursor.lastIndexOf('@' + query);
        setShowMentionMenu(true);
        setMentionQuery(query);
        setMentionStartIndex(matchIndex);
        return;
      }
    }

    if (/(?:^|\s)@$/.test(textBeforeCursor)) {
      setShowMentionMenu(true);
      setMentionQuery('');
      setMentionStartIndex(textBeforeCursor.lastIndexOf('@'));
      return;
    }

    setShowMentionMenu(false);
    setMentionQuery('');
    setMentionStartIndex(-1);
  };

  const insertMention = (member: { id: string; userId?: string; name: string }) => {
    const targetUserId = member.userId || member.id;
    const beforeAt = text.slice(0, mentionStartIndex);
    const afterCursor = text.slice(
      textareaRef.current?.selectionEnd || mentionStartIndex + mentionQuery.length + 1
    );

    // Insert structured mention @[Name](userId) or @Name
    const mentionTag = `@[${member.name}](${targetUserId}) `;
    const newText = `${beforeAt}${mentionTag}${afterCursor}`;

    setText(newText);
    setSelectedMentionIds((prev) => new Set([...prev, targetUserId]));
    setShowMentionMenu(false);
    setMentionQuery('');
    setMentionStartIndex(-1);

    // Re-focus and set cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const nextPos = beforeAt.length + mentionTag.length;
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 10);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionMenu) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionMenu(false);
        return;
      }
      if (filteredMembers.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredMembers.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const chosen = filteredMembers[selectedIndex];
          if (chosen) {
            insertMention(chosen);
          }
          return;
        }
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        setShowMentionMenu(false);
        return;
      }
    }

    // Submit on Cmd+Enter / Ctrl+Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!text.trim() || isSubmitting) return;

    // Collect all mentioned user IDs from tags + stored state
    const mentionMatches = text.match(/@\[([^\]]+)\]\(([a-f0-9-]+)\)/g);
    const finalMentionIds = new Set<string>(selectedMentionIds);
    if (mentionMatches) {
      for (const m of mentionMatches) {
        const matchId = m.match(/@\[([^\]]+)\]\(([a-f0-9-]+)\)/);
        if (matchId && matchId[2]) {
          finalMentionIds.add(matchId[2]);
        }
      }
    }

    await onSubmit(text.trim(), Array.from(finalMentionIds));
    setText('');
    setSelectedMentionIds(new Set());
    setShowMentionMenu(false);
  };

  return (
    <div className="relative space-y-2">
      <div className="relative border border-border/80 rounded-2xl bg-muted/20 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10 transition-all overflow-hidden shadow-xs">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={effectivePlaceholder}
          rows={3}
          className="w-full p-3.5 bg-transparent border-0 outline-none text-xs leading-relaxed resize-y placeholder:text-muted-foreground text-foreground"
        />

        {/* Action Bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-t border-border/60 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
            <button
              type="button"
              className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer px-1.5 py-0.5 rounded bg-muted/40 hover:bg-primary/10"
              onClick={() => {
                const current = text;
                const pos = textareaRef.current?.selectionStart || current.length;
                const newText = `${current.slice(0, pos)}@${current.slice(pos)}`;
                setText(newText);
                setMentionStartIndex(pos);
                setShowMentionMenu(true);
                setMentionQuery('');
                setTimeout(() => {
                  textareaRef.current?.focus();
                  textareaRef.current?.setSelectionRange(pos + 1, pos + 1);
                }, 10);
              }}
              title="Tag teammate"
            >
              <AtSign className="w-3 h-3 text-primary" />
              <span>Mention</span>
            </button>
            <span className="hidden sm:inline-flex items-center gap-1 text-muted-foreground/60">
              Press <Kbd shortcut="mod+enter" /> to send
            </span>
          </div>

          <Button
            size="sm"
            disabled={!text.trim() || isSubmitting}
            onClick={handleSubmit}
            className="h-7 text-xs px-3 gap-1.5 font-medium shadow-xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Posting...</span>
              </>
            ) : (
              <>
                <span>Post</span>
                <Send className="w-3 h-3" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Autocomplete Mention Popover Menu */}
      {showMentionMenu && (
        <div
          ref={menuRef}
          className="absolute z-50 bottom-full left-0 mb-1.5 w-72 rounded-xl border border-border bg-popover/95 backdrop-blur-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-1.5 bg-muted/60 border-b border-border text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1">
              <AtSign className="w-3 h-3 text-primary" /> Tag Teammate
            </span>
            <span className="text-[10px] font-normal text-muted-foreground/80">
              {filteredMembers.length} found
            </span>
          </div>

          <div className="max-h-52 overflow-y-auto p-1 divide-y divide-border/20">
            {isLoadingMembers ? (
              <div className="flex items-center justify-center p-4 text-xs text-muted-foreground gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Searching team...</span>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground italic">
                No teammate matching &ldquo;{mentionQuery}&rdquo;
              </div>
            ) : (
              filteredMembers.map((member: any, idx: number) => {
                const isSelected = idx === selectedIndex;
                const initials = member.name
                  ? member.name
                      .split(' ')
                      .map((n: string) => n[0])
                      .join('')
                      .substring(0, 2)
                      .toUpperCase()
                  : 'U';

                return (
                  <div
                    key={member.id}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-primary/15 text-primary'
                        : 'hover:bg-muted/60 text-foreground'
                    }`}
                    onClick={() => insertMention(member)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt={member.name}
                        className="w-6 h-6 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                        {initials}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold truncate">{member.name}</span>
                        {member.role && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-muted text-muted-foreground uppercase font-medium">
                            {member.role}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate block">
                        {member.email}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="px-2.5 py-1 bg-muted/40 border-t border-border/40 text-[10px] text-muted-foreground flex items-center justify-between">
            <span>Auto-adds user as observer</span>
            <span>↵ or Tab to select</span>
          </div>
        </div>
      )}
    </div>
  );
}
