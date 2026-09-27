import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Loader2, Languages, Forward, CheckCheck, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useDialogClose } from '../../hooks/useDialogClose';
import { chatService, type ChatChannel, type SeenByResult } from '../../lib/chatService';
import { getInitials } from '../../utils/avatar';

const TARGET_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ru', label: 'Russian' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
];

// ─── Translate ────────────────────────────────────────────────────────────────

export const MessageTranslateModal: React.FC<{
  text: string;
  onClose: () => void;
}> = ({ text, onClose }) => {
  // One sanctioned close path (X / backdrop / Esc, idempotent).
  const { requestClose, handleOverlayClick } = useDialogClose({ isOpen: true, onClose });
  const browserLang = (typeof navigator !== 'undefined' ? navigator.language : 'en')
    .slice(0, 2)
    .toLowerCase();
  const [target, setTarget] = useState(
    TARGET_LANGS.some((l) => l.code === browserLang) && browserLang !== 'en' ? browserLang : 'en'
  );
  const [translated, setTranslated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!text.trim()) return;
      setIsLoading(true);
      setTranslated(null);
      try {
        const res = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=auto|${target}`
        );
        const data = await res.json();
        if (!cancelled) setTranslated(data?.responseData?.translatedText ?? null);
      } catch (err: any) {
        if (!cancelled) toast.error(err?.message || 'Translation failed');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [text, target]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Translate message"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Languages className="w-4 h-4 text-primary" />
            Translate
          </h3>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close translate"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="msg-translate-lang" className="text-xs text-muted-foreground">
            To
          </label>
          <select
            id="msg-translate-lang"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 outline-none focus:border-primary"
          >
            {TARGET_LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-xl bg-muted/40 border border-border p-3 text-xs leading-relaxed max-h-32 overflow-y-auto">
          {text}
        </div>
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-xs leading-relaxed min-h-16 max-h-40 overflow-y-auto">
          {isLoading ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Translating…
            </span>
          ) : (
            (translated ?? <span className="text-muted-foreground">No translation available.</span>)
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">Enter to send, Shift+Enter for newline.</p>
      </div>
    </div>
  );
};

// ─── Forward ──────────────────────────────────────────────────────────────────

export const MessageForwardModal: React.FC<{
  messagePreview: string;
  onClose: () => void;
  onForward: (targetChannelId: string) => void;
  isPending?: boolean;
}> = ({ messagePreview, onClose, onForward, isPending }) => {
  // One sanctioned close path (X / backdrop / Esc, idempotent).
  const { requestClose, handleOverlayClick } = useDialogClose({ isOpen: true, onClose });
  const { data: channels = [], isLoading } = useQuery({
    queryKey: ['chat', 'channels'],
    queryFn: () => chatService.listChannels(),
  });
  const [query, setQuery] = useState('');

  const filtered = channels.filter((c: ChatChannel) =>
    c.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Forward message"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Forward className="w-4 h-4 text-primary" />
            Forward to…
          </h3>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close forward"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground truncate border-l-2 border-primary pl-2">
          “{messagePreview.slice(0, 120)}”
        </p>
        <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-2 py-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels or DMs…"
            className="bg-transparent text-xs w-full outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {isLoading ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No channels found.</p>
          ) : (
            filtered.map((c: ChatChannel) => (
              <button
                key={c.id}
                type="button"
                disabled={isPending}
                onClick={() => onForward(c.id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-muted text-left transition-colors cursor-pointer disabled:opacity-50"
              >
                <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                  {getInitials(c.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold truncate">{c.name}</span>
                  <span className="block text-[10px] text-muted-foreground capitalize">
                    {c.type === 'direct' ? 'Direct message' : c.type.replace('_', ' ')} •{' '}
                    {c.memberCount} members
                  </span>
                </span>
                {isPending && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Seen-by ──────────────────────────────────────────────────────────────────

export const MessageSeenPopover: React.FC<{
  messageId: string;
  onClose: () => void;
}> = ({ messageId, onClose }) => {
  // One sanctioned close path (X / backdrop / Esc, idempotent).
  const { requestClose, handleOverlayClick } = useDialogClose({ isOpen: true, onClose });
  const { data, isLoading } = useQuery<SeenByResult>({
    queryKey: ['chat', 'seen', messageId],
    queryFn: () => chatService.getSeenBy(messageId),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Seen by"
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-border bg-card shadow-2xl p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <CheckCheck className="w-4 h-4 text-blue-500" />
            {isLoading ? 'Seen' : `${data?.count ?? 0} Seen`}
          </h3>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close seen list"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-4 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !data || data.readers.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No one has read this yet.
          </p>
        ) : (
          <ul className="max-h-64 overflow-y-auto space-y-1">
            {data.readers.map((r) => (
              <li
                key={r.userId}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/50"
              >
                {r.avatarUrl ? (
                  <img src={r.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                    {getInitials(r.name)}
                  </span>
                )}
                <span className="text-xs font-medium truncate">{r.name}</span>
                <CheckCheck className="w-3.5 h-3.5 text-blue-500 ml-auto shrink-0" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
