import { useState, useRef, useEffect, useMemo, type KeyboardEvent, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MessageSquare,
  Video,
  UserPlus,
  Search,
  CheckCheck,
  Paperclip,
  Smile,
  Send,
  Loader2,
  AtSign,
  Sparkles,
  X,
  FileImage,
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { orgService } from '../../lib/orgService';
import { useAuthStore } from '../../store/authStore';
import { MarkdownRenderer } from '../MarkdownRenderer';

export interface ChatMessage {
  id: string;
  type?: 'message' | 'system';
  userId?: string;
  authorName?: string;
  authorEmail?: string;
  authorAvatarUrl?: string;
  body: string;
  createdAt: string;
  attachments?: Array<{
    id: string;
    fileName: string;
    url: string;
    fileType?: string;
  }>;
}

interface TaskChatPaneProps {
  cardId: string;
  cardTitle: string;
  membersCount?: number;
  comments: ChatMessage[];
  systemActivities?: Array<{
    id: string;
    text: string;
    createdAt: string;
  }>;
  onSendMessage: (body: string, mentionedUserIds: string[]) => Promise<void> | void;
  onUploadAttachment?: (file: File) => Promise<void> | void;
  onAddMemberClick?: () => void;
  isSending?: boolean;
}

export function TaskChatPane({
  cardTitle,
  membersCount = 1,
  comments = [],
  systemActivities = [],
  onSendMessage,
  onUploadAttachment,
  onAddMemberClick,
  isSending = false,
}: TaskChatPaneProps) {
  const { user } = useAuthStore();
  const orgId = user?.organizationId;

  const [inputText, setInputText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedMentionIds, setSelectedMentionIds] = useState<Set<string>>(new Set());
  const [selectedEmoji, setSelectedEmoji] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new comments
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [comments.length, systemActivities.length]);

  // Mention query
  const { data: members = [] } = useQuery({
    queryKey: ['org-members-chat-mention', orgId, mentionQuery],
    queryFn: () => (orgId ? orgService.getMembers(orgId, { search: mentionQuery, limit: 8 }) : []),
    enabled: !!orgId && showMentionMenu,
    staleTime: 1000 * 60,
  });

  const filteredMembers = members.slice(0, 6);

  // Merge & Sort Comments and System Audit Events
  const timelineItems = useMemo(() => {
    const rawItems: Array<{
      id: string;
      type: 'message' | 'system';
      date: Date;
      data: any;
    }> = [];

    comments.forEach((c) => {
      rawItems.push({
        id: `msg-${c.id}`,
        type: 'message',
        date: new Date(c.createdAt),
        data: c,
      });
    });

    systemActivities.forEach((act) => {
      rawItems.push({
        id: `sys-${act.id}`,
        type: 'system',
        date: new Date(act.createdAt),
        data: act,
      });
    });

    // Sort chronologically
    rawItems.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Filter by search query if active
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return rawItems.filter((item) => {
        if (item.type === 'message') {
          return (
            item.data.body?.toLowerCase().includes(q) ||
            item.data.authorName?.toLowerCase().includes(q)
          );
        }
        return item.data.text?.toLowerCase().includes(q);
      });
    }

    return rawItems;
  }, [comments, systemActivities, searchQuery]);

  // Group timeline items by formatted date
  const groupedTimeline = useMemo(() => {
    const groups: { [dateStr: string]: typeof timelineItems } = {};
    timelineItems.forEach((item) => {
      let label = format(item.date, 'MMMM d, yyyy');
      if (isToday(item.date)) label = 'Today';
      else if (isYesterday(item.date)) label = 'Yesterday';

      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });
    return groups;
  }, [timelineItems]);

  // Handle typing & mention detection
  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    setInputText(val);

    const textBeforeCursor = val.slice(0, cursor);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
      const querySinceAt = textBeforeCursor.slice(lastAtIndex + 1);

      if (/[\s(]/.test(charBeforeAt) || lastAtIndex === 0) {
        if (!/\n/.test(querySinceAt) && querySinceAt.length <= 25) {
          setShowMentionMenu(true);
          setMentionQuery(querySinceAt);
          setMentionStartIndex(lastAtIndex);
          return;
        }
      }
    }

    setShowMentionMenu(false);
    setMentionQuery('');
    setMentionStartIndex(-1);
  };

  const insertMention = (member: { id: string; userId?: string; name: string }) => {
    const targetUserId = member.userId || member.id;
    const beforeAt = inputText.slice(0, mentionStartIndex);
    const afterCursor = inputText.slice(
      textareaRef.current?.selectionEnd || mentionStartIndex + mentionQuery.length + 1
    );

    const mentionTag = `@${member.name} `;
    const newText = `${beforeAt}${mentionTag}${afterCursor}`;

    setInputText(newText);
    setSelectedMentionIds((prev) => new Set([...prev, targetUserId]));
    setShowMentionMenu(false);
    setMentionQuery('');
    setMentionStartIndex(-1);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const nextPos = beforeAt.length + mentionTag.length;
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 10);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionMenu && filteredMembers.length > 0) {
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
        if (chosen) insertMention(chosen);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionMenu(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;
    const bodyToSend = inputText.trim();
    const mentionIds = Array.from(selectedMentionIds);

    setInputText('');
    setSelectedMentionIds(new Set());
    setShowMentionMenu(false);

    await onSendMessage(bodyToSend, mentionIds);
  };

  // Quick Emoji helper
  const addQuickEmoji = (emoji: string) => {
    setInputText((prev) => `${prev} ${emoji} `);
    setSelectedEmoji(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fbfa] dark:bg-card/90 border-l border-border/70 relative">
      {/* ─── Task Chat Header (Bitrix24 Enterprise Style) ─── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/70 bg-card/90 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0" title={`Chat for task: ${cardTitle}`}>
            <h4 className="text-sm font-bold text-foreground truncate leading-tight">Task chat</h4>
            <p className="text-[11px] text-muted-foreground font-medium">
              {membersCount} {membersCount === 1 ? 'member' : 'members'}
            </p>
          </div>
        </div>

        {/* Top Right Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Video Call / Meet */}
          <button
            type="button"
            className="flex items-center gap-1 h-7 px-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-2xs cursor-pointer transition-colors"
            title="Start Video Meeting"
            onClick={() => {
              window.open(
                `https://meet.google.com/new?authuser=0&hs=179`,
                '_blank',
                'noopener,noreferrer'
              );
            }}
          >
            <Video className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Meet</span>
          </button>

          {/* Add Member shortcut */}
          <button
            type="button"
            className="w-7 h-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
            title="Add participants to task chat"
            onClick={onAddMemberClick}
          >
            <UserPlus className="w-4 h-4" />
          </button>

          {/* Search toggle */}
          <button
            type="button"
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
              showSearch
                ? 'bg-primary/15 text-primary'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title="Search task chat"
            onClick={() => {
              setShowSearch(!showSearch);
              if (showSearch) setSearchQuery('');
            }}
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable Search Input Bar */}
      {showSearch && (
        <div className="px-4 py-2 bg-muted/40 border-b border-border flex items-center gap-2 animate-in fade-in-50 duration-150 shrink-0">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search discussion and activity messages..."
            className="w-full bg-transparent border-none text-xs outline-none text-foreground placeholder:text-muted-foreground"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground p-0.5"
              onClick={() => setSearchQuery('')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* ─── Chat Message & Activity Stream Timeline ─── */}
      <div
        ref={chatScrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-[radial-gradient(#00000008_1px,transparent_1px)] dark:bg-[radial-gradient(#ffffff08_1px,transparent_1px)] bg-[size:16px_16px]"
      >
        {Object.keys(groupedTimeline).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-2 text-muted-foreground/60">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-xs font-semibold text-foreground/80">No discussion messages yet</p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-[220px]">
              Type a message below or use @ to collaborate with your team on this task.
            </p>
          </div>
        ) : (
          Object.entries(groupedTimeline).map(([dateLabel, items]) => (
            <div key={dateLabel} className="space-y-3">
              {/* Date Separator Pill */}
              <div className="flex items-center justify-center my-3">
                <span className="px-3 py-0.5 rounded-full bg-muted/80 backdrop-blur-sm border border-border text-[10px] font-bold text-muted-foreground shadow-2xs tracking-wide">
                  {dateLabel}
                </span>
              </div>

              {/* Items under this date */}
              {items.map((item) => {
                if (item.type === 'system') {
                  const act = item.data;
                  return (
                    <div key={item.id} className="flex justify-center my-1.5">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/25 text-[11px] text-amber-900 dark:text-amber-200">
                        <span className="font-medium">{act.text}</span>
                        <span className="text-[9px] text-amber-700/70 dark:text-amber-400 font-mono">
                          {format(item.date, 'h:mm a')}
                        </span>
                      </div>
                    </div>
                  );
                }

                // Chat Message Bubble
                const comment = item.data;
                const isCurrentUser = user?.id && comment.userId === user.id;
                const authorInitial = comment.authorName
                  ? comment.authorName.substring(0, 2).toUpperCase()
                  : 'U';

                return (
                  <div key={item.id} className="flex items-start gap-2.5 group">
                    {/* User Avatar */}
                    {comment.authorAvatarUrl ? (
                      <img
                        src={comment.authorAvatarUrl}
                        alt={comment.authorName || 'Avatar'}
                        className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-border mt-0.5"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        {authorInitial}
                      </div>
                    )}

                    {/* Chat Bubble Container */}
                    <div className="flex-1 min-w-0 max-w-[92%]">
                      {/* Author Header */}
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer truncate">
                          {comment.authorName || comment.authorEmail || 'Teammate'}
                        </span>
                        {isCurrentUser && (
                          <span className="text-[9px] px-1 rounded bg-sky-500/15 text-sky-600 font-semibold">
                            You
                          </span>
                        )}
                      </div>

                      {/* Bubble Body */}
                      <div className="p-3 rounded-2xl bg-card border border-border/80 shadow-xs text-xs text-foreground space-y-2">
                        {/* Render Body with highlighted @mentions */}
                        <div className="leading-relaxed whitespace-pre-wrap break-words">
                          <MarkdownRenderer content={comment.body} />
                        </div>

                        {/* Attachments preview if present in message */}
                        {comment.attachments && comment.attachments.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                            {comment.attachments.map((att: any) => (
                              <a
                                key={att.id}
                                href={att.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/40 hover:bg-muted border border-border text-[11px] truncate transition-colors"
                              >
                                <FileImage className="w-3.5 h-3.5 text-primary shrink-0" />
                                <span className="truncate font-medium">{att.fileName}</span>
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Timestamp & Read Receipt */}
                        <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground pt-0.5">
                          <span>{format(item.date, 'h:mm a')}</span>
                          <CheckCheck className="w-3.5 h-3.5 text-sky-500 inline shrink-0" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* ─── Autocomplete Mentions Dropdown ─── */}
      {showMentionMenu && (
        <div className="absolute z-50 bottom-24 left-4 right-4 rounded-xl border border-border bg-popover/95 backdrop-blur-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 bg-muted/60 border-b border-border text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1">
              <AtSign className="w-3 h-3 text-primary" /> Mention teammate
            </span>
            <span className="text-[10px] text-muted-foreground/70">
              {filteredMembers.length} found
            </span>
          </div>

          <div className="max-h-48 overflow-y-auto p-1 divide-y divide-border/20">
            {filteredMembers.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground italic">
                No teammate found matching &ldquo;{mentionQuery}&rdquo;
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
                        className="w-5 h-5 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">
                        {initials}
                      </div>
                    )}
                    <span className="text-xs font-semibold truncate flex-1">{member.name}</span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {member.email}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ─── Emoji Quick Picker Popover ─── */}
      {selectedEmoji && (
        <div className="absolute z-50 bottom-24 right-6 p-2 rounded-xl bg-popover border border-border shadow-2xl flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100">
          {['👍', '🚀', '🔥', '✅', '❤️', '👀', '🎉', '💯'].map((emo) => (
            <button
              key={emo}
              type="button"
              className="text-lg hover:scale-125 transition-transform p-1 cursor-pointer"
              onClick={() => addQuickEmoji(emo)}
            >
              {emo}
            </button>
          ))}
        </div>
      )}

      {/* ─── Sticky Enterprise Chat Composer Input ─── */}
      <div className="p-3 bg-card/90 backdrop-blur-md border-t border-border/80 shrink-0">
        <div className="border border-border/80 rounded-2xl bg-muted/20 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10 transition-all shadow-xs overflow-hidden">
          {/* Main Input Textarea */}
          <textarea
            ref={textareaRef}
            rows={2}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type @ or + to mention a person, a chat or AI"
            className="w-full p-3 bg-transparent border-0 outline-none text-xs leading-relaxed resize-none placeholder:text-muted-foreground/80 text-foreground"
          />

          {/* Composer Bottom Action Bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-t border-border/50 text-xs">
            {/* Left Tools: Attachment */}
            <div className="flex items-center gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && onUploadAttachment) {
                    onUploadAttachment(file);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                className="w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
                title="Attach file"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <button
                type="button"
                className="w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary flex items-center justify-center transition-colors cursor-pointer"
                title="Mention teammate"
                onClick={() => {
                  const current = inputText;
                  const pos = textareaRef.current?.selectionStart || current.length;
                  const newText = `${current.slice(0, pos)}@${current.slice(pos)}`;
                  setInputText(newText);
                  setMentionStartIndex(pos);
                  setShowMentionMenu(true);
                  setMentionQuery('');
                  setTimeout(() => {
                    textareaRef.current?.focus();
                    textareaRef.current?.setSelectionRange(pos + 1, pos + 1);
                  }, 10);
                }}
              >
                <AtSign className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right Tools: Emoji, AI, Mic, Send */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
                title="Quick emojis"
                onClick={() => setSelectedEmoji(!selectedEmoji)}
              >
                <Smile className="w-4 h-4" />
              </button>

              <button
                type="button"
                className="w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
                title="AI Summary & Assist"
                onClick={() => {
                  setInputText((prev) => `${prev} @AI please summarize the latest progress.`);
                  textareaRef.current?.focus();
                }}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              </button>

              {/* Circular Blue Send Button */}
              <button
                type="button"
                disabled={!inputText.trim() || isSending}
                onClick={handleSend}
                className="w-7 h-7 rounded-full bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs disabled:cursor-not-allowed"
                title="Send message"
              >
                {isSending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 translate-x-px" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
