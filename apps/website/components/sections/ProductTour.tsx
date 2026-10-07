'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { TOUR_TABS } from '@/lib/conversion';

export default function ProductTour() {
  const [active, setActive] = useState<(typeof TOUR_TABS)[number]['id']>(TOUR_TABS[0]!.id);
  const tab = TOUR_TABS.find((t) => t.id === active)!;

  return (
    <section id="tour" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Product tour"
            title="One platform, five superpowers"
            desc="Every module reads the same cards, the same people, the same history. Pick a tab — everything below is live."
          />
        </Reveal>
        <Reveal>
          <div role="tablist" aria-label="Product areas" className="mt-8 flex flex-wrap gap-2">
            {TOUR_TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={active === t.id}
                aria-controls={`tour-panel-${t.id}`}
                id={`tour-tab-${t.id}`}
                onClick={() => setActive(t.id)}
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                  e.preventDefault();
                  const ids = TOUR_TABS.map((x) => x.id);
                  const i = ids.indexOf(active);
                  const next =
                    e.key === 'ArrowRight'
                      ? ids[(i + 1) % ids.length]!
                      : ids[(i - 1 + ids.length) % ids.length]!;
                  setActive(next);
                  document.getElementById(`tour-tab-${next}`)?.focus();
                }}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  active === t.id
                    ? 'bg-[#6366f1] text-white'
                    : 'border border-[var(--border)] text-[var(--muted-fg)] hover:bg-[var(--muted)]'
                }`}
              >
                <t.icon size={16} aria-hidden /> {t.name}
              </button>
            ))}
          </div>
        </Reveal>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Reveal key={`copy-${tab.id}`}>
            <div
              role="tabpanel"
              id={`tour-panel-${tab.id}`}
              aria-labelledby={`tour-tab-${tab.id}`}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-7"
            >
              <h3 className="text-xl font-bold sm:text-2xl">{tab.headline}</h3>
              <p className="mt-2 text-sm text-[var(--muted-fg)] sm:text-base">{tab.desc}</p>
              <ul className="mt-4 space-y-2.5">
                {tab.bullets.map((b) => (
                  <li key={b} className="flex gap-2 text-sm">
                    <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <a
                href="#demo"
                className="mt-5 inline-block text-sm font-semibold text-[#4f46e5] hover:underline"
              >
                Try it in the live demo →
              </a>
            </div>
          </Reveal>
          <Reveal key={`visual-${tab.id}`} aria-label={`${tab.name} illustration`}>
            <div className="flex h-full min-h-56 flex-col justify-center gap-2.5 rounded-2xl bg-[var(--muted)] p-5 sm:p-7">
              {tab.id === 'boards' && <BoardsVisual />}
              {tab.id === 'sprints' && <SprintVisual />}
              {tab.id === 'docs' && <DocsVisual />}
              {tab.id === 'automations' && <AutoVisual />}
              {tab.id === 'reports' && <ReportVisual />}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Bar({ w, c }: { w: string; c: string }) {
  return <div className="h-2.5 rounded-full" style={{ width: w, background: c }} />;
}

function BoardsVisual() {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {[
        ['To Do', 3, '#94a3b8'],
        ['Doing', 2, '#6366f1'],
        ['Done', 4, '#22c55e'],
      ].map(([name, n, color]) => (
        <div key={name as string} className="rounded-xl bg-[var(--card)] p-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted-fg)]">
            {name}
          </p>
          <div className="mt-2 space-y-1.5">
            {Array.from({ length: Number(n) }).map((_, i) => (
              <div
                key={i}
                className="h-8 rounded-md border border-[var(--border)] bg-[var(--background)]"
              >
                <div
                  className="m-1.5 h-1.5 w-2/3 rounded-full"
                  style={{ background: color as string }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SprintVisual() {
  return (
    <div className="rounded-xl bg-[var(--card)] p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold">Sprint 24 · Burndown</p>
        <p className="font-mono text-xs text-[var(--muted-fg)]">32 → 6 pts</p>
      </div>
      <svg
        viewBox="0 0 200 80"
        className="mt-2 w-full"
        role="img"
        aria-label="Burndown chart trending down"
      >
        <polyline
          points="4,8 60,28 110,34 160,58 196,62"
          fill="none"
          stroke="#6366f1"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <line
          x1="4"
          y1="8"
          x2="196"
          y2="72"
          stroke="#94a3b8"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />
      </svg>
      <p className="mt-1 text-xs text-[var(--muted-fg)]">
        Velocity 28 pts · on track to finish Thursday
      </p>
    </div>
  );
}

function DocsVisual() {
  return (
    <div className="space-y-2.5">
      {[
        ['Launch plan', 'w-3/4'],
        [' linked card  BCW-12', 'w-1/2'],
        [' linked card  BCW-18', 'w-2/3'],
      ].map(([t, w]) => (
        <div key={t} className="rounded-xl bg-[var(--card)] p-3.5">
          <p className="text-sm font-semibold">{t}</p>
          <Bar w={w} c="#e0e7ff" />
        </div>
      ))}
    </div>
  );
}

function AutoVisual() {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-[var(--card)] p-4 text-sm">
      {[
        ['WHEN', 'card moved to Done', '#6366f1'],
        ['IF', 'label is “release”', '#f59e0b'],
        ['THEN', 'notify watchers + close sprint', '#22c55e'],
      ].map(([k, v, c]) => (
        <div key={k as string} className="flex items-center gap-3">
          <span
            className="w-12 shrink-0 rounded-md px-2 py-1 text-center text-xs font-bold text-white"
            style={{ background: c as string }}
          >
            {k}
          </span>
          <span className="font-mono text-xs sm:text-sm">{v}</span>
        </div>
      ))}
    </div>
  );
}

function ReportVisual() {
  return (
    <div
      className="flex h-40 items-end gap-2 rounded-xl bg-[var(--card)] p-4"
      role="img"
      aria-label="Cumulative flow stacked bars growing"
    >
      {[35, 50, 45, 65, 60, 80, 95].map((h, i) => (
        <div
          key={i}
          className="flex flex-1 flex-col justify-end gap-0.5"
          style={{ height: `${h}%` }}
        >
          <div className="rounded-sm bg-[#22c55e]" style={{ height: '38%' }} />
          <div className="rounded-sm bg-[#6366f1]" style={{ height: '42%' }} />
          <div className="flex-1 rounded-sm bg-[#e0e7ff]" />
        </div>
      ))}
    </div>
  );
}
