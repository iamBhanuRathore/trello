import { Pin, X } from 'lucide-react';
import type { ChatMessageItem } from '../../../lib/chatService';

interface PinnedMessageBannerProps {
  latestPinned: ChatMessageItem;
  pinnedCount: number;
  canUnpin: boolean;
  onJumpToMessage: (id: string) => void;
  onUnpin: (id: string) => void;
}

export function PinnedMessageBanner({
  latestPinned,
  pinnedCount,
  canUnpin,
  onJumpToMessage,
  onUnpin,
}: PinnedMessageBannerProps) {
  // NOTE (a11y): the jump control and the unpin control are sibling
  // <button>s, not nested — interactive content must not nest. The outer
  // wrapper is a plain div; keyboard users tab jump → unpin in order.
  return (
    <div className="mx-4 mt-2 flex items-center gap-2.5 px-3 py-2 rounded-xl bg-blue-500/8 border border-blue-500/20 text-left hover:bg-blue-500/15 transition-colors shrink-0">
      <button
        type="button"
        onClick={() => onJumpToMessage(latestPinned.id)}
        title="Jump to pinned message"
        className="min-w-0 flex-1 flex items-center gap-2.5 text-left cursor-pointer rounded-lg"
      >
        <Pin className="w-3.5 h-3.5 text-blue-500 shrink-0 fill-blue-500/20" />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
            Pinned{pinnedCount > 1 ? ` • ${pinnedCount}` : ''}
          </span>
          <span className="block text-xs text-foreground/80 truncate">{latestPinned.body}</span>
        </span>
      </button>
      {canUnpin && (
        <button
          type="button"
          aria-label="Unpin message"
          onClick={() => onUnpin(latestPinned.id)}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
