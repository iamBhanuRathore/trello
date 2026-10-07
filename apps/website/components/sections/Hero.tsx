import { ArrowRight, Layers, ShieldCheck, Zap } from 'lucide-react';
import Reveal from '@/components/layout/Reveal';
import { APP_LINKS } from '@/lib/site';

const MINI_COLS = [
  { name: 'To Do', cards: ['Website brief BCW-12', 'Invite marketing'] },
  { name: 'In Progress', cards: ['Sprint board + burndown'] },
  { name: 'Done', cards: ['SSO via WorkOS'] },
];

export default function Hero() {
  return (
    <section id="top" className="overflow-hidden border-b border-[var(--border)]">
      <div className="container-site grid gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:py-20">
        <Reveal>
          <p className="inline-flex flex-wrap items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--muted)] px-3 py-1 text-xs font-medium">
            <span className="rounded-full bg-[#6366f1] px-2 py-0.5 text-white">
              Multi-tenant SaaS
            </span>
            Trello × Jira × Asana — one platform, many companies
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Every company&apos;s work, from backlog to launch, in one place.
          </h1>
          <p className="mt-4 max-w-xl text-base text-[var(--muted-fg)] sm:text-lg">
            Boardly nests <strong>Organization → Workspace → Project → Board → List → Card</strong>.
            A project holds many boards; a card carries List, Stage, Sprint and Phase at once —
            filterable everywhere.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="#pricing"
              className="inline-flex items-center gap-2 rounded-lg bg-[#6366f1] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4f46e5]"
            >
              Start free <ArrowRight size={16} aria-hidden />
            </a>
            <a
              href={APP_LINKS.dashboard}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-5 py-3 text-sm font-semibold transition-colors hover:bg-[var(--muted)]"
            >
              Open live dashboard
            </a>
          </div>
          <dl className="mt-8 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { icon: Layers, k: '4 dimensions', v: 'List · Stage · Sprint · Phase per card' },
              { icon: Zap, k: 'Realtime', v: 'Bun WS + Redis fan-out, gap-fill' },
              { icon: ShieldCheck, k: 'Enterprise', v: 'SSO, audit, ~98 permissions' },
            ].map((s) => (
              <div key={s.k} className="rounded-xl border border-[var(--border)] p-3">
                <s.icon size={18} className="text-[#6366f1]" aria-hidden />
                <dt className="mt-2 text-sm font-semibold">{s.k}</dt>
                <dd className="text-xs text-[var(--muted-fg)]">{s.v}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
        <Reveal aria-label="Board preview">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {['Board', 'Table', 'Calendar', 'Timeline', 'Sprint'].map((v, i) => (
                <span
                  key={v}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    i === 0
                      ? 'bg-[#6366f1] text-white'
                      : 'border border-[var(--border)] bg-[var(--card)]'
                  }`}
                >
                  {v}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {MINI_COLS.map((col) => (
                <div key={col.name} className="rounded-xl bg-[var(--card)] p-2.5">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
                    {col.name}
                  </p>
                  <div className="mt-2 space-y-2">
                    {col.cards.map((c) => (
                      <div
                        key={c}
                        className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5 text-xs font-medium shadow-sm"
                      >
                        {c}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 px-1 text-xs text-[var(--muted-fg)]">
              Static preview — drag-drop, OCC moves and live cursors run in the dashboard at :5173.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
