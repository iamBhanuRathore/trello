'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import type { DemoCard, DemoColumn } from '@/lib/demo';
import DemoCardView from './DemoCardView';

export default function DemoColumnView({
  column,
  cards,
  query,
  onAdd,
}: {
  column: DemoColumn;
  cards: DemoCard[];
  query: string;
  onAdd: (columnId: string, title: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const q = query.trim().toLowerCase();
  const visible = q
    ? cards.filter((c) => `${c.title} ${c.label}`.toLowerCase().includes(q))
    : cards;

  const submit = () => {
    if (draft.trim()) {
      onAdd(column.id, draft.trim());
      setDraft('');
      setAdding(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 snap-start flex-col rounded-xl p-2 transition-colors ${
        isOver ? 'bg-[#e0e7ff]' : 'bg-[var(--muted)]'
      }`}
    >
      <p className="flex items-center justify-between px-1.5 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
        {column.name}
        <span className="rounded-full bg-[var(--card)] px-2 py-0.5">{cards.length}</span>
      </p>
      <SortableContext items={visible.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-16 flex-col gap-2">
          {visible.map((c) => (
            <DemoCardView key={c.id} card={c} />
          ))}
          {visible.length === 0 && (
            <p className="rounded-lg border border-dashed border-[var(--border)] p-3 text-center text-xs text-[var(--muted-fg)]">
              {q ? 'No matches — clear search' : 'Drop cards here'}
            </p>
          )}
        </div>
      </SortableContext>
      {adding ? (
        <div className="mt-2 space-y-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') setAdding(false);
            }}
            placeholder="Card title… (Enter to add)"
            aria-label={`New card in ${column.name}`}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-[13px] outline-none focus:border-[#6366f1]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              className="rounded-md bg-[#6366f1] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4f46e5]"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-md px-3 py-1.5 text-xs text-[var(--muted-fg)] hover:bg-[var(--card)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--muted-fg)] transition-colors hover:bg-[var(--card)] hover:text-[var(--foreground)]"
        >
          <Plus size={14} aria-hidden /> Add card
        </button>
      )}
    </div>
  );
}
