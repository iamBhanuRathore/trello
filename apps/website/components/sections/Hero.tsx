'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, Layers, ShieldCheck, Zap } from 'lucide-react';
import Reveal from '@/components/layout/Reveal';
import { APP_LINKS } from '@/lib/site';

const MINI_COLS = [
  { name: 'Backlog', cards: ['Website brief BCW-12', 'Invite marketing'] },
  { name: 'In Progress', cards: ['Sprint board + burndown', 'SSO via WorkOS'] },
  { name: 'Done', cards: ['Realtime gap-fill'] },
];

function EmailCapture() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError('Enter a valid work email to continue.');
      return;
    }
    setError('');
    setDone(true);
  };

  if (done) {
    return (
      <p
        role="status"
        className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
      >
        <CheckCircle2 size={18} aria-hidden /> You&apos;re in! Check {email.trim()} for your invite.
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-md">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="hero-email" className="sr-only">
          Work email
        </label>
        <input
          id="hero-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-invalid={error !== ''}
          aria-describedby={error ? 'hero-email-error' : undefined}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[#6366f1]"
        />
        <button
          type="submit"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#6366f1] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4f46e5]"
        >
          Get started <ArrowRight size={16} aria-hidden />
        </button>
      </div>
      {error ? (
        <p id="hero-email-error" role="alert" className="mt-2 text-sm text-red-500">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-[var(--muted-fg)]">
          Free for up to 10 seats · No credit card required
        </p>
      )}
    </form>
  );
}

export default function Hero() {
  return (
    <section id="top" className="overflow-hidden border-b border-[var(--border)]">
      <div className="container-site grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:py-20">
        <Reveal>
          <p className="inline-flex flex-wrap items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--muted)] px-3 py-1 text-xs font-medium">
            <span className="rounded-full bg-[#6366f1] px-2 py-0.5 text-white">New</span>
            Sprints, docs &amp; automations now in one place
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Turn ideas into forward motion
          </h1>
          <p className="mt-4 max-w-xl text-base text-[var(--muted-fg)] sm:text-lg">
            Boardly gives every team — marketing, engineering, design, ops — one shared place to
            plan work, track progress and ship faster. Boards, sprints, docs and reports that speak
            your workflow&apos;s language.
          </p>
          <div className="mt-6">
            <EmailCapture />
          </div>
          <div className="mt-4">
            <a href="#demo" className="text-sm font-semibold text-[#4f46e5] hover:underline">
              Or try the live demo below — no signup →
            </a>
          </div>
          <dl className="mt-8 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { icon: Layers, k: '8 views', v: 'Board · Table · Calendar · Timeline' },
              { icon: Zap, k: 'Realtime', v: 'Live cursors, typing, gap-fill sync' },
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
        <Reveal aria-label="Boardly board preview">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-3 shadow-sm sm:p-4">
            <div className="mb-1 flex items-center justify-between px-1 pb-2">
              <p className="text-sm font-bold">Website Redesign Q3</p>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                68% complete
              </span>
            </div>
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
            <a
              href={APP_LINKS.dashboard}
              className="mt-3 block px-1 text-xs font-semibold text-[#4f46e5] hover:underline"
            >
              Open the real dashboard at :5173 →
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
