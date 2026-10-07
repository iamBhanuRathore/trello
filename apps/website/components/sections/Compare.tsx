'use client';

import { useState } from 'react';
import { Check, Minus, X } from 'lucide-react';
import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { COMPARE_ROWS } from '@/lib/conversion';

function Cell({ v, hot }: { v: string; hot?: boolean }) {
  const yes = v === 'Yes';
  const no = v === 'No';
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm ${hot ? 'font-bold' : 'text-[var(--muted-fg)]'}`}
    >
      {yes ? (
        <Check size={15} className="shrink-0 text-emerald-500" aria-label="Yes" />
      ) : no ? (
        <X size={15} className="shrink-0 text-[var(--border)]" aria-label="No" />
      ) : (
        <Minus size={15} className="shrink-0" aria-hidden />
      )}
      {v}
    </span>
  );
}

export default function Compare() {
  const [diffOnly, setDiffOnly] = useState(false);
  const rows = diffOnly
    ? COMPARE_ROWS.filter((r) => new Set([r.boardly, r.jira, r.asana, r.trello]).size > 1)
    : COMPARE_ROWS;

  return (
    <section id="compare" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              eyebrow="Compare"
              title="Boardly vs the tools you're leaving"
              desc="Honest caps: Jira wins on marketplace depth, Asana on goals UI. Boardly wins on having sprints, docs, chat and time in one seat."
            />
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={diffOnly}
                onChange={(e) => setDiffOnly(e.target.checked)}
                className="size-4 accent-[#6366f1]"
              />
              Differences only
            </label>
          </div>
        </Reveal>
        <Reveal>
          <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--border)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left">
                <thead>
                  <tr className="bg-[var(--muted)] text-sm">
                    <th className="px-4 py-3 font-semibold">Capability</th>
                    <th className="bg-[#eef2ff] px-4 py-3 font-bold text-[#4338ca]">Boardly</th>
                    <th className="px-4 py-3 font-semibold text-[var(--muted-fg)]">Jira</th>
                    <th className="px-4 py-3 font-semibold text-[var(--muted-fg)]">Asana</th>
                    <th className="px-4 py-3 font-semibold text-[var(--muted-fg)]">Trello</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.feature} className="border-t border-[var(--border)]">
                      <td className="px-4 py-3 text-sm font-medium">{r.feature}</td>
                      <td className="bg-[#eef2ff]/50 px-4 py-3">
                        <Cell v={r.boardly} hot />
                      </td>
                      <td className="px-4 py-3">
                        <Cell v={r.jira} />
                      </td>
                      <td className="px-4 py-3">
                        <Cell v={r.asana} />
                      </td>
                      <td className="px-4 py-3">
                        <Cell v={r.trello} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
