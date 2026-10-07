import { Check } from 'lucide-react';
import SectionHeading from '@/components/layout/SectionHeading';
import Reveal from '@/components/layout/Reveal';
import { SECURITY_POINTS, ENTERPRISE_CHECKLIST } from '@/lib/enterprise';

export default function Security() {
  return (
    <section id="security" className="scroll-mt-24 border-b border-[var(--border)]">
      <div className="container-site py-12 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Governance"
            title="RBAC, SSO, audit, billing — enterprise procurement-ready"
            desc="Permission-driven UI: every button checks a permission key, so new roles never require UI changes. Custom fields, power-ups, flags and theming stay config-driven."
          />
        </Reveal>
        <Reveal>
          <ul className="mt-8 space-y-2.5">
            {SECURITY_POINTS.map((s) => (
              <li key={s} className="flex gap-2 text-sm sm:text-base text-[var(--muted-fg)]">
                <Check size={18} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ENTERPRISE_CHECKLIST.map((c) => (
            <Reveal key={c}>
              <div className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 text-sm">
                <Check size={16} className="mt-0.5 shrink-0 text-[#6366f1]" aria-hidden />
                <span>{c}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
