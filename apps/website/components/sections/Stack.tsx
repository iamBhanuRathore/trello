import { TriangleAlert } from 'lucide-react';
import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { ACTUAL_STACK, STALE_NOTES } from '@/lib/enterprise';

export default function Stack() {
  return (
    <section id="stack" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Actual stack (not the first draft)"
            title="Bun + Elysia · Postgres FTS · Redis inline dispatch"
            desc="One language (TypeScript) across dashboard, mobile, super-admin and backend. Shared Zod schemas, Turborepo monorepo, /v1/ API versioning."
          />
        </Reveal>
        <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--border)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="bg-[var(--muted)] text-xs uppercase tracking-wide text-[var(--muted-fg)]">
                  <th className="px-4 py-2.5 font-medium">Layer</th>
                  <th className="px-4 py-2.5 font-medium">Technology</th>
                </tr>
              </thead>
              <tbody>
                {ACTUAL_STACK.map((s) => (
                  <tr key={s.layer} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3 font-semibold">{s.layer}</td>
                    <td className="px-4 py-3 text-[var(--muted-fg)]">{s.tech}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <Reveal>
          <div className="mt-6 rounded-2xl border border-amber-300/60 bg-amber-50 p-5 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="flex items-center gap-2 font-bold">
              <TriangleAlert size={16} aria-hidden /> Where this page corrects the early blueprint
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {STALE_NOTES.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
