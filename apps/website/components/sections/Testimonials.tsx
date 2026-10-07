'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { TESTIMONIALS } from '@/lib/conversion';

export default function Testimonials() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = TESTIMONIALS.length;

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % n), 6000);
    return () => clearInterval(t);
  }, [paused, n]);

  const go = (d: number) => setIdx((i) => (i + d + n) % n);
  const cur = TESTIMONIALS[idx]!;

  return (
    <section
      id="customers"
      aria-label="Customer stories"
      className="scroll-mt-24 border-b border-[var(--border)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading eyebrow="Customers" title="Loved by teams big and small" />
        </Reveal>
        <Reveal>
          <div
            className="mx-auto mt-8 max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 sm:p-8"
            aria-live="polite"
          >
            <div className="flex gap-1 text-amber-400" aria-label="5 out of 5 stars">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={16} fill="currentColor" aria-hidden />
              ))}
            </div>
            <blockquote key={idx} className="mt-4 text-lg font-medium leading-relaxed sm:text-xl">
              “{cur.quote}”
            </blockquote>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">{cur.name}</p>
                <p className="text-sm text-[var(--muted-fg)]">{cur.role}</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                {cur.metric}
              </span>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <div className="flex gap-2" role="tablist" aria-label="Choose story">
                {TESTIMONIALS.map((t, i) => (
                  <button
                    key={t.name}
                    role="tab"
                    aria-selected={i === idx}
                    aria-label={`Story from ${t.name}`}
                    onClick={() => setIdx(i)}
                    className={`h-2 rounded-full transition-all ${i === idx ? 'w-8 bg-[#6366f1]' : 'w-2 bg-[var(--border)] hover:bg-[var(--muted-fg)]'}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Previous story"
                  className="grid size-10 place-items-center rounded-full border border-[var(--border)] transition-colors hover:bg-[var(--muted)]"
                >
                  <ChevronLeft size={18} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Next story"
                  className="grid size-10 place-items-center rounded-full border border-[var(--border)] transition-colors hover:bg-[var(--muted)]"
                >
                  <ChevronRight size={18} aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
