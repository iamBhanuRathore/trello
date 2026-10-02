import React from 'react';
import {
  Send,
  Megaphone,
  CheckSquare,
  CornerUpLeft,
  X,
  WifiOff,
  Paperclip,
  FileText,
  Plus,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ChatChannel, ChatMessageItem, ChatAttachment } from '../../../lib/chatService';
import { MentionAutocompletePopup } from '../MentionAutocomplete';

interface ChatFeedComposerProps {
  channel: ChatChannel;
  messageText: string;
  onTextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  plusMenuRef: React.RefObject<HTMLDivElement | null>;
  mention: any;
  isAnnouncementRestricted: boolean;
  isAnnouncement: boolean;
  onToggleAnnouncement: () => void;
  replyingToMessage: ChatMessageItem | null;
  onCancelReply: () => void;
  isOnline: boolean;
  pendingAttachments: ChatAttachment[];
  onRemovePendingAttachment: (id: string) => void;
  isUploading: boolean;
  isPlusOpen: boolean;
  onTogglePlus: () => void;
  onClosePlus: () => void;
  onAttachFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenTaskPicker: () => void;
  onSendMessage: () => void;
}

export function ChatFeedComposer({
  channel,
  messageText,
  onTextChange,
  onKeyDown,
  textareaRef,
  fileInputRef,
  plusMenuRef,
  mention,
  isAnnouncementRestricted,
  isAnnouncement,
  onToggleAnnouncement,
  replyingToMessage,
  onCancelReply,
  isOnline,
  pendingAttachments,
  onRemovePendingAttachment,
  isUploading,
  isPlusOpen,
  onTogglePlus,
  onClosePlus,
  onAttachFiles,
  onOpenTaskPicker,
  onSendMessage,
}: ChatFeedComposerProps) {
  return (
    <div className="p-4 border-t border-border bg-card/40 backdrop-blur-sm shrink-0">
      {isAnnouncementRestricted ? (
        <div className="p-3 rounded-xl bg-muted/40 border border-border text-center text-xs text-muted-foreground">
          📢 This channel is in announcement-only mode. Only channel admins can post messages.
        </div>
      ) : (
        <div className="relative rounded-2xl border border-border bg-background focus-within:border-primary shadow-xs transition-colors">
          {/* @mention autocomplete */}
          {mention.open && (
            <MentionAutocompletePopup
              members={mention.members}
              activeIndex={mention.activeIndex}
              query={mention.query}
              onSelect={mention.insert}
              onHover={(idx) => mention.setActiveIndex(idx)}
            />
          )}

          {/* Announcement active indicator */}
          {isAnnouncement && (
            <div className="flex items-center justify-between px-3 py-1 border-b border-amber-500/25 bg-amber-500/10 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              <span className="inline-flex items-center gap-1.5">
                <Megaphone className="w-3 h-3" />
                Announcement — visible to everyone
              </span>
              <button
                type="button"
                onClick={onToggleAnnouncement}
                className="p-0.5 rounded hover:bg-amber-500/20 cursor-pointer"
                aria-label="Turn off announcement mode"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Replying to Message Preview Banner */}
          {replyingToMessage && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-primary/10 border-b border-primary/20 text-xs animate-in fade-in duration-150">
              <div className="flex items-center gap-2 min-w-0">
                <CornerUpLeft className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-[11px] text-muted-foreground truncate">
                  Replying to{' '}
                  <strong className="text-foreground font-semibold">
                    {replyingToMessage.author?.name || 'Teammate'}
                  </strong>
                  : &ldquo;{replyingToMessage.body}&rdquo;
                </span>
              </div>
              <button
                type="button"
                onClick={onCancelReply}
                title="Cancel reply (Esc)"
                className="text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer shrink-0 ml-2"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Offline Notification Banner */}
          {!isOnline && (
            <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <span>
                You are offline. Messages will be queued and sent automatically when connection
                returns.
              </span>
            </div>
          )}

          {/* Staged Attachment Chips */}
          {(pendingAttachments.length > 0 || isUploading) && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-border/40">
              {pendingAttachments.map((att) => (
                <span
                  key={att.id}
                  className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-muted/60 border border-border text-[11px] font-medium max-w-[220px]"
                >
                  <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="truncate">{att.fileName}</span>
                  <button
                    type="button"
                    onClick={() => onRemovePendingAttachment(att.id)}
                    aria-label={`Remove ${att.fileName}`}
                    className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {isUploading && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Uploading...
                </span>
              )}
            </div>
          )}

          {/* Input Textarea */}
          <textarea
            ref={textareaRef}
            value={messageText}
            onChange={onTextChange}
            onKeyDown={onKeyDown}
            placeholder={`Message ${channel.type === 'direct' ? channel.name : '#' + channel.name}... (Enter to send)`}
            rows={2}
            className="w-full px-4 py-2 text-xs bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground leading-relaxed"
          />

          {/* Bottom Actions Bar */}
          <div className="flex items-center gap-1 px-2 py-1.5">
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={onAttachFiles}
                aria-label="Attach files"
              />
              <button
                type="button"
                onClick={onTogglePlus}
                title="More actions"
                aria-label="More message actions"
                aria-expanded={isPlusOpen}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isPlusOpen
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Plus className="w-4 h-4" />
              </button>
              {isPlusOpen && (
                <div
                  ref={plusMenuRef}
                  className="absolute bottom-full left-0 mb-1.5 w-60 rounded-xl border border-border bg-popover shadow-xl p-1 z-30 animate-in fade-in-50 duration-100"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onClosePlus();
                      if (isOnline) fileInputRef.current?.click();
                      else toast.error('You are offline. File uploads require a connection.');
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-muted transition-colors cursor-pointer text-left"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Attach files</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">25 MB max</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClosePlus();
                      onOpenTaskPicker();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-muted transition-colors cursor-pointer text-left"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                    <span>Mention task</span>
                  </button>
                  {(channel.role === 'owner' || channel.role === 'admin') &&
                    channel.type !== 'direct' && (
                      <button
                        type="button"
                        onClick={() => {
                          onClosePlus();
                          onToggleAnnouncement();
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-muted transition-colors cursor-pointer text-left"
                      >
                        <Megaphone
                          className={`w-3.5 h-3.5 ${isAnnouncement ? 'text-amber-500' : 'text-muted-foreground'}`}
                        />
                        <span>Announcement {isAnnouncement ? 'on' : 'off'}</span>
                      </button>
                    )}
                  <div className="mt-1 pt-1 border-t border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground leading-relaxed">
                    <span className="font-mono">⌘B</span> bold ·{' '}
                    <span className="font-mono">⌘I</span> italic ·{' '}
                    <span className="font-mono">⌘`</span> code
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onSendMessage}
              disabled={!messageText.trim() && pendingAttachments.length === 0}
              aria-label="Send message"
              className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
