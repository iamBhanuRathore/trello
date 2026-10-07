'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { INTEGRATIONS } from '@/lib/conversion';

export default function Integrations() {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const list = query
    ? INTEGRATIONS.filter((i) => `${i.name} ${i.cat} ${i.desc}`.toLowerCase().includes(query))
    : [...INTEGRATIONS];

  return (
    <section id="integrations" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Integrations"
            title="Works where you already work"
            desc="Chat, code, files, calendar and billing — plus a one-click importer from Jira and Trello. Search the directory:"
          />
        </Reveal>
        <Reveal>
          <div className="relative mt-6 max-w-md">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-fg)]"
              aria-hidden
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search integrations…"
              aria-label="Search integrations"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#6366f1]"
            />
          </div>
        </Reveal>
        <div
          className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          role="status"
          aria-live="polite"
        >
          {list.map((i) => (
            <div
              key={i.name}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">{i.name}</p>
                <span className="rounded-full bg-[#eef2ff] px-2 py-0.5 text-[11px] font-semibold text-[#4338ca]">
                  {i.cat}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-[var(--muted-fg)]">{i.desc}</p>
            </div>
          ))}
          {list.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-fg)]">
              No integration matches “{q}” — try “chat”, “dev” or “migrate”.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
