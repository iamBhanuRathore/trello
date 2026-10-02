import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Hash, ArrowDown, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { format, isToday, isYesterday } from 'date-fns';
import {
  chatService,
  type ChatChannel,
  type ChatMessageItem,
  type ChatAttachment,
} from '../../lib/chatService';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { ChatMessageCard } from './ChatMessageCard';
import { useMentionAutocomplete } from './MentionAutocomplete';
import { TimezoneComposerBanner } from './TimezoneComposerBanner';
import { TaskMentionPickerModal } from './TaskMentionPickerModal';
import { MessageTranslateModal, MessageForwardModal, MessageSeenPopover } from './MessageExtras';
import { ChatFeedHeader, PinnedMessageBanner, SelectModeToolbar, ChatFeedComposer } from './feed';

interface ChatFeedProps {
  channel: ChatChannel;
  canModerate?: boolean;
  /** Below lg: the list hides while a channel is open — back returns to it. */
  onBack?: () => void;
}

export const ChatFeed: React.FC<ChatFeedProps> = ({ channel, canModerate = false, onBack }) => {
  const user = useAuthStore((state) => state.user);
  const {
    setActiveThreadMessage,
    toggleDetailsPane,
    isDetailsPaneOpen,
    replyingToMessage,
    setReplyingToMessage,
    typingUsers,
    presenceMap,
    drafts,
    setDraft,
    outbox,
    enqueueOutbox,
    removeFromOutbox,
    processOutbox,
    wsConnected,
    messageLayout,
    setMessageLayout,
  } = useChatStore();
  const queryClient = useQueryClient();

  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processOutbox();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [processOutbox]);

  const [messageText, setMessageText] = useState(drafts[channel.id] || '');
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [isSilentSend, setIsSilentSend] = useState(false);
  const [isTaskPickerOpen, setIsTaskPickerOpen] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isPlusOpen, setIsPlusOpen] = useState(false);

  // Telegram parity: select mode + forward / translate / seen dialogs
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [forwardSource, setForwardSource] = useState<ChatMessageItem | null>(null);
  const [isForwardPending, setIsForwardPending] = useState(false);
  const [translateSource, setTranslateSource] = useState<ChatMessageItem | null>(null);
  const [seenSource, setSeenSource] = useState<ChatMessageItem | null>(null);
  const [isBulkForwardOpen, setIsBulkForwardOpen] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  // Close the + menu on outside click / Escape
  useEffect(() => {
    if (!isPlusOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!plusMenuRef.current?.contains(e.target as Node)) setIsPlusOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsPlusOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isPlusOpen]);

  // Sync draft on channel change
  useEffect(() => {
    setMessageText(drafts[channel.id] || '');
    setPendingAttachments([]);
    setSelectMode(false);
    setSelectedIds(new Set());
    setForwardSource(null);
    setIsBulkForwardOpen(false);
    setTranslateSource(null);
    setSeenSource(null);
  }, [channel.id, drafts]);

  // Persist draft on text change
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMessageText(val);
    setDraft(channel.id, val);
    mention.detect(val, e.target.selectionStart ?? val.length);
  };

  const setComposerText = (val: string) => {
    setMessageText(val);
    setDraft(channel.id, val);
  };

  // @mention autocomplete
  const mention = useMentionAutocomplete({
    textareaRef,
    text: messageText,
    setText: setComposerText,
  });

  // Fetch messages query
  const { data: messages = [], isLoading: isMessagesLoading } = useQuery({
    queryKey: ['chat', 'messages', channel.id],
    queryFn: () => chatService.listMessages(channel.id, undefined, 50),
    refetchInterval: wsConnected ? false : 10000,
  });

  // Fetch channel details (for members, roles, and read receipts)
  const { data: channelDetails } = useQuery({
    queryKey: ['chat', 'channel-details', channel.id],
    queryFn: () => chatService.getChannelDetails(channel.id),
    staleTime: 30000,
  });
  const channelMembers = channelDetails?.members || [];

  // Merge in pending outbox messages for this channel
  const mergedMessages = useMemo(() => {
    const existingIds = new Set(messages.map((m) => m.id));
    const channelOutbox = outbox
      .filter((o) => o.channelId === channel.id && !existingIds.has(o.tempId))
      .map((o): ChatMessageItem => ({
        id: o.tempId,
        channelId: o.channelId,
        userId: o.userId,
        body: o.body,
        parentMessageId: o.parentMessageId,
        replyToMessageId: o.replyToMessageId,
        replyTo: o.replyTo,
        status: o.status,
        isEdited: false,
        isAnnouncement: !!o.isAnnouncement,
        createdAt: o.createdAt,
        updatedAt: o.createdAt,
        author: {
          id: o.userId,
          name: o.author.name,
          email: o.author.email,
          avatarUrl: o.author.avatarUrl,
        },
        attachments: [],
        reactions: [],
        replyCount: 0,
      }));

    return [...messages, ...channelOutbox];
  }, [messages, outbox, channel.id]);

  // Mark channel read on open / unread arrival
  const markingReadRef = useRef(false);
  const markReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (markReadTimer.current) clearTimeout(markReadTimer.current);
    if (channel.unreadCount <= 0 || markingReadRef.current) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    markReadTimer.current = setTimeout(() => {
      markReadTimer.current = null;
      if (markingReadRef.current) return;
      markingReadRef.current = true;
      chatService
        .markChannelRead(channel.id)
        .then(() => {
          queryClient.setQueryData<ChatChannel[]>(['chat', 'channels'], (old) =>
            old?.map((c) => (c.id === channel.id ? { ...c, unreadCount: 0 } : c))
          );
        })
        .catch(() => {})
        .finally(() => {
          markingReadRef.current = false;
        });
    }, 1200);
    return () => {
      if (markReadTimer.current) clearTimeout(markReadTimer.current);
    };
  }, [channel.id, channel.unreadCount, queryClient]);

  // Scroll to bottom on initial load and message count change
  useEffect(() => {
    if (!showScrollBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, showScrollBottom]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isFarUp = scrollHeight - scrollTop - clientHeight > 180;
    setShowScrollBottom(isFarUp);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  const editMutation = useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: string }) =>
      chatService.editMessage(messageId, body),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', channel.id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) => chatService.deleteMessage(messageId),
    onError: (err: any) => {
      toast.error(serverErrorMessage(err, 'Failed to delete message'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', channel.id] });
    },
  });

  const reactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      chatService.toggleReaction(messageId, emoji),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', channel.id] });
    },
  });

  const { data: pinnedMessages = [] } = useQuery({
    queryKey: ['chat', 'pinned', channel.id],
    queryFn: () => chatService.listPinned(channel.id),
    staleTime: 15000,
  });
  const latestPinned = pinnedMessages[0];

  const pinMutation = useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: string; pinned: boolean }) =>
      chatService.pinMessage(messageId, pinned),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', channel.id] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'pinned', channel.id] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to update pin');
    },
  });

  const isPersistedMessage = (m: Pick<ChatMessageItem, 'id' | 'status'>) =>
    !m.id.startsWith('temp-') && m.status !== 'sending' && m.status !== 'queued';

  const serverErrorMessage = (err: any, fallback: string) =>
    err.response?.data?.message || err.message || fallback;

  const handleForward = async (targetChannelId: string) => {
    const candidates = forwardSource
      ? [forwardSource]
      : mergedMessages.filter((m) => selectedIds.has(m.id));
    const sources = candidates.filter(isPersistedMessage);
    if (sources.length === 0) {
      toast.error('These messages are still sending — try again in a moment.');
      return;
    }
    setIsForwardPending(true);
    try {
      const results = await Promise.allSettled(
        sources.map((src) => chatService.forwardMessage(src.id, targetChannelId))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', targetChannelId] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
      setForwardSource(null);
      setIsBulkForwardOpen(false);
      setSelectedIds(new Set());
      setSelectMode(false);
      if (failed === 0) {
        toast.success(
          sources.length === 1 ? 'Message forwarded' : `${sources.length} messages forwarded`
        );
      } else if (failed < sources.length) {
        toast.warning(
          `${sources.length - failed} of ${sources.length} messages forwarded — ${failed} failed.`
        );
      } else {
        const first = results.find((r) => r.status === 'rejected');
        toast.error(
          serverErrorMessage(
            first && 'reason' in first ? first.reason : undefined,
            'Failed to forward'
          )
        );
      }
    } catch (err: any) {
      toast.error(serverErrorMessage(err, 'Failed to forward'));
    } finally {
      setIsForwardPending(false);
    }
  };

  const toggleSelectMessage = (msg: ChatMessageItem) => {
    if (!isPersistedMessage(msg)) {
      toast.error('This message is still sending — try again in a moment.');
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msg.id)) next.delete(msg.id);
      else next.add(msg.id);
      return next;
    });
  };

  const enterSelectMode = (msg: ChatMessageItem) => {
    if (!isPersistedMessage(msg)) {
      toast.error('This message is still sending — try again in a moment.');
      return;
    }
    setSelectMode(true);
    setSelectedIds(new Set([msg.id]));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectMode) {
        e.preventDefault();
        exitSelectMode();
        return;
      }
      if (forwardSource || isBulkForwardOpen || translateSource || seenSource) {
        setForwardSource(null);
        setIsBulkForwardOpen(false);
        setTranslateSource(null);
        setSeenSource(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectMode, forwardSource, isBulkForwardOpen, translateSource, seenSource]);

  const handleBulkDelete = () => {
    const ids = [...selectedIds].filter((id) => !id.startsWith('temp-'));
    if (ids.length === 0) {
      toast.error('These messages are still sending — try again in a moment.');
      return;
    }
    Promise.allSettled(ids.map((id) => chatService.deleteMessage(id)))
      .then((results) => {
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed === 0) {
          toast.success(ids.length === 1 ? 'Message deleted' : `${ids.length} messages deleted`);
        } else if (failed < ids.length) {
          toast.warning(
            `${ids.length - failed} of ${ids.length} messages deleted — ${failed} failed.`
          );
        } else {
          const first = results.find((r) => r.status === 'rejected');
          toast.error(
            serverErrorMessage(
              first && 'reason' in first ? first.reason : undefined,
              'Delete failed'
            )
          );
        }
      })
      .finally(() => {
        queryClient.invalidateQueries({ queryKey: ['chat', 'messages', channel.id] });
        exitSelectMode();
      });
  };

  const scrollToMessage = (targetId: string) => {
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-primary/20', 'ring-1', 'ring-primary/40');
      setTimeout(() => {
        el.classList.remove('bg-primary/20', 'ring-1', 'ring-primary/40');
      }, 2000);
    }
  };

  const handleSendMessage = () => {
    const trimmed = messageText.trim();
    const stagedIds = pendingAttachments.map((a) => a.id);
    if (!trimmed && stagedIds.length === 0) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const currentReply = replyingToMessage;
    const replyTo = currentReply
      ? {
          id: currentReply.id,
          body: currentReply.body,
          authorName: currentReply.author?.name || 'Teammate',
        }
      : null;

    const optimisticMsg: ChatMessageItem = {
      id: tempId,
      channelId: channel.id,
      userId: user?.id || '',
      body: trimmed || '📎 Attachment',
      replyToMessageId: replyTo?.id,
      replyTo,
      status: isOnline ? 'sending' : 'queued',
      isEdited: false,
      isAnnouncement,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: {
        id: user?.id || '',
        name: user?.name || 'You',
        email: user?.email || '',
        avatarUrl: user?.avatarUrl,
      },
      attachments: pendingAttachments,
      reactions: [],
      replyCount: 0,
    };

    queryClient.setQueryData<ChatMessageItem[]>(['chat', 'messages', channel.id], (old) => [
      ...(old || []),
      optimisticMsg,
    ]);

    enqueueOutbox({
      tempId,
      channelId: channel.id,
      userId: user?.id || '',
      body: trimmed || '📎 Attachment',
      parentMessageId: null,
      replyToMessageId: replyTo?.id,
      replyTo,
      isAnnouncement,
      attachmentIds: stagedIds.length > 0 ? stagedIds : undefined,
      createdAt: optimisticMsg.createdAt,
      author: optimisticMsg.author,
      status: isOnline ? 'sending' : 'queued',
      retryCount: 0,
    });

    setMessageText('');
    setPendingAttachments([]);
    setDraft(channel.id, '');
    setReplyingToMessage(null);
    setIsAnnouncement(false);
    scrollToBottom();
    textareaRef.current?.focus();

    if (isOnline) {
      chatService
        .sendMessage(channel.id, {
          body: trimmed || '📎 Attachment',
          replyToMessageId: replyTo?.id,
          isAnnouncement,
          attachmentIds: stagedIds.length > 0 ? stagedIds : undefined,
        })
        .then((serverMsg) => {
          removeFromOutbox(tempId);
          queryClient.setQueryData<ChatMessageItem[]>(['chat', 'messages', channel.id], (old) =>
            old
              ? old.map((m) => (m.id === tempId ? { ...serverMsg, status: 'sent' } : m))
              : [serverMsg]
          );
          queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
        })
        .catch((err) => {
          if (!navigator.onLine || err.message?.includes('Network Error') || !err.response) {
            useChatStore.getState().updateOutboxStatus(tempId, 'queued');
          } else {
            useChatStore.getState().updateOutboxStatus(tempId, 'failed');
            toast.error(err.response?.data?.message || err.message || 'Failed to send message');
          }
        });
    }
  };

  const handleAttachFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    if (!isOnline) {
      toast.error('You are offline. File uploads require a connection.');
      return;
    }
    const oversized = files.find((f) => f.size > 25 * 1024 * 1024);
    if (oversized) {
      toast.error(`"${oversized.name}" exceeds the 25 MB chat upload limit.`);
      return;
    }
    setIsUploading(true);
    try {
      for (const file of files) {
        const { attachment } = await chatService.stageAttachment(channel.id, file);
        setPendingAttachments((prev) => [...prev, attachment]);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'File upload failed');
    } finally {
      setIsUploading(false);
      textareaRef.current?.focus();
    }
  };

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  const insertFormatting = (prefix: string, suffix = prefix) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const current = messageText;
    const selected = current.slice(start, end);
    const updated =
      current.slice(0, start) + prefix + (selected || 'text') + suffix + current.slice(end);
    setMessageText(updated);
    setDraft(channel.id, updated);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(
        start + prefix.length,
        end + prefix.length + (selected ? 0 : 4)
      );
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention.handleKey(e)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      insertFormatting('**');
      return;
    }
    if (mod && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      insertFormatting('*');
      return;
    }
    if (mod && e.key === '`') {
      e.preventDefault();
      insertFormatting('`');
      return;
    }
    if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === 'ArrowUp' && !messageText.trim()) {
      const userLastMessage = [...mergedMessages]
        .reverse()
        .find((m) => m.userId === user?.id && !m.deletedAt);
      if (userLastMessage) {
        e.preventDefault();
        setEditingMessageId(userLastMessage.id);
      }
    } else if (e.key === 'Escape') {
      if (replyingToMessage) {
        setReplyingToMessage(null);
      } else {
        textareaRef.current?.blur();
      }
    }
  };

  const handleSelectTask = (task: { id: string; title: string }) => {
    const taskEmbed = ` [task:${task.id}:${task.title}] `;
    setMessageText((prev) => prev + taskEmbed);
    setDraft(channel.id, messageText + taskEmbed);
    setIsTaskPickerOpen(false);
    textareaRef.current?.focus();
  };

  const recipientPresence = channel.otherUser ? presenceMap[channel.otherUser.id] : null;

  const activeTyping = (typingUsers[channel.id] || []).filter(
    (t) => t.userId !== user?.id && Date.now() - t.timestamp < 3500
  );

  const groupedMessages = useMemo(() => {
    const filtered = searchQuery.trim()
      ? mergedMessages.filter((m) => m.body.toLowerCase().includes(searchQuery.toLowerCase()))
      : mergedMessages;

    const groups: { dateLabel: string; items: ChatMessageItem[] }[] = [];
    let currentDateLabel = '';
    let currentGroup: ChatMessageItem[] = [];

    for (const msg of filtered) {
      const msgDate = new Date(msg.createdAt);
      let label = format(msgDate, 'MMMM d, yyyy');
      if (isToday(msgDate)) label = 'Today';
      else if (isYesterday(msgDate)) label = 'Yesterday';

      if (label !== currentDateLabel) {
        if (currentGroup.length > 0) {
          groups.push({ dateLabel: currentDateLabel, items: currentGroup });
        }
        currentDateLabel = label;
        currentGroup = [msg];
      } else {
        currentGroup.push(msg);
      }
    }

    if (currentGroup.length > 0) {
      groups.push({ dateLabel: currentDateLabel, items: currentGroup });
    }

    return groups;
  }, [mergedMessages, searchQuery]);

  const isAnnouncementRestricted =
    channel.isAnnouncementOnly && channel.role !== 'owner' && channel.role !== 'admin';

  return (
    <div className="flex-1 flex flex-col h-full bg-background min-w-0 relative">
      <ChatFeedHeader
        channel={channel}
        recipientPresence={recipientPresence}
        onBack={onBack}
        messageLayout={messageLayout}
        onToggleMessageLayout={() =>
          setMessageLayout(messageLayout === 'bubbles' ? 'classic' : 'bubbles')
        }
        isSearching={isSearching}
        searchQuery={searchQuery}
        onToggleSearching={setIsSearching}
        onSearchQueryChange={setSearchQuery}
        isDetailsPaneOpen={isDetailsPaneOpen}
        onToggleDetailsPane={toggleDetailsPane}
      />

      {/* Pinned message banner */}
      {latestPinned && !selectMode && (
        <PinnedMessageBanner
          latestPinned={latestPinned}
          pinnedCount={pinnedMessages.length}
          canUnpin={canModerate || channel.role === 'owner' || channel.role === 'admin'}
          onJumpToMessage={scrollToMessage}
          onUnpin={(messageId) => pinMutation.mutate({ messageId, pinned: false })}
        />
      )}

      {/* Select-mode toolbar */}
      {selectMode && (
        <SelectModeToolbar
          selectedCount={selectedIds.size}
          onBulkForward={() => setIsBulkForwardOpen(true)}
          onBulkDelete={handleBulkDelete}
          onCancel={exitSelectMode}
        />
      )}

      {/* Messages Stream */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-6"
      >
        {isMessagesLoading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground">
              {channel.type === 'direct' ? (
                <Users className="w-6 h-6" />
              ) : (
                <Hash className="w-6 h-6" />
              )}
            </div>
            <h3 className="text-sm font-bold text-foreground">
              {channel.type === 'direct'
                ? `This is the start of your direct chat with ${channel.name}`
                : `Welcome to the #${channel.name} channel!`}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              Send a message, mention a task, or share files to collaborate in real-time.
            </p>
          </div>
        ) : (
          groupedMessages.map((group) => (
            <div key={group.dateLabel} className="space-y-3">
              {/* Date Divider */}
              <div className="relative flex items-center justify-center my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative bg-card px-3 py-1 rounded-full border border-border text-[11px] font-semibold text-muted-foreground shadow-xs">
                  {group.dateLabel}
                </div>
              </div>

              {/* Message Cards */}
              <div className={messageLayout === 'bubbles' ? 'space-y-1 px-1' : 'space-y-1'}>
                {group.items.map((msg) => (
                  <ChatMessageCard
                    key={msg.id}
                    message={msg}
                    isEditingExternal={editingMessageId === msg.id}
                    channelType={channel.type}
                    otherUserId={channel.otherUser?.id}
                    channelMembers={channelMembers}
                    selectMode={selectMode}
                    isSelected={selectedIds.has(msg.id)}
                    onCancelEdit={() => setEditingMessageId(null)}
                    canModerate={
                      canModerate || channel.role === 'owner' || channel.role === 'admin'
                    }
                    onEdit={(id, body) => {
                      editMutation.mutate({ messageId: id, body });
                      setEditingMessageId(null);
                    }}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onToggleReaction={(id, emoji) =>
                      reactionMutation.mutate({ messageId: id, emoji })
                    }
                    onTogglePin={(target) =>
                      pinMutation.mutate({ messageId: target.id, pinned: !target.isPinned })
                    }
                    onOpenThread={(parent) => setActiveThreadMessage(parent)}
                    onReply={(targetMsg) => {
                      setReplyingToMessage(targetMsg);
                      textareaRef.current?.focus();
                    }}
                    onForward={(targetMsg) => setForwardSource(targetMsg)}
                    onSelect={(targetMsg) => enterSelectMode(targetMsg)}
                    onToggleSelect={(targetMsg) => toggleSelectMessage(targetMsg)}
                    onTranslate={(targetMsg) => setTranslateSource(targetMsg)}
                    onShowSeen={(targetMsg) => setSeenSource(targetMsg)}
                    onJumpToMessage={scrollToMessage}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-32 right-6 p-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-all z-20 cursor-pointer"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Typing Indicator Bar */}
      {activeTyping.length > 0 && (
        <div className="px-4 py-1 text-[11px] text-muted-foreground italic flex items-center gap-1.5 animate-pulse">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
          <span>
            {activeTyping.map((t) => t.userName).join(', ')}{' '}
            {activeTyping.length === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      {/* Off-Hours Banner for DMs */}
      {channel.type === 'direct' &&
        recipientPresence &&
        !recipientPresence.isWithinWorkingHours && (
          <div className="px-4 pt-2">
            <TimezoneComposerBanner
              otherUserPresence={recipientPresence}
              otherUserName={channel.name}
              isSilentSend={isSilentSend}
              onToggleSilentSend={() => setIsSilentSend(!isSilentSend)}
            />
          </div>
        )}

      {/* Composer Section */}
      <ChatFeedComposer
        channel={channel}
        messageText={messageText}
        onTextChange={handleTextChange}
        onKeyDown={handleKeyDown}
        textareaRef={textareaRef}
        fileInputRef={fileInputRef}
        plusMenuRef={plusMenuRef}
        mention={mention}
        isAnnouncementRestricted={isAnnouncementRestricted}
        isAnnouncement={isAnnouncement}
        onToggleAnnouncement={() => setIsAnnouncement((v) => !v)}
        replyingToMessage={replyingToMessage}
        onCancelReply={() => setReplyingToMessage(null)}
        isOnline={isOnline}
        pendingAttachments={pendingAttachments}
        onRemovePendingAttachment={(id) =>
          setPendingAttachments((prev) => prev.filter((a) => a.id !== id))
        }
        isUploading={isUploading}
        isPlusOpen={isPlusOpen}
        onTogglePlus={() => setIsPlusOpen((v) => !v)}
        onClosePlus={() => setIsPlusOpen(false)}
        onAttachFiles={handleAttachFiles}
        onOpenTaskPicker={() => setIsTaskPickerOpen(true)}
        onSendMessage={handleSendMessage}
      />

      {/* Task Mention Picker Modal */}
      <TaskMentionPickerModal
        isOpen={isTaskPickerOpen}
        onClose={() => setIsTaskPickerOpen(false)}
        onSelectTask={handleSelectTask}
      />

      {/* Telegram parity dialogs */}
      {translateSource && (
        <MessageTranslateModal
          text={translateSource.body}
          onClose={() => setTranslateSource(null)}
        />
      )}
      {(forwardSource || isBulkForwardOpen) && (
        <MessageForwardModal
          messagePreview={
            forwardSource ? forwardSource.body : `${selectedIds.size} selected messages`
          }
          isPending={isForwardPending}
          onClose={() => {
            setForwardSource(null);
            setIsBulkForwardOpen(false);
          }}
          onForward={handleForward}
        />
      )}
      {seenSource && (
        <MessageSeenPopover messageId={seenSource.id} onClose={() => setSeenSource(null)} />
      )}
    </div>
  );
};
export default ChatFeed;
