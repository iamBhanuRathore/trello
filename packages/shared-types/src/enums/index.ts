/**
 * All shared enums — database enum values mirrored as TypeScript const objects.
 * These must stay in sync with the Drizzle pgEnum definitions in DATABASE_SCHEMA.md.
 *
 * Pattern: `const` object + union type (NOT `enum`). Rationale:
 * - `erasableSyntaxOnly` (dashboard/super-admin) forbids runtime-emitting `enum`
 *   syntax, which broke Eden Treaty type imports (`treaty<App>`) in frontend
 *   programs (TS1294). Const objects are erasable-safe.
 * - Runtime shape is identical to the old string enums (`{ Key: 'value' }`), so
 *   value access (`PlanTier.Free`), `z.nativeEnum()`, and DB writes are unchanged.
 * - `isolatedModules`/Babel-safe (no const-enum inlining hazards).
 */

export const PlanTier = {
  Free: 'free',
  Pro: 'pro',
  Business: 'business',
  Enterprise: 'enterprise',
} as const;
export type PlanTier = (typeof PlanTier)[keyof typeof PlanTier];

export const SubscriptionStatus = {
  Active: 'active',
  PastDue: 'past_due',
  Canceled: 'canceled',
  Trialing: 'trialing',
  PastDueDowngradePending: 'past_due_downgrade_pending',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const OrgMemberRole = {
  OrgOwner: 'org_owner',
  OrgAdmin: 'org_admin',
  BillingManager: 'billing_manager',
  WorkspaceAdmin: 'workspace_admin',
  Member: 'member',
  Viewer: 'viewer',
} as const;
export type OrgMemberRole = (typeof OrgMemberRole)[keyof typeof OrgMemberRole];

export const OrgMemberStatus = {
  Active: 'active',
  Invited: 'invited',
  Deactivated: 'deactivated',
} as const;
export type OrgMemberStatus = (typeof OrgMemberStatus)[keyof typeof OrgMemberStatus];

export const WorkspaceMemberRole = {
  Admin: 'admin',
  Member: 'member',
} as const;
export type WorkspaceMemberRole = (typeof WorkspaceMemberRole)[keyof typeof WorkspaceMemberRole];

export const WorkspaceVisibility = {
  Private: 'private',
  Org: 'org',
} as const;
export type WorkspaceVisibility = (typeof WorkspaceVisibility)[keyof typeof WorkspaceVisibility];

export const ProjectMemberRole = {
  Owner: 'owner',
  Admin: 'admin',
  Member: 'member',
  Viewer: 'viewer',
} as const;
export type ProjectMemberRole = (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole];

export const ProjectStatus = {
  Active: 'active',
  OnHold: 'on_hold',
  Completed: 'completed',
  Archived: 'archived',
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const BoardMemberRole = {
  Admin: 'admin',
  Member: 'member',
  Commenter: 'commenter',
  Viewer: 'viewer',
} as const;
export type BoardMemberRole = (typeof BoardMemberRole)[keyof typeof BoardMemberRole];

export const StageCategory = {
  NotStarted: 'not_started',
  InProgress: 'in_progress',
  Blocked: 'blocked',
  Done: 'done',
} as const;
export type StageCategory = (typeof StageCategory)[keyof typeof StageCategory];

export const SprintType = {
  Weekly: 'weekly',
  Biweekly: 'biweekly',
  Monthly: 'monthly',
  Custom: 'custom',
} as const;
export type SprintType = (typeof SprintType)[keyof typeof SprintType];

export const SprintStatus = {
  Planned: 'planned',
  Active: 'active',
  Completed: 'completed',
} as const;
export type SprintStatus = (typeof SprintStatus)[keyof typeof SprintStatus];

export const PhaseStatus = {
  NotStarted: 'not_started',
  Active: 'active',
  Completed: 'completed',
  Blocked: 'blocked',
} as const;
export type PhaseStatus = (typeof PhaseStatus)[keyof typeof PhaseStatus];

export const NotificationChannel = {
  InApp: 'in_app',
  Email: 'email',
  Push: 'push',
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationFrequency = {
  Instant: 'instant',
  DigestDaily: 'digest_daily',
  DigestWeekly: 'digest_weekly',
  Off: 'off',
} as const;
export type NotificationFrequency =
  (typeof NotificationFrequency)[keyof typeof NotificationFrequency];

export const ChatChannelType = {
  Direct: 'direct',
  GroupPrivate: 'group_private',
  GroupPublic: 'group_public',
  TaskThread: 'task_thread',
} as const;
export type ChatChannelType = (typeof ChatChannelType)[keyof typeof ChatChannelType];

export const ChatMemberRole = {
  Owner: 'owner',
  Admin: 'admin',
  Member: 'member',
} as const;
export type ChatMemberRole = (typeof ChatMemberRole)[keyof typeof ChatMemberRole];

export const UserPresenceStatus = {
  Available: 'available',
  Busy: 'busy',
  Away: 'away',
  Leave: 'leave',
  Offline: 'offline',
} as const;
export type UserPresenceStatus = (typeof UserPresenceStatus)[keyof typeof UserPresenceStatus];

// ─── Media scan-gate lifecycle (varchar columns, TS-typed via .$type) ────────
// Canonical sets reconciled in Phase 0 (code inventory + dev GROUP BY). `skipped`
// is a real backend-written value (SCAN_MODE=disabled / legacy rescan, see
// backend storage.ts), NOT dev-only — production can emit it, so it stays in.
export const MediaStatus = {
  Staged: 'staged',
  Scanning: 'scanning',
  Ready: 'ready',
  Blocked: 'blocked',
  Failed: 'failed',
} as const;
export type MediaStatus = (typeof MediaStatus)[keyof typeof MediaStatus];
export const MediaStatusValues: readonly MediaStatus[] = [
  'staged',
  'scanning',
  'ready',
  'blocked',
  'failed',
];

export const MediaScanStatus = {
  Pending: 'pending',
  Clean: 'clean',
  Infected: 'infected',
  Error: 'error',
  Skipped: 'skipped',
} as const;
export type MediaScanStatus = (typeof MediaScanStatus)[keyof typeof MediaScanStatus];
export const MediaScanStatusValues: readonly MediaScanStatus[] = [
  'pending',
  'clean',
  'infected',
  'error',
  'skipped',
];

// ─── Git links (varchar kind/state, TS-typed via .$type) ─────────────────────
// State covers commit links (pushed), PR lifecycle (open/merged/closed/updated)
// and PR review outcomes persisted over the link (approved/changes_requested/
// commented). Inbox triage filters on ['open', 'changes_requested'].
export const GitLinkKind = {
  Commit: 'commit',
  PR: 'pr',
} as const;
export type GitLinkKind = (typeof GitLinkKind)[keyof typeof GitLinkKind];
export const GitLinkKindValues: readonly GitLinkKind[] = ['commit', 'pr'];

export const GitLinkState = {
  Pushed: 'pushed',
  Open: 'open',
  Merged: 'merged',
  Closed: 'closed',
  Updated: 'updated',
  Approved: 'approved',
  ChangesRequested: 'changes_requested',
  Commented: 'commented',
} as const;
export type GitLinkState = (typeof GitLinkState)[keyof typeof GitLinkState];
export const GitLinkStateValues: readonly GitLinkState[] = [
  'pushed',
  'open',
  'merged',
  'closed',
  'updated',
  'approved',
  'changes_requested',
  'commented',
];

// ─── Card access requests ────────────────────────────────────────────────────
export const CardAccessStatus = {
  Pending: 'pending',
  Approved: 'approved',
  Dismissed: 'dismissed',
} as const;
export type CardAccessStatus = (typeof CardAccessStatus)[keyof typeof CardAccessStatus];
export const CardAccessStatusValues: readonly CardAccessStatus[] = [
  'pending',
  'approved',
  'dismissed',
];

// ─── Project automation runs ─────────────────────────────────────────────────
export const AutomationRunStatus = {
  Executed: 'executed',
  Skipped: 'skipped',
  Failed: 'failed',
} as const;
export type AutomationRunStatus = (typeof AutomationRunStatus)[keyof typeof AutomationRunStatus];
export const AutomationRunStatusValues: readonly AutomationRunStatus[] = [
  'executed',
  'skipped',
  'failed',
];

export const AutomationRunReason = {
  AlreadyAssigned: 'ALREADY_ASSIGNED',
  AssigneeNotFound: 'ASSIGNEE_NOT_FOUND',
  EmptyPool: 'EMPTY_POOL',
  ConditionUnmet: 'CONDITION_UNMET',
  LabelNotFound: 'LABEL_NOT_FOUND',
  OpenSubtask: 'OPEN_SUBTASK',
  DuplicateEvent: 'DUPLICATE_EVENT',
  Error: 'ERROR',
} as const;
export type AutomationRunReason = (typeof AutomationRunReason)[keyof typeof AutomationRunReason];
export const AutomationRunReasonValues: readonly AutomationRunReason[] = [
  'ALREADY_ASSIGNED',
  'ASSIGNEE_NOT_FOUND',
  'EMPTY_POOL',
  'CONDITION_UNMET',
  'LABEL_NOT_FOUND',
  'OPEN_SUBTASK',
  'DUPLICATE_EVENT',
  'ERROR',
];

// ─── Seat change requests (only 'pending' written today; union is the ───────
// documented contract for the confirm/fail transitions when they land) ───────
export const SeatChangeStatus = {
  Pending: 'pending',
  Confirmed: 'confirmed',
  Failed: 'failed',
} as const;
export type SeatChangeStatus = (typeof SeatChangeStatus)[keyof typeof SeatChangeStatus];
export const SeatChangeStatusValues: readonly SeatChangeStatus[] = [
  'pending',
  'confirmed',
  'failed',
];

export const SeatChangeDirection = {
  Increase: 'increase',
  Decrease: 'decrease',
} as const;
export type SeatChangeDirection = (typeof SeatChangeDirection)[keyof typeof SeatChangeDirection];
export const SeatChangeDirectionValues: readonly SeatChangeDirection[] = ['increase', 'decrease'];

// ─── Inbound email intake ────────────────────────────────────────────────────
export const InboundEmailStatus = {
  Received: 'received',
  Failed: 'failed',
} as const;
export type InboundEmailStatus = (typeof InboundEmailStatus)[keyof typeof InboundEmailStatus];
export const InboundEmailStatusValues: readonly InboundEmailStatus[] = ['received', 'failed'];
