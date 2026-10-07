'use client';

import { ArrowRight } from 'lucide-react';
import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { TEMPLATES } from '@/lib/demo';

export default function Templates() {
  const load = (id: string) => {
    window.dispatchEvent(new CustomEvent('boardly:load-template', { detail: id }));
  };

  return (
    <section id="templates" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Templates"
            title="Start from a board that already works"
            desc="Battle-tested setups for sprints, bugs, content and onboarding. One click loads a template straight into the live demo above."
          />
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {TEMPLATES.map((t) => (
            <Reveal key={t.id}>
              <article className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <div className="flex gap-1" aria-hidden>
                  {t.columns.slice(0, 4).map((c, i) => (
                    <span
                      key={c}
                      className="h-10 flex-1 rounded-md border border-[var(--border)] bg-[var(--muted)]"
                      style={{ opacity: 1 - i * 0.18 }}
                    />
                  ))}
                </div>
                <h3 className="mt-3 font-bold">{t.name}</h3>
                <p className="mt-1 flex-1 text-sm text-[var(--muted-fg)]">{t.desc}</p>
                <button
                  type="button"
                  onClick={() => load(t.id)}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-semibold transition-colors hover:border-[#6366f1] hover:text-[#4f46e5]"
                >
                  Use in live demo <ArrowRight size={15} aria-hidden />
                </button>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
