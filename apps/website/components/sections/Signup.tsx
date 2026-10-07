'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import Reveal from '@/components/layout/Reveal';

const SIZES = ['1–10', '11–50', '51–200', '201–1,000', '1,000+'] as const;

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [size, setSize] = useState<(typeof SIZES)[number]>('11–50');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()))
      next.email = 'Enter a valid work email.';
    if (company.trim().length < 2) next.company = 'Please enter your company.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setState('sending');
    setTimeout(() => setState('done'), 900);
  };

  return (
    <section id="signup" className="scroll-mt-24">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <div className="grid gap-8 overflow-hidden rounded-2xl bg-[#6366f1] p-6 text-white sm:p-10 lg:grid-cols-2">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold sm:text-3xl">
                Bring your boards. Keep your workflow words.
              </h2>
              <p className="mt-2 text-sm text-indigo-100 sm:text-base">
                Trello JSON migration in minutes, stage templates in an afternoon, SSO before
                procurement asks. Tell us where to send your workspace:
              </p>
              <ul className="mt-5 space-y-2 text-sm">
                {[
                  'Free for up to 10 seats — no credit card',
                  'Import from Trello, Jira or Asana',
                  'Cancel anytime, export everything',
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-white p-5 text-slate-900 sm:p-6">
              {state === 'done' ? (
                <div
                  role="status"
                  className="flex h-full min-h-64 flex-col items-center justify-center text-center"
                >
                  <CheckCircle2 size={44} className="text-emerald-500" aria-hidden />
                  <p className="mt-3 text-lg font-bold">Workspace reserved!</p>
                  <p className="mt-1 max-w-xs text-sm text-slate-500">
                    We sent setup instructions to {email.trim()}. See you in {company.trim()}&apos;s
                    new home.
                  </p>
                </div>
              ) : (
                <form onSubmit={submit} noValidate className="space-y-3.5">
                  <div>
                    <label htmlFor="su-name" className="text-sm font-semibold">
                      Full name
                    </label>
                    <input
                      id="su-name"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ada Lovelace"
                      aria-invalid={!!errors.name}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#6366f1]"
                    />
                    {errors.name && (
                      <p role="alert" className="mt-1 text-xs text-red-600">
                        {errors.name}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="su-email" className="text-sm font-semibold">
                      Work email
                    </label>
                    <input
                      id="su-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ada@company.com"
                      aria-invalid={!!errors.email}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#6366f1]"
                    />
                    {errors.email && (
                      <p role="alert" className="mt-1 text-xs text-red-600">
                        {errors.email}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="su-company" className="text-sm font-semibold">
                      Company
                    </label>
                    <input
                      id="su-company"
                      autoComplete="organization"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Analytical Engines Inc."
                      aria-invalid={!!errors.company}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#6366f1]"
                    />
                    {errors.company && (
                      <p role="alert" className="mt-1 text-xs text-red-600">
                        {errors.company}
                      </p>
                    )}
                  </div>
                  <fieldset>
                    <legend className="text-sm font-semibold">Team size</legend>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {SIZES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSize(s)}
                          aria-pressed={size === s}
                          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                            size === s
                              ? 'bg-[#6366f1] text-white'
                              : 'border border-slate-200 text-slate-500 hover:border-[#6366f1]'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <button
                    type="submit"
                    disabled={state === 'sending'}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#6366f1] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#4f46e5] disabled:opacity-70"
                  >
                    {state === 'sending' ? (
                      <>
                        <Loader2 size={16} className="animate-spin" aria-hidden /> Reserving…
                      </>
                    ) : (
                      <>
                        Create my workspace <ArrowRight size={16} aria-hidden />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
