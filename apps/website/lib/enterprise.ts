export const SECURITY_POINTS = [
  'RBAC with ~98 permission keys (board.create, card.delete, member.invite …); 4 seeded system roles + custom org roles + team roles (Lead/Developer/Tester)',
  'Enforcement in backend requirePermission() + frontend <Can> gates; every permission ships with a test',
  'SSO/SAML + OIDC via WorkOS, SCIM auto-provisioning, enforceSSO, domain routing; org-level 2FA, session timeout, IP allowlisting',
  'Audit log with export (730d retention), soft-deletes + Trash everywhere, org-namespaced cache keys, token-bucket rate limits',
  'Tenant isolation is app-layer organization_id predicates + membership checks. Postgres RLS deliberately unenforced — accepted risk (Decisions 2026-09-28).',
] as const;

export const ENTERPRISE_CHECKLIST = [
  'SSO (SAML 2.0 / OIDC) + SCIM provisioning',
  'Enforced 2FA / passkeys at org level',
  'Custom roles & board-level overrides',
  'Full audit log with export (SOC 2)',
  'Data residency options (EU/US)',
  'IP allowlisting, session policies',
  'Org export & right-to-be-forgotten',
  'Dedicated-instance tier (DB-per-tenant)',
  'Per-plan API rate limits',
  'White-labeling (domain + branding)',
  'Advanced reporting (CFD, cycle/lead, builder)',
  'JQL-style search + saved filters',
  'Time tracking & timesheets',
  'Public intake forms + SLA policies',
  'Docs/Wiki with card-linking',
  'Mobile apps with push',
] as const;

export const ACTUAL_STACK = [
  {
    layer: 'Dashboard / Super-admin',
    tech: 'Vite + React 18 + TS + Tailwind v4 + dnd-kit + TanStack Query + Zustand',
  },
  { layer: 'Marketing site', tech: 'This Next.js app (App Router, static export)' },
  { layer: 'Mobile', tech: 'Expo React Native + Query/Zustand + SQLite persistence' },
  { layer: 'Backend', tech: 'Bun + Elysia (/v1/*, Eden types) + Drizzle ORM + jose JWT' },
  {
    layer: 'Data',
    tech: 'PostgreSQL (FTS search — OpenSearch never adopted) + Redis (cache/pub-sub/rate-limit, no BullMQ)',
  },
  { layer: 'Files/Auth', tech: 'S3-compatible storage · Stripe Billing · WorkOS SSO/SCIM' },
  {
    layer: 'Infra',
    tech: 'Docker + Kubernetes · GitHub Actions CI · OTEL/Grafana/Sentry (planned)',
  },
] as const;

export const STALE_NOTES = [
  'NestJS / Elasticsearch / BullMQ in early drafts were never adopted — actual: Bun + Elysia, Postgres FTS, inline dispatch.',
  'Wiki tables renamed — actual tables are documents + document_cards.',
  'RLS presented as active in early drafts is deliberately unenforced; app-layer scoping enforces.',
  'Epics, Scrum-team entity and Custom Fields are aspirational-only (no tables/code).',
] as const;

export const ROADMAP_PHASES = [
  {
    name: 'Phase 1 — MVP (shipped)',
    items:
      'Auth, orgs, RBAC, workspaces → projects → boards → lists → cards, comments/attachments/labels/checklists/subtasks, WS sync, notifications v1, both admin panels.',
  },
  {
    name: 'Phase 2 — Growth (shipped)',
    items:
      'Stage templates, sprints, phases, FTS search + saved searches, notification digests, automations + webhooks, integrations, reporting v1, time tracking, importers.',
  },
  {
    name: 'Phase 3 — Enterprise (shipped)',
    items:
      'SSO/SCIM, custom roles, audit log, dedicated tier, CFD/cycle/velocity, presence/typing, forms + SLA, docs + linking, mobile P1+P2, marketplace + API.',
  },
  {
    name: 'Phase 4–5 — Collaboration + hardening (partial)',
    items:
      'Calendar + Google sync, team chat, GitHub engine, inbox + inbound email, automation engine, OCC + gap-fill, perf passes. Deferred: Outlook sync, GitLab, CRDT cursors, WebRTC huddles, AI Copilot.',
  },
] as const;

export const PLANS = [
  {
    name: 'Free',
    price: '$0',
    desc: 'Prove the core loop: boards, cards, comments, basic search.',
    cta: 'Start for free',
  },
  {
    name: 'Pro',
    price: '$10/seat',
    desc: 'Sprints, stages, reports v1, automations, integrations, saved searches.',
    cta: 'Start 14-day trial',
  },
  {
    name: 'Business',
    price: '$20/seat',
    desc: 'SSO, custom roles, audit export, forms + SLA, portfolio, timesheets.',
    cta: 'Talk to sales',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    desc: 'Dedicated-instance tier, residency, SCIM, white-label, SLA uptime.',
    cta: 'Contact us',
  },
] as const;

export const FAQS = [
  {
    q: 'How is tenant data isolated?',
    a: 'Every query is scoped by organization_id plus membership checks, with org-prefixed cache keys, clamped pagination and IDOR regression tests. RLS is deliberately unenforced — an accepted, documented risk.',
  },
  {
    q: 'Can one project hold several boards?',
    a: 'Yes. Workspace → Project → Boards (Planning, Bugs, Content …). A card simultaneously knows its List, Stage, Sprint and Phase — four independent, filterable dimensions.',
  },
  {
    q: 'How do custom stages differ from lists?',
    a: 'Lists are physical board position. Stages are a company-defined status vocabulary (name + color + category) that drives reporting, notifications and automations across boards.',
  },
  {
    q: 'What is already built vs deferred?',
    a: 'MVP → Growth → Enterprise → collaboration/hardening are shipped. Deferred: Outlook sync, GitLab, CRDT co-authoring, WebRTC huddles, automation rule editing, AI Copilot.',
  },
] as const;
