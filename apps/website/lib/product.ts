export const PANELS = [
  {
    id: 'super-admin',
    name: 'Super Admin Panel',
    audience: 'Platform owner (you)',
    points: [
      'Organizations list: search, filter by plan/status',
      'Global user search across all tenants + impersonate for support',
      'Plans & billing (Stripe), overage tracking, feature flags per org',
      'Health dashboards: latency, queue depth, storage; global audit log',
      'Announcements/broadcast banners, rate-limit & abuse controls',
      'GDPR export / deletion tools per org',
    ],
  },
  {
    id: 'company-admin',
    name: 'Company Admin Panel',
    audience: 'Client org · /admin/*',
    points: [
      'Users: invite/remove, bulk CSV, deactivate, role assignment',
      'Workspaces & Projects: create/archive, templates, cross-project status',
      'Security: SSO/SAML, enforced 2FA, session timeout, IP allowlisting',
      'Billing: invoices, plan upgrade/downgrade, seat management',
      'Branding: logo, theme, custom subdomain; integrations + webhooks',
      'Stage Manager, custom fields library, retention & export settings',
    ],
  },
  {
    id: 'user',
    name: 'User Panel',
    audience: 'End-user workspace (the product)',
    points: [
      'Boards, lists, cards with drag-and-drop reordering',
      'Rich card detail: Markdown, checklists, labels, attachments, comments',
      'Assignees / Participants / Watchers as separate avatar groups',
      'Project rollups, Table/Calendar/Timeline/Sprint/Portfolio/My Tasks',
      'Sprints, phases, subtasks, automations, templates, notifications',
      'Search, @mentions, reactions, power-ups marketplace',
    ],
  },
] as const;

export const PLATFORM_ROLES = [
  {
    role: 'Super Admin',
    scope: 'Entire platform',
    access: 'All tenants, billing, infra, impersonation, flags',
  },
  {
    role: 'Platform Support',
    scope: 'Platform (limited)',
    access: 'View/impersonate for tickets, no billing/infra',
  },
  { role: 'Platform Analyst', scope: 'Read-only', access: 'Dashboards, usage metrics, no writes' },
] as const;

export const ORG_ROLES = [
  {
    role: 'Org Owner',
    scope: 'One org',
    access: 'Full control: billing, delete org, transfer ownership',
  },
  { role: 'Org Admin', scope: 'One org', access: 'Users, workspaces, security; no delete/billing' },
  { role: 'Billing Manager', scope: 'One org', access: 'Billing & invoices only' },
  {
    role: 'Workspace Admin',
    scope: 'One workspace',
    access: 'Boards & members inside that workspace',
  },
] as const;

export const BOARD_ROLES = [
  { role: 'Board Admin', scope: 'One board', access: 'Settings, delete board, manage members' },
  { role: 'Member', scope: 'One board', access: 'Create/edit/move cards, comment, assign' },
  { role: 'Commenter', scope: 'One board', access: 'Comment only, no edits' },
  { role: 'Viewer / Guest', scope: 'One board', access: 'Read-only, external collaborators' },
] as const;

export const TENANCY = [
  {
    name: 'Shared DB, shared schema',
    desc: 'Single DB, every row carries organization_id. Recommended default — cheapest, scales horizontally.',
    badge: 'Adopted',
  },
  {
    name: 'Schema-per-tenant',
    desc: 'One Postgres schema per company. Easier per-tenant backup for mid-size enterprise.',
    badge: 'Optional',
  },
  {
    name: 'DB-per-tenant',
    desc: 'Fully isolated database per company. Premium dedicated-instance tier for regulated clients.',
    badge: 'Upsell',
  },
] as const;

export const CARD_PEOPLE = [
  {
    name: 'Assignee',
    who: 'Person(s) doing the work. Multiple assignees supported.',
    added: 'Manually assigned.',
    notified: 'Everything: comments, reminders, status changes.',
  },
  {
    name: 'Participant',
    who: 'Anyone actively involved — commented, attached, @mentioned, moved the card.',
    added: 'Auto-added on first interaction; can be added manually.',
    notified: 'Comments + major status changes, not every minor edit.',
  },
  {
    name: 'Watcher / Observer',
    who: 'Stakeholders wanting visibility: manager, client, QA.',
    added: 'Self-subscribe (Watch) or added by Admin/Assignee.',
    notified: 'Configurable, digest-style: comments + status changes.',
  },
] as const;

export const PLANNING = [
  {
    name: 'Subtasks',
    rows: [
      'Self-referencing cards.parent_card_id — subtasks are full cards',
      'UI/validation limit: 2 levels (Task → Subtask)',
      'Roll-up on parent: subtasks_total / subtasks_done, optional auto-complete',
    ],
  },
  {
    name: 'Sprints',
    rows: [
      'Per-project cadence: weekly / biweekly / monthly / custom (or Kanban-only)',
      'planned → active → completed; one active sprint per card, history kept',
      'Auto-generate next sprint + carry-over; burndown, velocity, sprint report',
    ],
  },
  {
    name: 'Phases',
    rows: [
      'Lifecycle spanning sprints/boards: Discovery → Design → Dev → Test → Launch',
      'Template-able per org; per-project customization',
      'Optional sign-off gates for regulated flows (e.g. QA must approve Testing)',
    ],
  },
] as const;

export const CARD_DIMENSIONS = [
  { name: 'List', desc: 'Workflow state on the board (To Do / Doing / Done)' },
  { name: 'Stage', desc: 'Detailed status label (Under Testing, On Hold …)' },
  { name: 'Sprint', desc: 'Which time-box the card is pulled into' },
  { name: 'Phase', desc: 'Which lifecycle step it belongs to' },
] as const;

export const STAGE_CATEGORIES = [
  { name: 'not_started', color: '#94a3b8', examples: 'Backlog, To Do, Assigned to Dev' },
  { name: 'in_progress', color: '#6366f1', examples: 'In Progress, Under Testing, In Review' },
  { name: 'blocked', color: '#f59e0b', examples: 'Blocked, On Hold, Discussion Required' },
  { name: 'done', color: '#22c55e', examples: 'Done, Ready to Release, Finished' },
] as const;

export const VIEWS = [
  {
    name: 'Board',
    desc: 'Kanban with dnd-kit drag-drop, OCC version-guarded moves, virtualized columns.',
  },
  {
    name: 'Table',
    desc: 'Spreadsheet grid over the same cards; filter by assignee, label, stage, sprint.',
  },
  {
    name: 'Calendar',
    desc: 'Month/Week/Day grid, drag time-blocking, sprint & milestone overlays.',
  },
  { name: 'Timeline', desc: 'Gantt-style dependencies and date ranges across a project.' },
  { name: 'Sprint Board', desc: 'Board filtered to sprint_id with burndown and velocity.' },
  {
    name: 'Portfolio',
    desc: 'Cross-project health per workspace; rollups without hammering OLTP.',
  },
  {
    name: 'My Tasks',
    desc: 'Cross-board personal queue with E archive / S snooze / I subtask keys.',
  },
  {
    name: 'Cmd+K',
    desc: 'Global command palette + Postgres FTS search over cards, comments, docs.',
  },
] as const;
