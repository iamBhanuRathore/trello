import React, { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../../lib/api';
import { getInitials } from '../../utils/avatar';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface Viewer {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  viewedAt: string;
}

/** Bitrix-style "Viewed by" — eye counter opening the viewer ledger. */
export const CardViewers: React.FC<{ cardId: string }> = ({ cardId }) => {
  const [open, setOpen] = React.useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  const { data } = useQuery({
    queryKey: ['card', cardId, 'viewers'],
    queryFn: async () =>
      (await api.get(`/cards/${cardId}/viewers`)).data as {
        count: number;
        viewers: Viewer[];
      },
    enabled: open,
    staleTime: 30_000,
  });

  useEscapeKey(() => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Show who viewed this task"
        title="Viewed by"
        className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
      >
        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
        <span>{data?.count ?? ''}</span>
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-64 rounded-2xl border border-border bg-card shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
            Viewed by {data?.count ?? 0}
          </div>
          {!data ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">Loading...</div>
          ) : data.viewers.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">No views yet.</div>
          ) : (
            <ul className="max-h-64 overflow-y-auto space-y-0.5">
              {data.viewers.map((v) => (
                <li
                  key={v.userId}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/50"
                >
                  {v.avatarUrl ? (
                    <img
                      src={v.avatarUrl}
                      alt=""
                      className="w-6 h-6 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                      {getInitials(v.name)}
                    </span>
                  )}
                  <span className="text-xs font-medium truncate flex-1">{v.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(v.viewedAt), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </span>
  );
};
