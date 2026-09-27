import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CornerUpLeft, Pencil, Trash2, Copy, Check } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';

export const QUICK_REACTION_EMOJIS = ['👍', '😂', '❤️', '😮', '👎', '🔥', '🥰'];

export interface MessageMenuAction {
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleReaction: (emoji: string) => void;
}

interface MessageContextMenuProps {
  /** Viewport coordinates where the menu was invoked. */
  anchor: { x: number; y: number };
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  actions: MessageMenuAction;
}

/**
 * Telegram-style message context menu: quick reactions row + Reply / Copy /
 * Edit / Delete. Opens on right-click (desktop) or long-press (touch),
 * clamped to the viewport, dismissed by outside press / Escape / scroll.
 */
export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  anchor,
  canEdit,
  canDelete,
  onClose,
  actions,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: anchor.x, y: anchor.y });
  const [copied, setCopied] = useState(false);

  useEscapeKey(onClose, true);

  // Dismiss on outside press, scroll, or resize.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [onClose]);

  // Clamp to viewport once the menu size is known.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(anchor.y, window.innerHeight - rect.height - 8)),
    });
  }, [anchor.x, anchor.y]);

  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  const handleCopy = () => {
    actions.onCopy();
    // Inline confirmation (no toast noise) then dismiss.
    setCopied(true);
    window.setTimeout(onClose, 550);
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Message actions"
      className="fixed z-50 w-60 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      style={{ left: position.x, top: position.y }}
    >
      {/* Quick reactions */}
      <div
        className="flex items-center gap-0.5 px-2.5 py-2 bg-muted/30"
        role="group"
        aria-label="Quick reactions"
      >
        {QUICK_REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            role="menuitem"
            aria-label={`React with ${emoji}`}
            onClick={() => run(() => actions.onToggleReaction(emoji))}
            className="flex-1 py-1 text-base rounded-lg hover:bg-muted hover:scale-125 transition-all cursor-pointer"
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="p-1.5 space-y-0.5">
        <button
          type="button"
          role="menuitem"
          onClick={() => run(actions.onReply)}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <CornerUpLeft className="w-3.5 h-3.5 text-muted-foreground" />
          Reply
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={handleCopy}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          {copied ? 'Copied!' : 'Copy Text'}
        </button>
        {canEdit && (
          <button
            type="button"
            role="menuitem"
            onClick={() => run(actions.onEdit)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            Edit
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            role="menuitem"
            onClick={() => run(actions.onDelete)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        )}
      </div>
    </div>,
    document.body
  );
};
