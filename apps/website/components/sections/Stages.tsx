import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { STAGE_CATEGORIES } from '@/lib/product';

export default function Stages() {
  return (
    <section id="stages" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Custom stage templates (Bitrix24-style)"
            title="Company-defined status vocabulary — not hardcoded labels"
            desc="Admins build templates (name + color + order + category) once; projects inherit the org default or clone their own. Changing a stage fires card.stage_changed → feed, notifications and automations."
          />
        </Reveal>
        <Reveal>
          <div className="mt-8 flex flex-wrap gap-2">
            {[
              'Assigned to Dev',
              'Under Testing',
              'Discussion Required',
              'On Hold',
              'Pending Confirmation',
              'Not Feasible',
              'Ready to Release',
              'Finished',
            ].map((s, i) => (
              <span
                key={s}
                className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-1.5 text-sm font-medium"
                style={{
                  borderLeftWidth: 4,
                  borderLeftColor: ['#94a3b8', '#6366f1', '#f59e0b', '#22c55e'][i % 4],
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </Reveal>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {STAGE_CATEGORIES.map((c) => (
            <Reveal key={c.name}>
              <div className="rounded-xl border border-[var(--border)] p-4">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <span
                    className="size-3 rounded-full"
                    style={{ background: c.color }}
                    aria-hidden
                  />
                  <code className="font-mono">{c.name}</code>
                </p>
                <p className="mt-1.5 text-sm text-[var(--muted-fg)]">{c.examples}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="mt-6 text-sm text-[var(--muted-fg)]">
            Categories keep dashboards meaningful even when labels are arbitrary. Scrum extras are
            aspirational-only: Epics and Scrum-team groupings have no tables yet; Story Points is
            just cards.story_points for velocity.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
