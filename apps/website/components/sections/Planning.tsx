import { Check } from 'lucide-react';
import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { PLANNING, CARD_DIMENSIONS } from '@/lib/product';

export default function Planning() {
  return (
    <section id="planning" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Subtasks · Sprints · Phases"
            title="Three independent dimensions — one card knows all three"
            desc="List (workflow state), Sprint (time-box) and Phase (lifecycle step) are tracked independently and filterable in every view."
          />
        </Reveal>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {PLANNING.map((p) => (
            <Reveal key={p.name}>
              <article className="h-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
                <h3 className="text-lg font-bold">{p.name}</h3>
                <ul className="mt-3 space-y-2.5">
                  {p.rows.map((r) => (
                    <li key={r} className="flex gap-2 text-sm text-[var(--muted-fg)]">
                      <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CARD_DIMENSIONS.map((d) => (
            <Reveal key={d.name}>
              <div className="rounded-xl border border-[var(--border)] p-4">
                <p className="text-sm font-bold">{d.name}</p>
                <p className="mt-1 text-sm text-[var(--muted-fg)]">{d.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
