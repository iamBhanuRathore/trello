import { UserCheck, Users, Eye } from 'lucide-react';
import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { CARD_PEOPLE } from '@/lib/product';

const ICONS = [UserCheck, Users, Eye];

export default function CardPeople() {
  return (
    <section id="people" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Task people model"
            title="Assignees do it · Participants shape it · Watchers follow it"
            desc="Three overlapping relationships per card, each with its own avatar group and notification rules. One user can hold several at once — an Assignee is automatically a Participant."
          />
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {CARD_PEOPLE.map((p, i) => {
            const Icon = ICONS[i % ICONS.length]!;
            return (
              <Reveal key={p.name}>
                <article className="h-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#eef2ff] text-[#4f46e5]">
                    <Icon size={20} aria-hidden />
                  </span>
                  <h3 className="mt-3 text-lg font-bold">{p.name}</h3>
                  <p className="mt-1.5 text-sm text-[var(--muted-fg)]">{p.who}</p>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
                        Added
                      </dt>
                      <dd className="mt-0.5">{p.added}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
                        Notified
                      </dt>
                      <dd className="mt-0.5 text-[var(--muted-fg)]">{p.notified}</dd>
                    </div>
                  </dl>
                </article>
              </Reveal>
            );
          })}
        </div>
        <Reveal>
          <p className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4 text-sm text-[var(--muted-fg)]">
            Watchers default to read + comment only (enforced in RBAC, not just UI). Notification
            frequency is per-user, per-role-type: instant / daily digest / off.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
