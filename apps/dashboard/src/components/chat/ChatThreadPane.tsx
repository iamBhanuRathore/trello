import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Send, Loader2, CornerDownRight, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';
import { format, isToday, isYesterday } from 'date-fns';
import { chatService, type ChatMessageItem } from '../../lib/chatService';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { PresenceBadge } from './PresenceBadge';
import { TaskPreviewCard } from './TaskPreviewCard';
import { TaskMentionPickerModal } from './TaskMentionPickerModal';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { getInitials } from '../../utils/avatar';

interface ChatThreadPaneProps {
  parentMessage: ChatMessageItem;
  onClose: () => void;
}

const COMMON_EMOJIS = ['👍', '❤️', '🔥', '🚀', '👀', '🎉'];

export const ChatThreadPane: React.FC<ChatThreadPaneProps> = ({ parentMessage, onClose }) => {
  const { user } = useAuthStore();
  const { presenceMap, wsConnected } = useChatStore();
  const queryClient = useQueryClient();

  const [replyText, setReplyText] = useState('');
  const [isTaskPickerOpen, setIsTaskPickerOpen] = useState(false);

  useEscapeKey(() => {
    if (isTaskPickerOpen) {
      setIsTaskPickerOpen(false);
    } else {
      onClose();
    }
  }, true);

  const repliesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch thread replies (WS appends live; poll only when disconnected)
  const { data: replies = [], isLoading } = useQuery({
    queryKey: ['chat', 'thread', parentMessage.id],
    queryFn: () => chatService.listThreadReplies(parentMessage.id),
    refetchInterval: wsConnected ? false : 12000,
  });

  // Auto-scroll to bottom on replies update
  useEffect(() => {
    if (replies.length > 0) {
      repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [replies.length]);

  // Send reply mutation
  const sendReplyMutation = useMutation({
    mutationFn: (body: string) =>
      chatService.sendMessage(parentMessage.channelId, {
        body,
        parentMessageId: parentMessage.id,
      }),
    onMutate: async (newBody) => {
      await queryClient.cancelQueries({ queryKey: ['chat', 'thread', parentMessage.id] });
      const previousReplies =
        queryClient.getQueryData<ChatMessageItem[]>(['chat', 'thread', parentMessage.id]) || [];

      const optimisticReply: ChatMessageItem = {
        id: `temp-${Date.now()}`,
        channelId: parentMessage.channelId,
        userId: user?.id || '',
        body: newBody,
        parentMessageId: parentMessage.id,
        isEdited: false,
        isAnnouncement: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: {
          id: user?.id || '',
          name: user?.name || 'You',
          email: user?.email || '',
          avatarUrl: user?.avatarUrl,
        },
        attachments: [],
        reactions: [],
        replyCount: 0,
      };

      queryClient.setQueryData<ChatMessageItem[]>(
        ['chat', 'thread', parentMessage.id],
        [...previousReplies, optimisticReply]
      );

      return { previousReplies };
    },
    onError: (err: any, _variables, context) => {
      if (context?.previousReplies) {
        queryClient.setQueryData(['chat', 'thread', parentMessage.id], context.previousReplies);
      }
      toast.error(err.response?.data?.message || err.message || 'Failed to send reply');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'thread', parentMessage.id] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', parentMessage.channelId] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
    },
  });

  // Toggle reaction mutation
  const reactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      chatService.toggleReaction(messageId, emoji),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'thread', parentMessage.id] });
    },
  });

  const handleSend = () => {
    const trimmed = replyText.trim();
    if (!trimmed || sendReplyMutation.isPending) return;
    setReplyText('');
    sendReplyMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInsertTask = (task: { id: string; title: string }) => {
    const mention = ` [task:${task.id}:${task.title}] `;
    setReplyText((prev) => prev + mention);
    setIsTaskPickerOpen(false);
    textareaRef.current?.focus();
  };

  const renderContent = (body: string) => {
    const taskMentionRegex = /\[task:([a-f0-9-]+):([^\]]+)\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = taskMentionRegex.exec(body)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <MarkdownRenderer key={lastIndex} content={body.slice(lastIndex, match.index)} />
        );
      }

      const cardId = match[1];
      const cardTitle = match[2];
      parts.push(<TaskPreviewCard key={match.index} cardId={cardId} title={cardTitle} />);

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < body.length) {
      parts.push(<MarkdownRenderer key={lastIndex} content={body.slice(lastIndex)} />);
    }

    return parts;
  };

  const formatMsgDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isToday(d)) return format(d, 'h:mm a');
    if (isYesterday(d)) return `Yesterday, ${format(d, 'h:mm a')}`;
    return format(d, 'MMM d, h:mm a');
  };

  const parentPresence = presenceMap[parentMessage.userId];

  return (
    <>
      {/* Ambient backdrop on laptop / tablet viewports */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-30 2xl:hidden animate-in fade-in duration-150"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-40 w-80 sm:w-96 2xl:static 2xl:z-20 2xl:w-96 border-l border-border bg-card flex flex-col h-full shrink-0 shadow-2xl 2xl:shadow-none select-none animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0 bg-background/50">
          <div className="flex items-center gap-2">
            <CornerDownRight className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-bold text-foreground">Thread</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close thread"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Parent Message Card */}
          <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative shrink-0">
                {parentMessage.author?.avatarUrl ? (
                  <img
                    src={parentMessage.author.avatarUrl}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                    {getInitials(parentMessage.author?.name)}
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5">
                  <PresenceBadge status={parentPresence?.status || 'offline'} size="sm" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-foreground truncate">
                    {parentMessage.author?.name || 'Teammate'}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {formatMsgDate(parentMessage.createdAt)}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-xs text-foreground/90 pl-9 break-words">
              {renderContent(parentMessage.body)}
            </div>
          </div>

          {/* Divider / Replies Count */}
          <div className="flex items-center gap-2 py-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">
              {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Replies Stream */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : replies.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              No replies yet. Start the conversation!
            </div>
          ) : (
            <div className="space-y-3">
              {replies.map((reply) => {
                const replyPresence = presenceMap[reply.userId];
                return (
                  <div
                    key={reply.id}
                    className="group relative flex items-start gap-2.5 p-2 rounded-xl hover:bg-muted/30 transition-colors"
                  >
                    <div className="relative shrink-0 mt-0.5">
                      {reply.author?.avatarUrl ? (
                        <img
                          src={reply.author.avatarUrl}
                          alt=""
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center">
                          {getInitials(reply.author?.name)}
                        </div>
                      )}
                      <span className="absolute -bottom-0.5 -right-0.5">
                        <PresenceBadge status={replyPresence?.status || 'offline'} size="sm" />
                      </span>
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground truncate">
                          {reply.author?.name || 'Teammate'}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {formatMsgDate(reply.createdAt)}
                        </span>
                      </div>
                      <div className="text-xs text-foreground/90 break-words">
                        {renderContent(reply.body)}
                      </div>

                      {/* Reactions tray for replies */}
                      {reply.reactions && reply.reactions.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pt-0.5">
                          {reply.reactions.map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={() =>
                                reactionMutation.mutate({ messageId: reply.id, emoji: r.emoji })
                              }
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border cursor-pointer ${
                                r.hasReacted
                                  ? 'bg-blue-500/15 border-blue-500/30 text-blue-600 dark:text-blue-400 font-bold'
                                  : 'bg-muted/40 border-border text-muted-foreground'
                              }`}
                            >
                              <span>{r.emoji}</span>
                              <span>{r.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Reaction Button on Hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-2 flex items-center gap-1 bg-card border border-border shadow-sm rounded-lg p-0.5">
                      {COMMON_EMOJIS.slice(0, 3).map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => reactionMutation.mutate({ messageId: reply.id, emoji })}
                          className="p-1 hover:bg-muted rounded text-xs transition-transform hover:scale-125 cursor-pointer"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div ref={repliesEndRef} />
            </div>
          )}
        </div>

        {/* Reply Composer */}
        <div className="p-3 border-t border-border bg-background/50 space-y-2 shrink-0">
          <div className="relative rounded-xl border border-border bg-background focus-within:border-primary transition-colors">
            <textarea
              ref={textareaRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Reply to thread... (Enter to send)"
              rows={2}
              className="w-full px-3 py-2 text-xs bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground"
            />

            <div className="flex items-center justify-between px-2 py-1.5 border-t border-border/40">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsTaskPickerOpen(true)}
                  title="Mention Task"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleSend}
                disabled={!replyText.trim() || sendReplyMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
              >
                {sendReplyMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
                <span>Reply</span>
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/70 px-1">
            <span className="font-semibold">Enter</span> to send,{' '}
            <span className="font-semibold">Shift+Enter</span> for newline
          </p>
        </div>

        {/* Task Mention Modal */}
        <TaskMentionPickerModal
          isOpen={isTaskPickerOpen}
          onClose={() => setIsTaskPickerOpen(false)}
          onSelectTask={handleInsertTask}
        />
      </div>
    </>
  );
};
