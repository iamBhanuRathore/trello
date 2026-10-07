'use client';

import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { PLANS } from '@/lib/enterprise';
import { formatCost, savingsVsMonthly, type PlanId } from '@/lib/pricing-calc';
import { APP_LINKS } from '@/lib/site';

const FEATURES: Record<string, string[]> = {
  Free: [
    'Up to 10 seats',
    'Unlimited boards & cards',
    'Table + Calendar views',
    'Community support',
  ],
  Pro: [
    'Everything in Free',
    'Sprints + burndown',
    'Stage templates',
    'Automations + webhooks',
    'Saved searches',
  ],
  Business: [
    'Everything in Pro',
    'SSO / SAML + SCIM',
    'Custom roles + audit export',
    'Forms + SLA policies',
    'Portfolio dashboards',
  ],
  Enterprise: [
    'Everything in Business',
    'Dedicated-instance tier',
    'Data residency (EU/US)',
    'White-label domain',
    'Uptime SLA + success manager',
  ],
};

export default function Pricing() {
  const [annual, setAnnual] = useState(true);
  const [seats, setSeats] = useState(25);

  return (
    <section id="pricing" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Pricing"
            title="Per-seat plans that scale with governance needs"
            desc="Stripe Billing with metered seats and guest overages. Annual billing saves 20% — move the sliders and see."
          />
        </Reveal>
        <Reveal>
          <div className="mx-auto mt-8 flex max-w-2xl flex-col items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:flex-row sm:gap-8 sm:p-6">
            <div className="w-full flex-1">
              <label htmlFor="seat-range" className="flex justify-between text-sm font-semibold">
                Team size <span className="font-mono text-[#4f46e5]">{seats} seats</span>
              </label>
              <input
                id="seat-range"
                type="range"
                min={1}
                max={200}
                value={seats}
                onChange={(e) => setSeats(Number(e.target.value))}
                className="mt-2 w-full accent-[#6366f1]"
              />
              <div className="flex justify-between text-xs text-[var(--muted-fg)]">
                <span>1</span>
                <span>200+</span>
              </div>
            </div>
            <div className="flex items-center gap-3" role="group" aria-label="Billing period">
              <span className={`text-sm font-medium ${!annual ? '' : 'text-[var(--muted-fg)]'}`}>
                Monthly
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={annual}
                aria-label="Annual billing (save 20%)"
                onClick={() => setAnnual((v) => !v)}
                className={`relative h-7 w-12 rounded-full transition-colors ${annual ? 'bg-[#6366f1]' : 'bg-[var(--border)]'}`}
              >
                <span
                  className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${annual ? 'left-6' : 'left-1'}`}
                />
              </button>
              <span className={`text-sm font-medium ${annual ? '' : 'text-[var(--muted-fg)]'}`}>
                Annual{' '}
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  −20%
                </span>
              </span>
            </div>
          </div>
        </Reveal>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => {
            const id = p.name.toLowerCase() as PlanId;
            const cost = formatCost(id, seats, annual);
            const saved = annual ? savingsVsMonthly(id, seats) : 0;
            const hot = p.name === 'Business';
            return (
              <Reveal key={p.name}>
                <article
                  className={`relative flex h-full flex-col rounded-2xl border bg-[var(--card)] p-5 sm:p-6 ${
                    hot ? 'border-[#6366f1] shadow-lg' : 'border-[var(--border)]'
                  }`}
                >
                  {hot && (
                    <span className="absolute -top-3 left-5 rounded-full bg-[#6366f1] px-3 py-0.5 text-xs font-bold text-white">
                      Most popular
                    </span>
                  )}
                  <h3 className="font-bold">{p.name}</h3>
                  <p className="mt-1 text-2xl font-bold" aria-live="polite">
                    {cost}
                    {id !== 'free' && id !== 'enterprise' && (
                      <span className="text-sm font-normal text-[var(--muted-fg)]">
                        {' '}
                        {annual ? 'per year' : 'per month'}
                      </span>
                    )}
                  </p>
                  {saved > 0 && (
                    <p className="mt-0.5 text-xs font-semibold text-emerald-600">
                      Save ${saved.toLocaleString()} vs monthly
                    </p>
                  )}
                  <p className="mt-2 text-sm text-[var(--muted-fg)]">{p.desc}</p>
                  <ul className="mt-3 flex-1 space-y-1.5">
                    {(FEATURES[p.name] ?? []).map((f) => (
                      <li key={f} className="flex gap-2 text-[13px] text-[var(--muted-fg)]">
                        <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={id === 'enterprise' ? '#signup' : APP_LINKS.dashboard}
                    className={`mt-4 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                      hot
                        ? 'bg-[#6366f1] text-white hover:bg-[#4f46e5]'
                        : 'border border-[var(--border)] hover:border-[#6366f1] hover:text-[#4f46e5]'
                    }`}
                  >
                    {p.cta} <ArrowRight size={15} aria-hidden />
                  </a>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
