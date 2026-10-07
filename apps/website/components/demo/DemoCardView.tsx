'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MessageSquare } from 'lucide-react';
import type { DemoCard } from '@/lib/demo';

export default function DemoCardView({ card }: { card: DemoCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`touch-none rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5 text-left shadow-sm transition-opacity ${
        isDragging ? 'opacity-60 shadow-md' : ''
      }`}
    >
      <span
        className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
        style={{ background: card.labelColor }}
      >
        {card.label}
      </span>
      <p className="mt-1.5 text-[13px] font-medium leading-snug">{card.title}</p>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--muted-fg)]">
        <span className="grid size-5 place-items-center rounded-full bg-[#eef2ff] font-bold text-[#4338ca]">
          {card.assignee.slice(0, 2)}
        </span>
        <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 font-mono">{card.points}pt</span>
        <span>{card.due}</span>
        {card.comments > 0 && (
          <span className="ml-auto inline-flex items-center gap-1">
            <MessageSquare size={12} aria-hidden /> {card.comments}
          </span>
        )}
      </div>
    </div>
  );
}
