import { ArrowRight, Check } from 'lucide-react';
import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { PLANS, FAQS } from '@/lib/enterprise';
import { APP_LINKS } from '@/lib/site';

export default function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-24">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Pricing"
            title="Per-seat plans that scale with governance needs"
            desc="Stripe Billing with metered seats, guest overage items and idempotent webhooks. Caps on seats, workspaces, boards and storage grow per tier."
          />
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => (
            <Reveal key={p.name}>
              <article className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
                <h3 className="font-bold">{p.name}</h3>
                <p className="mt-1 text-2xl font-bold">{p.price}</p>
                <p className="mt-2 flex-1 text-sm text-[var(--muted-fg)]">{p.desc}</p>
                <a
                  href={APP_LINKS.dashboard}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-[#6366f1] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4f46e5]"
                >
                  {p.cta} <ArrowRight size={15} aria-hidden />
                </a>
              </article>
            </Reveal>
          ))}
        </div>
        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          {FAQS.map((f) => (
            <Reveal key={f.q}>
              <details className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">
                  {f.q}
                </summary>
                <p className="mt-2 text-sm text-[var(--muted-fg)]">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div className="mt-12 flex flex-col items-start justify-between gap-4 rounded-2xl bg-[#6366f1] p-6 text-white sm:p-8 lg:flex-row lg:items-center">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
                <Check size={22} aria-hidden /> Bring your boards. Keep your workflow words.
              </h2>
              <p className="mt-1.5 text-sm text-indigo-100">
                Trello JSON migration, stage templates, custom roles and white-label theming — no
                code changes per client.
              </p>
            </div>
            <a
              href={APP_LINKS.dashboard}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-bold text-[#4338ca] transition-colors hover:bg-indigo-50"
            >
              Open Boardly <ArrowRight size={16} aria-hidden />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
