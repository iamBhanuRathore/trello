'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { LayoutGrid, Table2, RotateCcw, Search } from 'lucide-react';
import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import DemoColumnView from '@/components/demo/DemoColumnView';
import { useDemoBoard } from '@/components/demo/useDemoBoard';
import { TEMPLATES } from '@/lib/demo';

export default function LiveDemo() {
  const { board, moveCard, addCard, reset, loadTemplate } = useDemoBoard();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'board' | 'table'>('board');
  const [notice, setNotice] = useState('');
  const lastMove = useRef('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const onLoad = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const t = TEMPLATES.find((x) => x.id === id);
      if (t) {
        loadTemplate(t);
        setNotice(`“${t.name}” loaded — drag its cards around.`);
        document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' });
      }
    };
    window.addEventListener('boardly:load-template', onLoad);
    return () => window.removeEventListener('boardly:load-template', onLoad);
  }, [loadTemplate]);

  const onDragOver = (e: DragOverEvent) => {
    const active = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (over && active !== over) {
      lastMove.current = `${active}>${over}`;
      moveCard(active, over);
    }
  };
  const onDragEnd = (e: DragEndEvent) => {
    const active = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    // dragOver already applied this exact move live — skip to avoid a double shift
    if (over && active !== over && lastMove.current !== `${active}>${over}`) moveCard(active, over);
    lastMove.current = '';
  };

  const total = Object.keys(board.cards).length;
  const doneCol = board.columns[board.columns.length - 1];
  const done = doneCol ? doneCol.cardIds.length : 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <section
      id="demo"
      className="scroll-mt-24 border-b border-[var(--border)] bg-[var(--muted)]/40"
    >
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Try it live"
            title="A real board, right here — drag cards around"
            desc="Fully interactive demo persisted in your browser. Add cards, search, switch views, or load a template. Nothing leaves your device."
          />
        </Reveal>
        <Reveal>
          <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3 sm:px-4">
              <div className="relative min-w-40 flex-1 sm:max-w-64">
                <Search
                  size={15}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-fg)]"
                  aria-hidden
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search cards…"
                  aria-label="Search demo cards"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-2 pl-8 pr-3 text-sm outline-none focus:border-[#6366f1]"
                />
              </div>
              <div
                className="flex rounded-lg border border-[var(--border)] p-0.5"
                role="group"
                aria-label="Demo view"
              >
                {(
                  [
                    { v: 'board', icon: LayoutGrid, label: 'Board' },
                    { v: 'table', icon: Table2, label: 'Table' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.v}
                    type="button"
                    onClick={() => setView(t.v)}
                    aria-pressed={view === t.v}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
                      view === t.v
                        ? 'bg-[#6366f1] text-white'
                        : 'text-[var(--muted-fg)] hover:bg-[var(--muted)]'
                    }`}
                  >
                    <t.icon size={14} aria-hidden /> {t.label}
                  </button>
                ))}
              </div>
              <select
                value=""
                onChange={(e) => {
                  const t = TEMPLATES.find((x) => x.id === e.target.value);
                  if (t) {
                    loadTemplate(t);
                    setNotice(`“${t.name}” loaded — drag its cards around.`);
                  }
                }}
                aria-label="Load a template into the demo"
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-xs font-medium outline-none focus:border-[#6366f1]"
              >
                <option value="">Load template…</option>
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  reset();
                  setQuery('');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--muted-fg)] hover:bg-[var(--muted)]"
              >
                <RotateCcw size={14} aria-hidden /> Reset
              </button>
            </div>
            <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 text-xs text-[var(--muted-fg)]">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--muted)]"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Demo completion"
              >
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="shrink-0 font-semibold">
                {done}/{total} done · {pct}%
              </span>
            </div>
            {notice && (
              <p
                role="status"
                className="border-b border-[var(--border)] bg-[#eef2ff] px-4 py-2 text-xs font-medium text-[#4338ca]"
              >
                {notice}
              </p>
            )}
            {view === 'board' ? (
              <DndContext sensors={sensors} onDragOver={onDragOver} onDragEnd={onDragEnd}>
                <div className="flex snap-x gap-3 overflow-x-auto p-3 sm:p-4">
                  {board.columns.map((col) => (
                    <DemoColumnView
                      key={col.id}
                      column={col}
                      cards={col.cardIds.map((id) => board.cards[id]!).filter(Boolean)}
                      query={query}
                      onAdd={addCard}
                    />
                  ))}
                </div>
              </DndContext>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-[var(--muted-fg)]">
                      <th className="px-4 py-2.5 font-medium">Card</th>
                      <th className="px-4 py-2.5 font-medium">Stage</th>
                      <th className="px-4 py-2.5 font-medium">Owner</th>
                      <th className="px-4 py-2.5 font-medium">Pts</th>
                      <th className="px-4 py-2.5 font-medium">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.columns.flatMap((col) =>
                      col.cardIds
                        .map((id) => board.cards[id]!)
                        .filter(Boolean)
                        .filter(
                          (c) =>
                            !query.trim() ||
                            `${c.title} ${c.label}`
                              .toLowerCase()
                              .includes(query.trim().toLowerCase())
                        )
                        .map((c) => (
                          <tr key={c.id} className="border-t border-[var(--border)]">
                            <td className="px-4 py-2.5 font-medium">{c.title}</td>
                            <td className="px-4 py-2.5">
                              <span
                                className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                                style={{ background: c.labelColor }}
                              >
                                {col.name}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-[var(--muted-fg)]">{c.assignee}</td>
                            <td className="px-4 py-2.5 font-mono">{c.points}</td>
                            <td className="px-4 py-2.5 text-[var(--muted-fg)]">{c.due}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
