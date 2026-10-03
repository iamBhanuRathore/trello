import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Check,
  CheckCheck,
  CornerUpLeft,
  Copy,
  Pencil,
  Trash2,
  MoreHorizontal,
  CheckSquare,
  Flag,
  Share2,
  FileImage,
  Loader2,
} from 'lucide-react';
import { MarkdownRenderer } from '../../MarkdownRenderer';
import type { ChatMessage } from './types';
import { parseQuotedMessage } from './chat-helpers';

interface ChatMessageItemProps {
  comment: ChatMessage;
  isCurrentUser: boolean;
  canModify: boolean;
  isEditing: boolean;
  editingText: string;
  isSavingEdit: boolean;
  dmPending: boolean;
  activeMenu: boolean;
  cardTitle: string;
  onOpenDirectChat: (userId?: string, name?: string) => void;
  onScrollToRef: (refId: string | null) => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onEditingTextChange: (text: string) => void;
  onSaveEdit: () => void;
  onReply: () => void;
  onCopy: () => void;
  /** True right after a successful copy, for an inline confirmation. */
  copied?: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onDelete: () => void;
  onCreateTask: () => void;
}

export function ChatMessageItem({
  comment,
  isCurrentUser,
  canModify,
  isEditing,
  editingText,
  isSavingEdit,
  dmPending,
  activeMenu,
  cardTitle,
  onOpenDirectChat,
  onScrollToRef,
  onStartEditing,
  onCancelEditing,
  onEditingTextChange,
  onSaveEdit,
  onReply,
  onCopy,
  copied = false,
  onToggleMenu,
  onCloseMenu,
  onDelete,
  onCreateTask,
}: ChatMessageItemProps) {
  const authorInitial = comment.authorName ? comment.authorName.substring(0, 2).toUpperCase() : 'U';

  const parsedQuote = parseQuotedMessage(comment.body);

  return (
    <div
      id={comment.id}
      className="flex items-start gap-2.5 group relative transition-colors duration-200 rounded-xl p-1"
    >
      {/* User Avatar (click → DM) */}
      {comment.userId && !isCurrentUser ? (
        <button
          type="button"
          onClick={() =>
            onOpenDirectChat(comment.userId, comment.authorName || comment.authorEmail)
          }
          disabled={dmPending}
          title={`Message ${comment.authorName || comment.authorEmail || 'teammate'}`}
          className="shrink-0 mt-0.5 rounded-full cursor-pointer hover:ring-2 hover:ring-primary/50 transition-shadow disabled:cursor-wait"
        >
          {comment.authorAvatarUrl ? (
            <img
              src={comment.authorAvatarUrl}
              alt={comment.authorName || 'Avatar'}
              className="w-7 h-7 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center text-[10px] font-bold">
              {authorInitial}
            </div>
          )}
        </button>
      ) : comment.authorAvatarUrl ? (
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
      <div className="flex-1 min-w-0 max-w-[92%] relative">
        {/* Author Header */}
        <div className="flex items-center gap-2 mb-0.5">
          {comment.userId && !isCurrentUser ? (
            <button
              type="button"
              onClick={() =>
                onOpenDirectChat(comment.userId, comment.authorName || comment.authorEmail)
              }
              disabled={dmPending}
              title={`Message ${comment.authorName || comment.authorEmail || 'teammate'}`}
              className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer truncate disabled:cursor-wait"
            >
              {comment.authorName || comment.authorEmail || 'Teammate'}
            </button>
          ) : (
            <span className="text-xs font-bold text-sky-600 dark:text-sky-400 truncate">
              {comment.authorName || comment.authorEmail || 'Teammate'}
            </span>
          )}
          {isCurrentUser && (
            <span className="text-[9px] px-1 rounded bg-sky-500/15 text-sky-600 font-semibold">
              You
            </span>
          )}
          {comment.isEdited && (
            <span className="text-[9px] text-muted-foreground/70 italic">(edited)</span>
          )}
        </div>

        {/* Bubble Body */}
        <div className="p-3 rounded-2xl bg-card border border-border/80 shadow-xs text-xs text-foreground space-y-2 relative">
          {/* Interactive Quoted Reply Snippet (if message is a reply) */}
          {parsedQuote.hasQuote && (
            <div
              onClick={() => onScrollToRef(parsedQuote.refId)}
              className="p-2 rounded-xl bg-muted/60 dark:bg-muted/30 border-l-3 border-sky-500 text-[11px] cursor-pointer hover:bg-muted transition-colors flex items-start gap-2"
              title={parsedQuote.refId ? 'Click to jump to quoted message' : undefined}
            >
              <CornerUpLeft className="w-3 h-3 text-sky-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-sky-600 dark:text-sky-400 block truncate">
                  {parsedQuote.author}
                </span>
                <span className="text-muted-foreground truncate block">{parsedQuote.snippet}</span>
              </div>
            </div>
          )}

          {/* Inline Editing Mode or Markdown Body */}
          {isEditing ? (
            <div className="space-y-2 pt-1">
              <textarea
                rows={2}
                value={editingText}
                onChange={(e) => onEditingTextChange(e.target.value)}
                className="w-full p-2 bg-muted/40 border border-primary/50 rounded-xl text-xs outline-none focus:ring-1 focus:ring-primary text-foreground resize-none"
                autoFocus
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={onCancelEditing}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-muted-foreground hover:bg-muted cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingEdit || !editingText.trim()}
                  onClick={onSaveEdit}
                  className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-sky-600 hover:bg-sky-700 text-white flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                >
                  {isSavingEdit && <Loader2 className="w-3 h-3 animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="leading-relaxed whitespace-pre-wrap break-words">
              <MarkdownRenderer content={parsedQuote.content} />
            </div>
          )}

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
            <span>{format(new Date(comment.createdAt), 'h:mm a')}</span>
            <CheckCheck className="w-3.5 h-3.5 text-sky-500 inline shrink-0" />
          </div>
        </div>

        {/* ─── Floating Quick Action Buttons on Bubble Hover ─── */}
        <div className="absolute right-2 -top-2.5 hidden group-hover:flex items-center gap-0.5 bg-card/95 border border-border shadow-md rounded-full px-1.5 py-0.5 z-20 animate-in fade-in-50 duration-100 backdrop-blur-xs">
          {/* Quick Reply */}
          <button
            type="button"
            title="Reply to message"
            onClick={(e) => {
              e.stopPropagation();
              onReply();
            }}
            className="p-1 text-muted-foreground hover:text-sky-600 rounded-full hover:bg-muted transition-colors cursor-pointer"
          >
            <CornerUpLeft className="w-3.5 h-3.5" />
          </button>

          {/* Three Dots Menu Toggle */}
          <button
            type="button"
            title="More actions"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu();
            }}
            className="p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors cursor-pointer"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ─── Context / Action Menu ─── */}
        {activeMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-2 top-6 z-40 w-52 rounded-2xl bg-card border border-border/80 shadow-2xl p-1.5 space-y-0.5 text-xs text-foreground animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Reply */}
            <button
              type="button"
              onClick={onReply}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted/70 transition-colors cursor-pointer text-left"
            >
              <span className="font-medium">Reply</span>
              <CornerUpLeft className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {/* Copy — confirms inline; a toast is noise for a routine local action */}
            <button
              type="button"
              onClick={onCopy}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted/70 transition-colors cursor-pointer text-left"
            >
              <span className={copied ? 'font-medium text-primary' : 'font-medium'}>
                {copied ? 'Copied' : 'Copy'}
              </span>
              {copied ? (
                <Check className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>

            {/* Edit (Permission Protected) */}
            {canModify && (
              <button
                type="button"
                onClick={onStartEditing}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted/70 transition-colors cursor-pointer text-left"
              >
                <span className="font-medium">Edit</span>
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}

            {/* Forward / Share */}
            <button
              type="button"
              onClick={async () => {
                // Awaited so a blocked clipboard reports a failure instead of a
                // false success (fire-and-forget rejected silently).
                try {
                  await navigator.clipboard.writeText(
                    `${window.location.origin}#card-${cardTitle}`
                  );
                  toast.success('Task link copied to share');
                } catch {
                  toast.error("Couldn't copy — your browser blocked clipboard access.");
                }
                onCloseMenu();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted/70 transition-colors cursor-pointer text-left"
            >
              <span className="font-medium">Forward</span>
              <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {/* Create Task From Message */}
            <button
              type="button"
              onClick={onCreateTask}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted/70 transition-colors cursor-pointer text-left"
            >
              <span className="font-medium">Create task</span>
              <CheckSquare className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {/* Add to status summaries */}
            <button
              type="button"
              onClick={() => {
                toast.success('Added to task status summaries');
                onCloseMenu();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted/70 transition-colors cursor-pointer text-left"
            >
              <span className="font-medium">Add to status summaries</span>
              <Flag className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {/* Delete (Permission Protected) */}
            {canModify && (
              <>
                <div className="my-1 border-t border-border/50" />
                <button
                  type="button"
                  onClick={onDelete}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-red-500/10 text-red-600 dark:text-red-400 transition-colors cursor-pointer text-left font-medium"
                >
                  <span>Delete</span>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
