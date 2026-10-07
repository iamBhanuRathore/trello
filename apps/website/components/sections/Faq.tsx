'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { FAQS } from '@/lib/enterprise';

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        </Reveal>
        <div className="mx-auto mt-8 max-w-3xl space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={f.q}>
                <div
                  className={`rounded-2xl border bg-[var(--card)] transition-colors ${isOpen ? 'border-[#6366f1]' : 'border-[var(--border)]'}`}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${i}`}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left font-semibold"
                  >
                    {f.q}
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-full transition-transform ${isOpen ? 'rotate-45 bg-[#6366f1] text-white' : 'bg-[var(--muted)]'}`}
                    >
                      <Plus size={16} aria-hidden />
                    </span>
                  </button>
                  {isOpen && (
                    <p
                      id={`faq-panel-${i}`}
                      className="px-5 pb-5 text-sm leading-relaxed text-[var(--muted-fg)]"
                    >
                      {f.a}
                    </p>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
