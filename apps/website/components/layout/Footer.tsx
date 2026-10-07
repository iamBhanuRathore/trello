import { APP_LINKS } from '@/lib/site';

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border)] py-10">
      <div className="container-site grid gap-8 md:grid-cols-3">
        <div className="min-w-0">
          <p className="text-base font-bold">Boardly</p>
          <p className="mt-2 max-w-sm text-sm text-[var(--muted-fg)]">
            Enterprise multi-tenant Kanban &amp; project management. Organizations, workspaces,
            projects, boards, sprints, phases, stages, docs and chat in one platform.
          </p>
        </div>
        <nav aria-label="Product">
          <p className="text-sm font-semibold">Product</p>
          <ul className="mt-2 space-y-1.5 text-sm text-[var(--muted-fg)]">
            <li>
              <a className="hover:underline" href="#panels">
                Panels
              </a>
            </li>
            <li>
              <a className="hover:underline" href="#model">
                Domain model
              </a>
            </li>
            <li>
              <a className="hover:underline" href="#power">
                Automations &amp; reports
              </a>
            </li>
            <li>
              <a className="hover:underline" href="#pricing">
                Pricing
              </a>
            </li>
          </ul>
        </nav>
        <nav aria-label="Live surfaces">
          <p className="text-sm font-semibold">Live surfaces</p>
          <ul className="mt-2 space-y-1.5 text-sm text-[var(--muted-fg)]">
            <li>
              <a className="hover:underline" href={APP_LINKS.dashboard}>
                Dashboard · :5173
              </a>
            </li>
            <li>
              <a className="hover:underline" href={APP_LINKS.superAdmin}>
                Super Admin · :5174
              </a>
            </li>
            <li>
              <a className="hover:underline" href={APP_LINKS.apiDocs}>
                API docs · :3001/docs
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="container-site mt-8 border-t border-[var(--border)] pt-6 text-xs text-[var(--muted-fg)]">
        Design-era architecture snapshot is partially superseded — the tree +
        docs/project-tech-stack.md + docs/Decisions.md win on conflicts.
      </div>
    </footer>
  );
}
