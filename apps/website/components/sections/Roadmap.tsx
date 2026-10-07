import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { ROADMAP_PHASES } from '@/lib/enterprise';

export default function Roadmap() {
  return (
    <section id="roadmap" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Build order"
            title="MVP proved it · Growth kept it · Enterprise sells it"
            desc="Phase 1 gets a usable product. Phase 2 gets retention. Phase 3 unlocks enterprise contracts. Phase 3 features were never front-loaded."
          />
        </Reveal>
        <ol className="mt-8 grid gap-4 md:grid-cols-2">
          {ROADMAP_PHASES.map((p, i) => (
            <Reveal key={p.name}>
              <li className="h-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#6366f1]">
                  Step {i + 1}
                </p>
                <h3 className="mt-1 font-bold">{p.name}</h3>
                <p className="mt-2 text-sm text-[var(--muted-fg)]">{p.items}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
