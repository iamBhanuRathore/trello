/**
 * All shared enums — database enum values mirrored as TypeScript enums.
 * These must stay in sync with the Drizzle pgEnum definitions in DATABASE_SCHEMA.md.
 */

export enum PlanTier {
  Free = 'free',
  Pro = 'pro',
  Business = 'business',
  Enterprise = 'enterprise',
}

export enum SubscriptionStatus {
  Active = 'active',
  PastDue = 'past_due',
  Canceled = 'canceled',
  Trialing = 'trialing',
}

export enum OrgMemberRole {
  OrgOwner = 'org_owner',
  OrgAdmin = 'org_admin',
  BillingManager = 'billing_manager',
  WorkspaceAdmin = 'workspace_admin',
  Member = 'member',
}

export enum OrgMemberStatus {
  Active = 'active',
  Invited = 'invited',
  Deactivated = 'deactivated',
}

export enum WorkspaceMemberRole {
  Admin = 'admin',
  Member = 'member',
}

export enum WorkspaceVisibility {
  Private = 'private',
  Org = 'org',
}

export enum ProjectMemberRole {
  Owner = 'owner',
  Admin = 'admin',
  Member = 'member',
  Viewer = 'viewer',
}

export enum ProjectStatus {
  Active = 'active',
  OnHold = 'on_hold',
  Completed = 'completed',
  Archived = 'archived',
}

export enum BoardMemberRole {
  Admin = 'admin',
  Member = 'member',
  Commenter = 'commenter',
  Viewer = 'viewer',
}

export enum StageCategory {
  NotStarted = 'not_started',
  InProgress = 'in_progress',
  Blocked = 'blocked',
  Done = 'done',
}

export enum SprintType {
  Weekly = 'weekly',
  Biweekly = 'biweekly',
  Monthly = 'monthly',
  Custom = 'custom',
}

export enum SprintStatus {
  Planned = 'planned',
  Active = 'active',
  Completed = 'completed',
}

export enum PhaseStatus {
  NotStarted = 'not_started',
  Active = 'active',
  Completed = 'completed',
  Blocked = 'blocked',
}

export enum NotificationChannel {
  InApp = 'in_app',
  Email = 'email',
  Push = 'push',
}

export enum NotificationFrequency {
  Instant = 'instant',
  DigestDaily = 'digest_daily',
  DigestWeekly = 'digest_weekly',
  Off = 'off',
}
