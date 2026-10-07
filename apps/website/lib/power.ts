export const POWER = [
  {
    name: 'Global + saved search',
    desc: 'Postgres FTS over cards, comments, attachments and wiki in one index. saved_searches (personal/shared, sidebar-pinned). JQL-style DSL on the roadmap — not raw SQL.',
    tag: 'Retention driver',
  },
  {
    name: 'Reporting & dashboards',
    desc: 'Append-only card_events feed list moves, stage/sprint/assignment changes. Cycle/lead percentiles, CFD stacked-area SVG from board_snapshots, velocity, stage distribution, portfolio health.',
    tag: 'Event-sourced',
  },
  {
    name: 'Time tracking',
    desc: 'time_logs (minutes, billable flag, date). Estimate vs actual bars per card/sprint/project. Org timesheets with CSV export for agency billing.',
    tag: 'Billable-ready',
  },
  {
    name: 'Forms / intake + SLA',
    desc: 'Admin JSON-schema builder, public portal /forms/:slug with captcha + IP throttle. Submission creates a card in the target list. sla_policies track response/resolution breach.',
    tag: 'Service-desk',
  },
  {
    name: 'Automations + webhooks',
    desc: 'Project Automation Engine: WHEN/IF/THEN rules (label router, testing-handoff round-robin), dry-run, run history. Org webhooks with HMAC-SHA256; Slack/GitHub/Drive catalog + real GitHub ingestion.',
    tag: 'WHEN/IF/THEN',
  },
  {
    name: 'Realtime polish',
    desc: 'Bun native WebSockets + Redis Pub/Sub backbone. Presence halos, typing indicators, change_seq cursor with changes?since= gap-fill. CRDT co-authoring deferred deliberately.',
    tag: 'Live boards',
  },
] as const;

export const NOTIFICATIONS = [
  'Granular preferences per event × channel (in-app / email / push) × frequency (instant / daily / weekly / off)',
  'Digest worker bundles pending notifications into one email — no fatigue-spam',
  'Do-not-disturb quiet hours, timezone-aware; push via FCM/APNs with push_devices registry',
] as const;
