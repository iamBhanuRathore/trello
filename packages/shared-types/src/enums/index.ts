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
