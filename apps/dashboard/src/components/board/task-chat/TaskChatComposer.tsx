import React, {
  type KeyboardEvent,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react';
import {
  Paperclip,
  Smile,
  Send,
  Loader2,
  AtSign,
  X,
  CornerUpLeft,
  FileText,
  UploadCloud,
} from 'lucide-react';
import type { ChatMessage, PendingAttachment } from './types';

interface TaskChatComposerProps {
  inputText: string;
  onInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isDragOver: boolean;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  replyingTo: ChatMessage | null;
  onCancelReply: () => void;
  pendingAttachments: PendingAttachment[];
  onRemovePendingAttachment: (id: string) => void;
  onAddPendingFiles: (files: File[]) => void;
  showMentionMenu: boolean;
  mentionQuery: string;
  filteredMembers: any[];
  selectedIndex: number;
  onInsertMention: (member: any) => void;
  onSetSelectedIndex: (idx: number) => void;
  onMentionButtonClick: () => void;
  selectedEmoji: boolean;
  onToggleEmoji: () => void;
  onAddQuickEmoji: (emoji: string) => void;
  onSend: () => void;
  isSending: boolean;
  isUploadingFiles: boolean;
}

export function TaskChatComposer({
  inputText,
  onInputChange,
  onKeyDown,
  onPaste,
  textareaRef,
  fileInputRef,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  replyingTo,
  onCancelReply,
  pendingAttachments,
  onRemovePendingAttachment,
  onAddPendingFiles,
  showMentionMenu,
  mentionQuery,
  filteredMembers,
  selectedIndex,
  onInsertMention,
  onSetSelectedIndex,
  onMentionButtonClick,
  selectedEmoji,
  onToggleEmoji,
  onAddQuickEmoji,
  onSend,
  isSending,
  isUploadingFiles,
}: TaskChatComposerProps) {
  return (
    <div className="p-3 bg-card/90 backdrop-blur-md border-t border-border/80 shrink-0 relative">
      {/* ─── Autocomplete Mentions Dropdown ─── */}
      {showMentionMenu && (
        <div className="absolute z-50 bottom-full mb-2 left-3 right-3 rounded-xl border border-border bg-popover/95 backdrop-blur-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
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
                    onClick={() => onInsertMention(member)}
                    onMouseEnter={() => onSetSelectedIndex(idx)}
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
        <div className="absolute z-50 bottom-full mb-2 right-4 p-2 rounded-xl bg-popover border border-border shadow-2xl flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100">
          {['👍', '🚀', '🔥', '✅', '❤️', '👀', '🎉', '💯'].map((emo) => (
            <button
              key={emo}
              type="button"
              className="text-lg hover:scale-125 transition-transform p-1 cursor-pointer"
              onClick={() => onAddQuickEmoji(emo)}
            >
              {emo}
            </button>
          ))}
        </div>
      )}

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`border rounded-2xl bg-muted/20 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10 transition-all shadow-xs overflow-hidden ${
          isDragOver
            ? 'border-dashed border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/20'
            : 'border-border/80'
        }`}
      >
        {/* Active Replying-To Banner */}
        {replyingTo && (
          <div className="flex items-center justify-between px-3 py-1.5 bg-sky-500/10 border-b border-sky-500/20 text-xs text-foreground animate-in slide-in-from-bottom-2 duration-100">
            <div className="flex items-center gap-2 min-w-0">
              <CornerUpLeft className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
              <span className="font-semibold text-sky-600 dark:text-sky-400 shrink-0">
                Replying to {replyingTo.authorName || 'Teammate'}:
              </span>
              <span className="text-muted-foreground truncate text-[11px]">
                {replyingTo.body.replace(/^>.*?\n\n/s, '').trim()}
              </span>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer transition-colors"
              title="Cancel reply"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Drag & Drop Overlay Indicator */}
        {isDragOver && (
          <div className="px-3 py-2 bg-sky-500/10 border-b border-sky-500/30 flex items-center justify-center gap-2 text-xs font-semibold text-sky-600 dark:text-sky-400 animate-in fade-in duration-100">
            <UploadCloud className="w-4 h-4 animate-bounce" />
            <span>Drop screenshots or files here to attach</span>
          </div>
        )}

        {/* Pending Attachments Tray */}
        {pendingAttachments.length > 0 && (
          <div className="px-3 pt-2.5 pb-2 flex flex-wrap gap-2 border-b border-border/40 bg-muted/10 max-h-36 overflow-y-auto">
            {pendingAttachments.map((att) => (
              <div
                key={att.id}
                className="group relative flex items-center gap-2 p-1.5 pr-2 rounded-xl border border-border/80 bg-card shadow-2xs text-xs hover:border-sky-500/50 transition-all max-w-[240px]"
              >
                {att.previewUrl ? (
                  <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-border/60 bg-muted/40 shrink-0">
                    <img
                      src={att.previewUrl}
                      alt={att.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p
                    className="text-[11px] font-semibold text-foreground truncate leading-snug"
                    title={att.name}
                  >
                    {att.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {Math.max(1, Math.round(att.size / 1024))} KB
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onRemovePendingAttachment(att.id)}
                  className="w-5 h-5 rounded-full bg-muted/80 hover:bg-red-500 hover:text-white text-muted-foreground flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  title="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Main Input Textarea */}
        <textarea
          ref={textareaRef}
          rows={2}
          value={inputText}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={
            pendingAttachments.length > 0
              ? 'Add an optional note or press Enter to send...'
              : 'Type @ to mention, paste screenshots (Cmd+V), or write a message...'
          }
          className="w-full p-3 bg-transparent border-0 outline-none text-xs leading-relaxed resize-none placeholder:text-muted-foreground/80 text-foreground"
        />

        {/* Composer Bottom Action Bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-t border-border/50 text-xs">
          {/* Left Tools: Attachment & Mention */}
          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) {
                  onAddPendingFiles(files);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              className="relative w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
              title="Attach files or paste screenshots"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="w-4 h-4" />
              {pendingAttachments.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-sky-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {pendingAttachments.length}
                </span>
              )}
            </button>

            <button
              type="button"
              className="w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary flex items-center justify-center transition-colors cursor-pointer"
              title="Mention teammate"
              onClick={onMentionButtonClick}
            >
              <AtSign className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right Tools: Emoji, Send */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
              title="Quick emojis"
              onClick={onToggleEmoji}
            >
              <Smile className="w-4 h-4" />
            </button>

            {/* Circular Blue Send Button */}
            <button
              type="button"
              disabled={
                (!inputText.trim() && pendingAttachments.length === 0) ||
                isSending ||
                isUploadingFiles
              }
              onClick={onSend}
              className="w-7 h-7 rounded-full bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs disabled:cursor-not-allowed"
              title={isUploadingFiles ? 'Uploading attachments...' : 'Send message'}
            >
              {isSending || isUploadingFiles ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 translate-x-px" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
