import { Check } from 'lucide-react';
import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { PANELS } from '@/lib/product';

export default function Panels() {
  return (
    <section id="panels" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Three tiers of control"
            title="Super Admin · Company Admin · User — one codebase"
            desc="Platform → Organization → Workspace → Board → Card. Roles inherit downward unless overridden at a lower level."
          />
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PANELS.map((p) => (
            <Reveal key={p.id}>
              <article className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#6366f1]">
                  {p.audience}
                </p>
                <h3 className="mt-1 text-lg font-bold">{p.name}</h3>
                <ul className="mt-4 flex-1 space-y-2.5">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex gap-2 text-sm text-[var(--muted-fg)]">
                      <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
