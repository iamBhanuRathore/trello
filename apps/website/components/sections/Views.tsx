import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { VIEWS } from '@/lib/product';

export default function Views() {
  return (
    <section id="views" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Eight ways to see the same work"
            title="Board, Table, Calendar, Timeline, Sprint, Portfolio, My Tasks, Cmd+K"
            desc="Plus team chat, triage inbox, docs/wiki with bidirectional card↔doc linking, and presence halos on every live surface."
          />
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {VIEWS.map((v) => (
            <Reveal key={v.name}>
              <article className="h-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <h3 className="font-bold">{v.name}</h3>
                <p className="mt-1.5 text-sm text-[var(--muted-fg)]">{v.desc}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
