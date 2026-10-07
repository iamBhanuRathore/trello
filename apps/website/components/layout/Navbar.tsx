'use client';

import { useEffect, useState } from 'react';
import { KanbanSquare, Menu, X } from 'lucide-react';
import { NAV_LINKS, APP_LINKS } from '@/lib/site';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-sticky border-b backdrop-blur ${
        scrolled ? 'border-[var(--border)] bg-[var(--background)]/90' : 'border-transparent'
      }`}
    >
      <div className="container-site flex h-16 items-center justify-between gap-4">
        <a href="#top" className="flex min-w-0 items-center gap-2" aria-label="Boardly home">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#6366f1] text-white">
            <KanbanSquare size={20} aria-hidden />
          </span>
          <span className="truncate text-lg font-bold">Boardly</span>
        </a>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Sections">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md px-2.5 py-2 text-sm text-[var(--muted-fg)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <a
            href={APP_LINKS.dashboard}
            className="rounded-md border border-[var(--border)] px-3.5 py-2 text-sm font-medium transition-colors hover:bg-[var(--muted)]"
          >
            Open app
          </a>
          <a
            href="#pricing"
            className="rounded-md bg-[#6366f1] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4f46e5]"
          >
            Start free
          </a>
        </div>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-md border border-[var(--border)] lg:hidden"
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <nav className="border-t border-[var(--border)] lg:hidden" aria-label="Mobile sections">
          <div className="container-site flex flex-wrap gap-1 py-3">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-[var(--muted-fg)] hover:bg-[var(--muted)]"
              >
                {l.label}
              </a>
            ))}
            <a
              href={APP_LINKS.dashboard}
              className="mt-1 w-full rounded-md bg-[#6366f1] px-3 py-2.5 text-center text-sm font-semibold text-white"
            >
              Open app
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
