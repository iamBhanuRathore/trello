import { KanbanSquare, Repeat, FileText, Zap, BarChart3 } from 'lucide-react';

export const TOUR_TABS = [
  {
    id: 'boards',
    icon: KanbanSquare,
    name: 'Boards',
    headline: 'A board for every way you work',
    desc: 'Drag cards across lists with version-guarded moves, virtualized columns and live cursors. Table, Calendar and Timeline read the same cards — no sync, no drift.',
    bullets: ['Unlimited boards per project', '8 views on one dataset', 'Offline-friendly API'],
  },
  {
    id: 'sprints',
    icon: Repeat,
    name: 'Sprints',
    headline: 'Weekly to monthly, or pure Kanban',
    desc: 'Per-project cadence with planner, burndown, velocity and carry-over. Cards keep sprint history, so reports stay true after the fact.',
    bullets: [
      'Weekly / biweekly / monthly / custom',
      'Burndown + velocity built in',
      'Auto next-sprint generation',
    ],
  },
  {
    id: 'docs',
    icon: FileText,
    name: 'Docs',
    headline: 'Docs that link to work — and back',
    desc: 'Wiki spaces with Markdown, version history and bidirectional card↔doc links. The Jira+Confluence moat, in one login.',
    bullets: ['Nested pages + revisions', 'Card ↔ doc cross-linking', 'One FTS index for all'],
  },
  {
    id: 'automations',
    icon: Zap,
    name: 'Automations',
    headline: 'WHEN / IF / THEN, no code',
    desc: 'Label routers, testing-handoff round-robins, dry-run and run history. One event bus feeds automations, webhooks and notifications alike.',
    bullets: ['Project automation engine', 'Dry-run before enabling', 'Slack / GitHub / webhooks'],
  },
  {
    id: 'reports',
    icon: BarChart3,
    name: 'Reports',
    headline: 'Answers, not just charts',
    desc: 'Event-sourced history powers cycle/lead percentiles, cumulative flow, stage distribution and portfolio health across projects.',
    bullets: ['CFD + cycle / lead time', 'Portfolio rollups', 'Custom report builder'],
  },
] as const;

export const INTEGRATIONS = [
  { name: 'Slack', cat: 'Chat', desc: 'Card alerts, unfurls and create-from-message.' },
  { name: 'GitHub', cat: 'Dev', desc: 'Branch/PR links, auto-move on merge.' },
  { name: 'Google Drive', cat: 'Files', desc: 'Attach and preview Docs, Sheets, Slides.' },
  { name: 'Google Calendar', cat: 'Time', desc: 'Two-way sync with time-blocking.' },
  { name: 'Figma', cat: 'Design', desc: 'Live embeds that update with the file.' },
  { name: 'Zapier', cat: 'Automation', desc: '6,000+ app connections, no code.' },
  { name: 'Jira', cat: 'Migrate', desc: 'One-click importer for issues + sprints.' },
  { name: 'Trello', cat: 'Migrate', desc: 'Full-board JSON migration in minutes.' },
  { name: 'Stripe', cat: 'Billing', desc: 'Per-seat billing with metered overages.' },
  { name: 'WorkOS', cat: 'Security', desc: 'SAML / OIDC / SCIM without DIY pain.' },
  { name: 'Email', cat: 'Inbox', desc: 'Forward-to-create, reply-to-comment.' },
  { name: 'Webhooks', cat: 'Dev', desc: 'HMAC-signed events for everything.' },
] as const;

export const TESTIMONIALS = [
  {
    quote:
      'We replaced three tools in a quarter. Sprints, docs and automations live in one place now — the team stopped asking where things are.',
    name: 'Priya Nair',
    role: 'Head of Product, Acme Corp',
    metric: '3 tools consolidated',
  },
  {
    quote:
      'Stage templates were the unlock. Every client speaks a different workflow language and Boardly just… speaks all of them.',
    name: 'Marcus Bell',
    role: 'Delivery Lead, Northwind Studio',
    metric: '12 client workflows',
  },
  {
    quote:
      'Audit log, SSO and custom roles got us through procurement in weeks instead of quarters. Security review was a non-event.',
    name: 'Sofia Almeida',
    role: 'CIO, Globex',
    metric: '6-week procurement',
  },
  {
    quote:
      'The GitHub integration moves cards when PRs merge. Standup writes itself now — burndown, carry-over, done.',
    name: 'Kenji Sato',
    role: 'Engineering Manager, Initech',
    metric: '40% less status overhead',
  },
] as const;

export const COMPARE_ROWS: {
  feature: string;
  boardly: string;
  jira: string;
  asana: string;
  trello: string;
}[] = [
  {
    feature: 'Unlimited boards per project',
    boardly: 'Yes',
    jira: 'Yes',
    asana: 'Yes',
    trello: 'Limited',
  },
  {
    feature: 'Sprints + burndown built in',
    boardly: 'Yes',
    jira: 'Yes',
    asana: 'Add-on',
    trello: 'No',
  },
  {
    feature: 'Custom stage vocabulary',
    boardly: 'Yes',
    jira: 'Partial',
    asana: 'Partial',
    trello: 'No',
  },
  {
    feature: 'Docs with card linking',
    boardly: 'Yes',
    jira: 'Paid add-on',
    asana: 'Partial',
    trello: 'No',
  },
  { feature: 'Team chat built in', boardly: 'Yes', jira: 'No', asana: 'No', trello: 'No' },
  {
    feature: 'Time tracking + timesheets',
    boardly: 'Yes',
    jira: 'Add-on',
    asana: 'Paid tier',
    trello: 'Power-up',
  },
  {
    feature: 'Public intake forms + SLA',
    boardly: 'Yes',
    jira: 'Paid tier',
    asana: 'Paid tier',
    trello: 'No',
  },
  {
    feature: 'SSO / SCIM',
    boardly: 'Business+',
    jira: 'Paid tier',
    asana: 'Paid tier',
    trello: 'Paid tier',
  },
  { feature: 'Free tier', boardly: 'Yes', jira: 'Yes', asana: 'Yes', trello: 'Yes' },
];

export const LOGOS = [
  'Acme Corp',
  'Globex',
  'Initech',
  'Northwind',
  'Umbrella',
  'Stark Labs',
  'Wayne & Co',
  'Hooli',
];
