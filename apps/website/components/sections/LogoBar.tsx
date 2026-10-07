import Reveal from '@/components/layout/Reveal';
import { LOGOS } from '@/lib/conversion';

export default function LogoBar() {
  return (
    <section aria-label="Trusted by" className="border-b border-[var(--border)]">
      <div className="container-site py-8 sm:py-10">
        <Reveal>
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-[var(--muted-fg)]">
            Powering planning at 2,400+ companies
          </p>
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {LOGOS.map((l) => (
              <li
                key={l}
                className="text-base font-bold tracking-tight text-[var(--muted-fg)] sm:text-lg"
              >
                {l}
              </li>
            ))}
          </ul>
          <div className="mx-auto mt-6 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ['99.99%', 'uptime SLA on Business+'],
              ['4 dimensions', 'List · Stage · Sprint · Phase per card'],
              ['10 min', 'median Trello/Jira import time'],
            ].map(([big, small]) => (
              <div
                key={small}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-center"
              >
                <p className="text-2xl font-bold text-[#4f46e5]">{big}</p>
                <p className="mt-1 text-xs text-[var(--muted-fg)]">{small}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
