import { Check } from 'lucide-react';
import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { POWER, NOTIFICATIONS } from '@/lib/power';

export default function PowerFeatures() {
  return (
    <section id="power" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Competitive modules"
            title="Search, reports, time, intake, automations — the Jira gap-closers"
            desc="One event bus (card.created, card.moved, stage.changed …) feeds automations, webhooks, notifications and analytics. New integrations never touch core logic."
          />
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {POWER.map((p) => (
            <Reveal key={p.name}>
              <article className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
                <span className="w-fit rounded-full bg-[#eef2ff] px-2.5 py-1 text-xs font-semibold text-[#4338ca]">
                  {p.tag}
                </span>
                <h3 className="mt-2 text-lg font-bold">{p.name}</h3>
                <p className="mt-1.5 flex-1 text-sm text-[var(--muted-fg)]">{p.desc}</p>
              </article>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div className="mt-6 rounded-2xl border border-[var(--border)] p-5 sm:p-6">
            <h3 className="font-bold">Notifications engine (mature, not a toggle)</h3>
            <ul className="mt-3 space-y-2">
              {NOTIFICATIONS.map((n) => (
                <li key={n} className="flex gap-2 text-sm text-[var(--muted-fg)]">
                  <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
