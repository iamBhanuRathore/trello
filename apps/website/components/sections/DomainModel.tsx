import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { PLATFORM_ROLES, ORG_ROLES, BOARD_ROLES, TENANCY } from '@/lib/product';

function RoleTable({
  title,
  rows,
}: {
  title: string;
  rows: readonly { role: string; scope: string; access: string }[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
      <p className="border-b border-[var(--border)] bg-[var(--muted)] px-4 py-2.5 text-sm font-semibold">
        {title}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-[var(--muted-fg)]">
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Scope</th>
              <th className="px-4 py-2 font-medium">Access</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.role} className="border-t border-[var(--border)]">
                <td className="px-4 py-2.5 font-semibold">{r.role}</td>
                <td className="px-4 py-2.5 text-[var(--muted-fg)]">{r.scope}</td>
                <td className="px-4 py-2.5 text-[var(--muted-fg)]">{r.access}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DomainModel() {
  return (
    <section id="model" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Domain & tenancy"
            title="Organization → Workspace → Project → Board → List → Card"
            desc="A project can hold many boards (Planning, Bugs, Content). UUID keys everywhere, soft-deletes for recovery, organization_id on every row so a bug can never leak across tenants."
          />
        </Reveal>
        <Reveal>
          <ol className="mt-8 flex flex-wrap items-center gap-2 text-xs font-medium sm:text-sm">
            {['Organization', 'Workspace', 'Project', 'Board', 'List', 'Card'].map((n, i, a) => (
              <li key={n} className="flex items-center gap-2">
                <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5">
                  {n}
                </span>
                {i < a.length - 1 ? (
                  <span aria-hidden className="text-[var(--muted-fg)]">
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </Reveal>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <Reveal>
            <RoleTable title="Platform-level" rows={PLATFORM_ROLES} />
          </Reveal>
          <Reveal>
            <RoleTable title="Organization-level" rows={ORG_ROLES} />
          </Reveal>
          <Reveal>
            <RoleTable title="Board-level" rows={BOARD_ROLES} />
          </Reveal>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {TENANCY.map((t) => (
            <Reveal key={t.name}>
              <article className="h-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <span className="rounded-full bg-[#eef2ff] px-2.5 py-1 text-xs font-semibold text-[#4338ca]">
                  {t.badge}
                </span>
                <h3 className="mt-2 font-bold">{t.name}</h3>
                <p className="mt-1.5 text-sm text-[var(--muted-fg)]">{t.desc}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
