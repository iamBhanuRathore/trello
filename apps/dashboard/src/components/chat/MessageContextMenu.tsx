import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CornerUpLeft,
  Pencil,
  Trash2,
  Copy,
  Check,
  Languages,
  ImageDown,
  Save,
  Pin,
  PinOff,
  Forward,
  CheckSquare,
  CheckCheck,
  ChevronDown,
} from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';

export const QUICK_REACTION_EMOJIS = ['👍', '😂', '❤️', '😮', '👎', '🔥', '🥰'];
const EXTRA_EMOJIS = ['🎉', '👀', '🚀', '👏', '😢', '😡', '🤔', '🙏', '💯', '⚡', '✅', '❌'];

export interface MessageMenuAction {
  onReply: () => void;
  onTranslate: () => void;
  onCopy: () => void;
  onCopyMedia?: () => void;
  onSaveAs?: () => void;
  onEdit: () => void;
  onPin: () => void;
  onForward: () => void;
  onSelect: () => void;
  onShowSeen: () => void;
  onDelete: () => void;
  onToggleReaction: (emoji: string) => void;
}

interface MessageContextMenuProps {
  anchor: { x: number; y: number };
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  isPinned: boolean;
  hasMedia: boolean;
  hasAttachments: boolean;
  seenCount: number;
  seenAvatars?: { avatarUrl?: string | null; name: string }[];
  onClose: () => void;
  actions: MessageMenuAction;
}

/**
 * Telegram-style message context menu for group + DM channels:
 * quick reactions (+ expandable picker) then Reply / Translate / Copy /
 * Media / Pin / Forward / Select / Seen / Delete — same order as Telegram.
 */
export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  anchor,
  canEdit,
  canDelete,
  canPin,
  isPinned,
  hasMedia,
  hasAttachments,
  seenCount,
  seenAvatars = [],
  onClose,
  actions,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: anchor.x, y: anchor.y });
  const [copied, setCopied] = useState(false);
  const [emojiExpanded, setEmojiExpanded] = useState(false);

  useEscapeKey(onClose, true);

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

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(anchor.y, window.innerHeight - rect.height - 8)),
    });
  }, [anchor.x, anchor.y, emojiExpanded]);

  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  const handleCopy = () => {
    actions.onCopy();
    setCopied(true);
    window.setTimeout(onClose, 550);
  };

  const itemCls =
    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer';
  const iconCls = 'w-3.5 h-3.5 text-muted-foreground shrink-0';

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Message actions"
      className="fixed z-50 w-60 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      style={{ left: position.x, top: position.y }}
    >
      {/* Quick reactions */}
      <div className="px-2.5 py-2 bg-muted/30" role="group" aria-label="Quick reactions">
        <div className="flex items-center gap-0.5">
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
          <button
            type="button"
            aria-label={emojiExpanded ? 'Show fewer emojis' : 'Show more emojis'}
            aria-expanded={emojiExpanded}
            onClick={() => setEmojiExpanded((v) => !v)}
            className="p-1 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${emojiExpanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
        {emojiExpanded && (
          <div className="grid grid-cols-6 gap-0.5 pt-1.5">
            {EXTRA_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`React with ${emoji}`}
                onClick={() => run(() => actions.onToggleReaction(emoji))}
                className="py-1 text-base rounded-lg hover:bg-muted hover:scale-125 transition-all cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-1.5 space-y-0.5 max-h-[50vh] overflow-y-auto">
        <button
          type="button"
          role="menuitem"
          onClick={() => run(actions.onReply)}
          className={itemCls}
        >
          <CornerUpLeft className={iconCls} />
          Reply
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => run(actions.onTranslate)}
          className={itemCls}
        >
          <Languages className={iconCls} />
          Translate
        </button>
        <button type="button" role="menuitem" onClick={handleCopy} className={itemCls}>
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          ) : (
            <Copy className={iconCls} />
          )}
          {copied ? 'Copied!' : 'Copy Text'}
        </button>
        {hasMedia && actions.onCopyMedia && (
          <button
            type="button"
            role="menuitem"
            onClick={() => run(actions.onCopyMedia!)}
            className={itemCls}
          >
            <ImageDown className={iconCls} />
            Copy Media
          </button>
        )}
        {hasAttachments && actions.onSaveAs && (
          <button
            type="button"
            role="menuitem"
            onClick={() => run(actions.onSaveAs!)}
            className={itemCls}
          >
            <Save className={iconCls} />
            Save As…
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            role="menuitem"
            onClick={() => run(actions.onEdit)}
            className={itemCls}
          >
            <Pencil className={iconCls} />
            Edit
          </button>
        )}
        {canPin && (
          <button
            type="button"
            role="menuitem"
            onClick={() => run(actions.onPin)}
            className={itemCls}
          >
            {isPinned ? <PinOff className={iconCls} /> : <Pin className={iconCls} />}
            {isPinned ? 'Unpin' : 'Pin'}
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          onClick={() => run(actions.onForward)}
          className={`${itemCls} justify-between`}
        >
          <span className="flex items-center gap-2.5">
            <Forward className={iconCls} />
            Forward
          </span>
          <span className="text-muted-foreground">›</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => run(actions.onSelect)}
          className={itemCls}
        >
          <CheckSquare className={iconCls} />
          Select
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => run(actions.onShowSeen)}
          className={`${itemCls} justify-between`}
        >
          <span className="flex items-center gap-2.5">
            <CheckCheck className={iconCls} />
            {seenCount > 0 ? `${seenCount} Seen` : 'Seen'}
          </span>
          {seenAvatars.length > 0 && (
            <span className="flex -space-x-1.5">
              {seenAvatars.slice(0, 2).map((s, i) =>
                s.avatarUrl ? (
                  <img
                    key={i}
                    src={s.avatarUrl}
                    alt=""
                    className="w-5 h-5 rounded-full object-cover border border-card"
                  />
                ) : (
                  <span
                    key={i}
                    className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[8px] font-bold flex items-center justify-center border border-card"
                  >
                    {(s.name || '?').slice(0, 1).toUpperCase()}
                  </span>
                )
              )}
              <span className="text-muted-foreground text-xs pl-1">›</span>
            </span>
          )}
        </button>
        {canDelete && (
          <button
            type="button"
            role="menuitem"
            onClick={() => run(actions.onDelete)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            Delete
          </button>
        )}
      </div>
    </div>,
    document.body
  );
};
