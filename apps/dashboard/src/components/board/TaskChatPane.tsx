import {
  useState,
  useRef,
  useEffect,
  useMemo,
  type KeyboardEvent,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { toast } from 'sonner';
import { orgService } from '../../lib/orgService';
import { chatService } from '../../lib/chatService';
import { useAuthStore } from '../../store/authStore';
import { CreateTaskFromMessageModal } from './CreateTaskFromMessageModal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useChatStore } from '../../store/chatStore';
import {
  type ChatMessage,
  type PendingAttachment,
  type TaskChatPaneProps,
  parseQuotedMessage,
  isActivityComment,
  formatActivityText,
  TaskChatHeader,
  ChatMessageItem,
  TaskChatComposer,
} from './task-chat';

export type { ChatMessage, PendingAttachment };

export function TaskChatPane({
  cardTitle,
  boardId,
  defaultListId,
  membersCount = 1,
  comments = [],
  systemActivities = [],
  participantUserIds,
  onAddParticipant,
  onRemoveParticipant,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onUploadAttachment,
  onAddMemberClick,
  isSending = false,
}: TaskChatPaneProps) {
  const user = useAuthStore((state) => state.user);
  const orgId = user?.organizationId;
  const { openGlobalDock } = useChatStore();
  const queryClient = useQueryClient();
  const [dmPendingUserId, setDmPendingUserId] = useState<string | null>(null);

  // Jump straight into a 1-on-1 DM with a message author
  const openDirectChat = async (targetUserId?: string, displayName?: string) => {
    if (!targetUserId || targetUserId === user?.id || dmPendingUserId) return;
    setDmPendingUserId(targetUserId);
    try {
      const channel = await chatService.createDirectMessage(targetUserId);
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
      openGlobalDock(channel.id);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || `Couldn't open chat with ${displayName || 'teammate'}`
      );
    } finally {
      setDmPendingUserId(null);
    }
  };

  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const lastMemberPickerClosedRef = useRef(0);

  const [inputText, setInputText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedMentionIds, setSelectedMentionIds] = useState<Set<string>>(new Set());
  const [selectedEmoji, setSelectedEmoji] = useState(false);

  // Attachment & Screenshot upload states
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const pendingAttachmentsRef = useRef(pendingAttachments);
  pendingAttachmentsRef.current = pendingAttachments;
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Interactive message state
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [activeMenuCommentId, setActiveMenuCommentId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [taskModalComment, setTaskModalComment] = useState<ChatMessage | null>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      pendingAttachmentsRef.current.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      });
    };
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveMenuCommentId(null);
    };
    if (activeMenuCommentId) {
      window.addEventListener('click', handleGlobalClick);
      return () => window.removeEventListener('click', handleGlobalClick);
    }
  }, [activeMenuCommentId]);

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
      if (isActivityComment(c.body)) {
        rawItems.push({
          id: `act-${c.id}`,
          type: 'system',
          date: new Date(c.createdAt),
          data: {
            id: c.id,
            text: formatActivityText(c),
            createdAt: c.createdAt,
          },
        });
      } else {
        rawItems.push({
          id: `msg-${c.id}`,
          type: 'message',
          date: new Date(c.createdAt),
          data: c,
        });
      }
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

  // Check user permissions for editing/deleting
  const checkCanModify = (comment: ChatMessage) => {
    const isAuthor = Boolean(user?.id && comment.userId === user.id);
    const isAdmin = Boolean(
      user?.isPlatformAdmin ||
      ['org_owner', 'org_admin', 'workspace_admin', 'admin'].includes(user?.role || '')
    );
    return isAuthor || isAdmin;
  };

  // Scroll to and highlight referenced message
  const handleScrollToMessage = (refId: string | null) => {
    if (!refId) return;
    const targetEl = document.getElementById(`msg-${refId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.classList.add('ring-2', 'ring-sky-500', 'bg-sky-500/10', 'rounded-2xl');
      setTimeout(() => {
        targetEl.classList.remove('ring-2', 'ring-sky-500', 'bg-sky-500/10');
      }, 2000);
    } else {
      toast.info('Referenced message is in earlier chat history');
    }
  };

  // Handle typing & mention detection
  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    setInputText(val);

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
          if (chosen) insertMention(chosen);
          return;
        }
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        setShowMentionMenu(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addPendingFiles = (files: File[]) => {
    const newItems: PendingAttachment[] = files.map((file) => {
      const isImg = file.type.startsWith('image/');
      return {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: isImg ? URL.createObjectURL(file) : undefined,
        name: file.name,
        size: file.size,
        type: file.type,
      };
    });

    setPendingAttachments((prev) => [...prev, ...newItems]);
    textareaRef.current?.focus();
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    const filesToAttach: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          let finalFile = file;
          if (!file.name || file.name === 'image.png') {
            const timeStr = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
            finalFile = new File([file], `Screenshot_${timeStr}.png`, {
              type: file.type || 'image/png',
            });
          }
          filesToAttach.push(finalFile);
        }
      }
    }

    if (filesToAttach.length > 0) {
      e.preventDefault();
      addPendingFiles(filesToAttach);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addPendingFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleSend = async () => {
    if ((!inputText.trim() && pendingAttachments.length === 0) || isSending || isUploadingFiles) {
      return;
    }

    try {
      setIsUploadingFiles(true);
      const uploadedLinks: string[] = [];

      if (pendingAttachments.length > 0 && onUploadAttachment) {
        for (const item of pendingAttachments) {
          try {
            const uploaded = await onUploadAttachment(item.file);
            const publicUrl = uploaded?.url;
            if (publicUrl) {
              const isImg =
                item.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(item.name);
              if (isImg) {
                uploadedLinks.push(`![${item.name}](${publicUrl})`);
              } else {
                uploadedLinks.push(`[📎 ${item.name}](${publicUrl})`);
              }
            }
          } catch {
            toast.error(`Failed to upload ${item.name}`);
          }
        }
      }

      let bodyToSend = inputText.trim();
      if (uploadedLinks.length > 0) {
        if (bodyToSend) {
          bodyToSend = `${bodyToSend}\n\n${uploadedLinks.join('\n')}`;
        } else {
          bodyToSend = uploadedLinks.join('\n');
        }
      }

      if (replyingTo) {
        const author = replyingTo.authorName || replyingTo.authorEmail || 'Teammate';
        const cleanQuoteSnippet = replyingTo.body
          .replace(/^>.*?\n\n/s, '')
          .trim()
          .slice(0, 120);
        bodyToSend = `> **${author}** [ref:${replyingTo.id}]: ${cleanQuoteSnippet}\n\n${bodyToSend}`;
        setReplyingTo(null);
      }

      pendingAttachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
      setPendingAttachments([]);

      const mentionIds = Array.from(selectedMentionIds);
      setInputText('');
      setSelectedMentionIds(new Set());
      setShowMentionMenu(false);

      if (bodyToSend.trim()) {
        await onSendMessage(bodyToSend, mentionIds);
      }
    } finally {
      setIsUploadingFiles(false);
    }
  };

  const addQuickEmoji = (emoji: string) => {
    setInputText((prev) => `${prev} ${emoji} `);
    setSelectedEmoji(false);
    textareaRef.current?.focus();
  };

  const startEditing = (comment: ChatMessage) => {
    const parsed = parseQuotedMessage(comment.body);
    setEditingCommentId(comment.id);
    setEditingText(parsed.content);
    setActiveMenuCommentId(null);
  };

  const handleSaveEdit = async (comment: ChatMessage) => {
    if (!editingText.trim() || !onEditMessage) return;
    try {
      setIsSavingEdit(true);
      const parsed = parseQuotedMessage(comment.body);
      let updatedBody = editingText.trim();
      if (parsed.hasQuote) {
        const refStr = parsed.refId ? ` [ref:${parsed.refId}]` : '';
        updatedBody = `> **${parsed.author}**${refStr}: ${parsed.snippet}\n\n${updatedBody}`;
      }
      await onEditMessage(comment.id, updatedBody);
      setEditingCommentId(null);
      setEditingText('');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCopyMessage = (comment: ChatMessage) => {
    const parsed = parseQuotedMessage(comment.body);
    navigator.clipboard.writeText(parsed.content);
    toast.success('Copied to clipboard');
    setActiveMenuCommentId(null);
  };

  const handleDeleteComment = (comment: ChatMessage) => {
    if (!onDeleteMessage) return;
    setPendingDeleteId(comment.id);
    setActiveMenuCommentId(null);
  };

  const confirmDeleteComment = async () => {
    if (!onDeleteMessage || !pendingDeleteId) return;
    await onDeleteMessage(pendingDeleteId);
    setPendingDeleteId(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fbfa] dark:bg-card/90 border-l border-border/70 relative">
      <TaskChatHeader
        cardTitle={cardTitle}
        membersCount={membersCount}
        showSearch={showSearch}
        searchQuery={searchQuery}
        showMemberPicker={showMemberPicker}
        orgId={orgId}
        participantUserIds={participantUserIds}
        currentUserId={user?.id}
        onOpenGlobalDock={openGlobalDock}
        onToggleSearch={() => {
          setShowSearch(!showSearch);
          if (showSearch) setSearchQuery('');
        }}
        onSearchQueryChange={setSearchQuery}
        onAddMemberClick={onAddMemberClick}
        onAddParticipant={onAddParticipant}
        onRemoveParticipant={onRemoveParticipant}
        onToggleMemberPicker={() => {
          if (Date.now() - lastMemberPickerClosedRef.current < 200) return;
          setShowMemberPicker((prev) => !prev);
        }}
        onCloseMemberPicker={() => {
          lastMemberPickerClosedRef.current = Date.now();
          setShowMemberPicker(false);
        }}
      />

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
                const comment: ChatMessage = item.data;
                const isCurrentUser = Boolean(user?.id && comment.userId === user.id);
                const canModify = checkCanModify(comment);
                const isEditing = editingCommentId === comment.id;

                return (
                  <ChatMessageItem
                    key={item.id}
                    comment={comment}
                    isCurrentUser={isCurrentUser}
                    canModify={canModify}
                    isEditing={isEditing}
                    editingText={editingText}
                    isSavingEdit={isSavingEdit}
                    dmPending={dmPendingUserId === comment.userId}
                    activeMenu={activeMenuCommentId === comment.id}
                    cardTitle={cardTitle}
                    onOpenDirectChat={openDirectChat}
                    onScrollToRef={handleScrollToMessage}
                    onStartEditing={() => startEditing(comment)}
                    onCancelEditing={() => setEditingCommentId(null)}
                    onEditingTextChange={setEditingText}
                    onSaveEdit={() => handleSaveEdit(comment)}
                    onReply={() => {
                      setReplyingTo(comment);
                      setActiveMenuCommentId(null);
                      textareaRef.current?.focus();
                    }}
                    onCopy={() => handleCopyMessage(comment)}
                    onToggleMenu={() =>
                      setActiveMenuCommentId(activeMenuCommentId === comment.id ? null : comment.id)
                    }
                    onCloseMenu={() => setActiveMenuCommentId(null)}
                    onDelete={() => handleDeleteComment(comment)}
                    onCreateTask={() => {
                      setTaskModalComment(comment);
                      setActiveMenuCommentId(null);
                    }}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* ─── Sticky Enterprise Chat Composer Input ─── */}
      <TaskChatComposer
        inputText={inputText}
        onInputChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        textareaRef={textareaRef}
        fileInputRef={fileInputRef}
        isDragOver={isDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        pendingAttachments={pendingAttachments}
        onRemovePendingAttachment={removePendingAttachment}
        onAddPendingFiles={addPendingFiles}
        showMentionMenu={showMentionMenu}
        mentionQuery={mentionQuery}
        filteredMembers={filteredMembers}
        selectedIndex={selectedIndex}
        onInsertMention={insertMention}
        onSetSelectedIndex={setSelectedIndex}
        onMentionButtonClick={() => {
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
        selectedEmoji={selectedEmoji}
        onToggleEmoji={() => setSelectedEmoji(!selectedEmoji)}
        onAddQuickEmoji={addQuickEmoji}
        onSend={handleSend}
        isSending={isSending}
        isUploadingFiles={isUploadingFiles}
      />

      {/* ─── Delete Message Confirmation ─── */}
      <ConfirmDialog
        open={!!pendingDeleteId}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Delete this message?"
        description="The message will be permanently removed for everyone. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDeleteComment}
      />

      {/* ─── Create Task From Message Modal ─── */}
      <CreateTaskFromMessageModal
        isOpen={!!taskModalComment}
        onClose={() => setTaskModalComment(null)}
        comment={taskModalComment}
        cardTitle={cardTitle}
        boardId={boardId}
        defaultListId={defaultListId}
      />
    </div>
  );
}
export default TaskChatPane;
