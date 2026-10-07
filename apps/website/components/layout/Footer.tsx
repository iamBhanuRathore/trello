import { KanbanSquare } from 'lucide-react';
import { APP_LINKS, FOOTER_COLS } from '@/lib/site';

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border)] py-10">
      <div className="container-site grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-2">
          <p className="flex items-center gap-2 text-base font-bold">
            <span className="grid size-8 place-items-center rounded-lg bg-[#6366f1] text-white">
              <KanbanSquare size={17} aria-hidden />
            </span>
            Boardly
          </p>
          <p className="mt-2 max-w-sm text-sm text-[var(--muted-fg)]">
            Enterprise multi-tenant Kanban &amp; project management. Boards, sprints, docs,
            automations and reports — with the governance procurement actually asks for.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="#signup"
              className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4f46e5]"
            >
              Start free
            </a>
            <a
              href={APP_LINKS.dashboard}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)]"
            >
              Open app
            </a>
          </div>
        </div>
        {FOOTER_COLS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-sm font-semibold">{col.title}</p>
            <ul className="mt-2 space-y-1.5 text-sm text-[var(--muted-fg)]">
              {col.links.map((l) => (
                <li key={l.label}>
                  <a className="hover:underline" href={l.href}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="container-site mt-8 flex flex-col gap-2 border-t border-[var(--border)] pt-6 text-xs text-[var(--muted-fg)] sm:flex-row sm:justify-between">
        <span>
          © 2026 Boardly. Design-era snapshot partially superseded — tree + docs win on conflicts.
        </span>
        <span>Free up to 10 seats · SSO on Business+ · SLA on Enterprise</span>
      </div>
    </footer>
  );
}
