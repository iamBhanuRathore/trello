import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  real,
  date,
  jsonb,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── Enums ────────────────────────────────────────────────────────────────────
export const planTierEnum = pgEnum('plan_tier', ['free', 'pro', 'business', 'enterprise']);
export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'revoked',
  'expired',
]);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'past_due',
  'canceled',
  'trialing',
  'past_due_downgrade_pending',
]);
export const orgMemberRoleEnum = pgEnum('org_member_role', [
  'org_owner',
  'org_admin',
  'billing_manager',
  'workspace_admin',
  'member',
  'viewer',
]);
export const orgMemberStatusEnum = pgEnum('org_member_status', [
  'active',
  'invited',
  'deactivated',
]);
export const workspaceMemberRoleEnum = pgEnum('workspace_member_role', ['admin', 'member']);
export const workspaceVisibilityEnum = pgEnum('workspace_visibility', ['private', 'org']);
export const projectMemberRoleEnum = pgEnum('project_member_role', [
  'owner',
  'admin',
  'member',
  'viewer',
]);
export const projectStatusEnum = pgEnum('project_status', [
  'active',
  'on_hold',
  'completed',
  'archived',
]);
export const boardMemberRoleEnum = pgEnum('board_member_role', [
  'admin',
  'member',
  'commenter',
  'viewer',
]);
export const stageCategoryEnum = pgEnum('stage_category', [
  'not_started',
  'in_progress',
  'blocked',
  'done',
]);
export const sprintTypeEnum = pgEnum('sprint_type', ['weekly', 'biweekly', 'monthly', 'custom']);
export const sprintStatusEnum = pgEnum('sprint_status', ['planned', 'active', 'completed']);
export const phaseStatusEnum = pgEnum('phase_status', [
  'not_started',
  'active',
  'completed',
  'blocked',
]);
export const notificationChannelEnum = pgEnum('notification_channel', ['in_app', 'email', 'push']);
export const notificationFrequencyEnum = pgEnum('notification_frequency', [
  'instant',
  'digest_daily',
  'digest_weekly',
  'off',
]);
export const integrationProviderEnum = pgEnum('integration_provider', [
  'slack',
  'github',
  'google_drive',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const timestamps = {
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
};

// ─── Plans ────────────────────────────────────────────────────────────────────
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  tier: planTierEnum('tier').notNull(),
  stripePriceId: varchar('stripe_price_id', { length: 255 }),
  maxSeats: integer('max_seats'),
  maxWorkspaces: integer('max_workspaces'),
  maxBoards: integer('max_boards'),
  maxStorageGb: integer('max_storage_gb'),
  featureFlags: jsonb('feature_flags').default('{}'),
  ...timestamps,
});

// ─── Organizations ────────────────────────────────────────────────────────────
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  planId: uuid('plan_id').references(() => plans.id),
  ssoEnabled: boolean('sso_enabled').notNull().default(false),
  workosOrgId: varchar('workos_org_id', { length: 255 }),
  isDedicatedDb: boolean('is_dedicated_db').notNull().default(false),
  dedicatedDbUrl: varchar('dedicated_db_url', { length: 1024 }),
  logoUrl: varchar('logo_url', { length: 2048 }),
  primaryColor: varchar('primary_color', { length: 7 }),
  ...timestamps,
});

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  name: varchar('name', { length: 255 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 2048 }),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  twoFactorSecret: varchar('two_factor_secret', { length: 255 }),
  timezone: varchar('timezone', { length: 100 }).default('UTC'),
  lastLoginAt: timestamp('last_login_at'),
  deactivatedAt: timestamp('deactivated_at'),
  ...timestamps,
});

// ─── Organization Members ─────────────────────────────────────────────────────
export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: orgMemberRoleEnum('role').notNull().default('member'),
    status: orgMemberStatusEnum('status').notNull().default('invited'),
    invitedBy: uuid('invited_by').references(() => users.id),
    lastActiveAt: timestamp('last_active_at'),
    deactivationReason: varchar('deactivation_reason', { length: 500 }),
    deactivatedBy: uuid('deactivated_by').references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex('org_members_org_user_idx').on(t.organizationId, t.userId)]
);

// ─── Invitations ──────────────────────────────────────────────────────────────
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: orgMemberRoleEnum('role').notNull().default('member'),
  token: varchar('token', { length: 255 }).notNull().unique(),
  status: invitationStatusEnum('status').notNull().default('pending'),
  invitedByUserId: uuid('invited_by_user_id').references(() => users.id),
  invitedByName: varchar('invited_by_name', { length: 255 }),
  expiresAt: timestamp('expires_at').notNull(),
  ...timestamps,
});

// ─── Refresh Tokens ───────────────────────────────────────────────────────────
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Subscriptions ────────────────────────────────────────────────────────────
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id)
    .unique(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  stripeSubscriptionItemId: varchar('stripe_subscription_item_id', { length: 255 }),
  stripeGuestOverageItemId: varchar('stripe_guest_overage_item_id', { length: 255 }),
  billingInterval: varchar('billing_interval', { length: 20 }).default('monthly'),
  status: subscriptionStatusEnum('status').notNull().default('active'),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  seatCount: integer('seat_count').notNull().default(1),
  pendingSeatChange: boolean('pending_seat_change').notNull().default(false),
  seatVersion: integer('seat_version').notNull().default(0),
  billingTerms: varchar('billing_terms', { length: 20 }).default('card'),
  trialEndsAt: timestamp('trial_ends_at'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  ...timestamps,
});

// ─── Billing Events (Webhook Idempotency Log) ─────────────────────────────────
export const billingEvents = pgTable('billing_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  stripeEventId: varchar('stripe_event_id', { length: 255 }).notNull().unique(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id),
  payload: jsonb('payload').notNull(),
  processedAt: timestamp('processed_at').notNull().defaultNow(),
  error: text('error'),
});

// ─── Guest Seats ──────────────────────────────────────────────────────────────
export const guestSeats = pgTable('guest_seats', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  billable: boolean('billable').notNull().default(false),
  ...timestamps,
});

// ─── Seat Change Requests ─────────────────────────────────────────────────────
export const seatChangeRequests = pgTable('seat_change_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id')
    .notNull()
    .references(() => subscriptions.id),
  requestedQuantity: integer('requested_quantity').notNull(),
  direction: varchar('direction', { length: 10 }).notNull(), // 'increase' | 'decrease'
  stripeIdempotencyKey: varchar('stripe_idempotency_key', { length: 255 }).notNull().unique(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending' | 'confirmed' | 'failed'
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Workspaces ───────────────────────────────────────────────────────────────
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  visibility: workspaceVisibilityEnum('visibility').notNull().default('org'),
  ...timestamps,
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: workspaceMemberRoleEnum('role').notNull().default('member'),
    ...timestamps,
  },
  (t) => [uniqueIndex('workspace_members_ws_user_idx').on(t.workspaceId, t.userId)]
);

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  name: varchar('name', { length: 255 }).notNull(),
  key: varchar('key', { length: 10 }),
  description: text('description'),
  status: projectStatusEnum('status').notNull().default('active'),
  taskCounter: integer('task_counter').notNull().default(0),
  startDate: date('start_date'),
  endDate: date('end_date'),
  isArchived: boolean('is_archived').notNull().default(false),
  ...timestamps,
});

export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: projectMemberRoleEnum('role').notNull().default('member'),
    ...timestamps,
  },
  (t) => [uniqueIndex('project_members_proj_user_idx').on(t.projectId, t.userId)]
);

// ─── Boards ───────────────────────────────────────────────────────────────────
export const boards = pgTable('boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  background: varchar('background', { length: 255 }),
  isArchived: boolean('is_archived').notNull().default(false),
  isTemplate: boolean('is_template').notNull().default(false),
  ...timestamps,
});

export const boardMembers = pgTable(
  'board_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: boardMemberRoleEnum('role').notNull().default('member'),
    ...timestamps,
  },
  (t) => [uniqueIndex('board_members_board_user_idx').on(t.boardId, t.userId)]
);

export const labels = pgTable('labels', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id')
    .notNull()
    .references(() => boards.id),
  name: varchar('name', { length: 100 }).notNull(),
  color: varchar('color', { length: 7 }).notNull(),
  ...timestamps,
});

// ─── Lists ────────────────────────────────────────────────────────────────────
export const lists = pgTable('lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id')
    .notNull()
    .references(() => boards.id),
  name: varchar('name', { length: 255 }).notNull(),
  position: real('position').notNull(),
  isArchived: boolean('is_archived').notNull().default(false),
  ...timestamps,
});

// ─── Custom Stages ────────────────────────────────────────────────────────────
export const stageTemplates = pgTable('stage_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  projectId: uuid('project_id').references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  ...timestamps,
});

export const stages = pgTable('stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => stageTemplates.id),
  name: varchar('name', { length: 100 }).notNull(),
  color: varchar('color', { length: 7 }).notNull(),
  position: real('position').notNull(),
  category: stageCategoryEnum('category').notNull(),
  ...timestamps,
});

// ─── Cards ────────────────────────────────────────────────────────────────────
export const cards = pgTable('cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  listId: uuid('list_id')
    .notNull()
    .references(() => lists.id),
  parentCardId: uuid('parent_card_id'), // self-ref FK added in migration
  taskNumber: integer('task_number'),
  key: varchar('key', { length: 30 }),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  position: real('position').notNull(),
  dueDate: timestamp('due_date'),
  stageId: uuid('stage_id').references(() => stages.id),
  coverImage: varchar('cover_image', { length: 2048 }),
  storyPoints: integer('story_points'),
  estimateMinutes: integer('estimate_minutes'),
  subtasksTotal: integer('subtasks_total').notNull().default(0),
  subtasksDone: integer('subtasks_done').notNull().default(0),
  isArchived: boolean('is_archived').notNull().default(false),
  ...timestamps,
});

export const cardAssignees = pgTable(
  'card_assignees',
  {
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    assignedAt: timestamp('assigned_at').notNull().defaultNow(),
    assignedBy: uuid('assigned_by').references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.userId] })]
);

export const cardParticipants = pgTable(
  'card_participants',
  {
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    addedAt: timestamp('added_at').notNull().defaultNow(),
    addedBy: uuid('added_by').references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.userId] })]
);

export const cardWatchers = pgTable(
  'card_watchers',
  {
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    subscribedAt: timestamp('subscribed_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.userId] })]
);

export const cardLabels = pgTable(
  'card_labels',
  {
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.labelId] })]
);

// ─── Card Content ─────────────────────────────────────────────────────────────
export const checklists = pgTable('checklists', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id')
    .notNull()
    .references(() => cards.id),
  title: varchar('title', { length: 255 }).notNull(),
  position: real('position').notNull(),
  ...timestamps,
});

export const checklistItems = pgTable('checklist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  checklistId: uuid('checklist_id')
    .notNull()
    .references(() => checklists.id),
  text: varchar('text', { length: 1000 }).notNull(),
  isDone: boolean('is_done').notNull().default(false),
  position: real('position').notNull(),
  assignedTo: uuid('assigned_to').references(() => users.id),
  dueDate: timestamp('due_date'),
  ...timestamps,
});

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id')
    .notNull()
    .references(() => cards.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  isEdited: boolean('is_edited').notNull().default(false),
  ...timestamps,
});

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id')
    .notNull()
    .references(() => cards.id),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  fileName: varchar('file_name', { length: 500 }).notNull(),
  url: varchar('url', { length: 2048 }).notNull(),
  fileType: varchar('file_type', { length: 100 }),
  sizeBytes: integer('size_bytes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

// ─── Sprints & Phases ─────────────────────────────────────────────────────────
export const sprints = pgTable('sprints', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  type: sprintTypeEnum('type').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  goal: text('goal'),
  status: sprintStatusEnum('status').notNull().default('planned'),
  ...timestamps,
});

export const cardSprints = pgTable(
  'card_sprints',
  {
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id),
    sprintId: uuid('sprint_id')
      .notNull()
      .references(() => sprints.id),
    addedAt: timestamp('added_at').notNull().defaultNow(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.sprintId] })]
);

export const phases = pgTable('phases', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  position: real('position').notNull(),
  status: phaseStatusEnum('status').notNull().default('not_started'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  ...timestamps,
});

export const cardPhase = pgTable(
  'card_phase',
  {
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id),
    phaseId: uuid('phase_id')
      .notNull()
      .references(() => phases.id),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.phaseId] })]
);

// ─── Time Tracking ────────────────────────────────────────────────────────────
export const timeLogs = pgTable('time_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id')
    .notNull()
    .references(() => cards.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  minutes: integer('minutes').notNull(),
  description: varchar('description', { length: 500 }),
  loggedDate: date('logged_date').notNull(),
  isBillable: boolean('is_billable').notNull().default(false),
  ...timestamps,
});

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    channel: notificationChannelEnum('channel').notNull(),
    frequency: notificationFrequencyEnum('frequency').notNull().default('instant'),
    quietHoursStart: integer('quiet_hours_start'),
    quietHoursEnd: integer('quiet_hours_end'),
  },
  (t) => [uniqueIndex('notif_pref_idx').on(t.userId, t.organizationId, t.eventType, t.channel)]
);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull().default('{}'),
  isRead: boolean('is_read').notNull().default(false),
  readAt: timestamp('read_at'),
  isDispatched: boolean('is_dispatched').notNull().default(false), // For digest and queue logic
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Activity & Audit ─────────────────────────────────────────────────────────
export const activityLog = pgTable('activity_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(),
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  actorId: uuid('actor_id').references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(),
  target: varchar('target', { length: 255 }),
  targetId: uuid('target_id'),
  metadata: jsonb('metadata').default('{}'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 500 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Automations & Webhooks ───────────────────────────────────────────────────
export const automations = pgTable('automations', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id')
    .notNull()
    .references(() => boards.id),
  name: varchar('name', { length: 255 }).notNull(),
  triggerJson: jsonb('trigger_json').notNull(),
  actionJson: jsonb('action_json').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  ...timestamps,
});

// ─── Search ───────────────────────────────────────────────────────────────────
export const savedSearches = pgTable('saved_searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  name: varchar('name', { length: 255 }).notNull(),
  query: text('query').notNull(),
  filters: jsonb('filters'), // e.g. { type: 'card', status: 'active' }
  ...timestamps,
});

export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  url: varchar('url', { length: 2048 }).notNull(),
  events: jsonb('events').notNull(),
  secret: varchar('secret', { length: 255 }).notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  ...timestamps,
});

export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  provider: integrationProviderEnum('provider').notNull(),
  accessToken: varchar('access_token', { length: 2048 }),
  refreshToken: varchar('refresh_token', { length: 2048 }),
  metadata: jsonb('metadata').default('{}'),
  ...timestamps,
});

// ─── Card Events (append-only for reporting) ──────────────────────────────────
export const cardEvents = pgTable('card_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id')
    .notNull()
    .references(() => cards.id),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  fromValue: varchar('from_value', { length: 255 }),
  toValue: varchar('to_value', { length: 255 }),
  actorId: uuid('actor_id').references(() => users.id),
  occurredAt: timestamp('occurred_at').notNull().defaultNow(),
});

// ─── RBAC ─────────────────────────────────────────────────────────────────────
export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id),
    name: varchar('name', { length: 100 }).notNull(),
    isSystemRole: boolean('is_system_role').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('system_role_name_idx')
      .on(t.name)
      .where(sql`is_system_role = true`),
    uniqueIndex('org_role_name_idx').on(t.organizationId, t.name),
  ]
);

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  description: varchar('description', { length: 500 }),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })]
);

// ─── Docs & Wiki ─────────────────────────────────────────────────────────────
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  content: text('content').notNull().default(''),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  isArchived: boolean('is_archived').notNull().default(false),
  ...timestamps,
});

export const documentCards = pgTable(
  'document_cards',
  {
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id),
    linkedAt: timestamp('linked_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.cardId] })]
);

// ─── Intake Forms & SLAs ─────────────────────────────────────────────────────
export const intakeForms = pgTable('intake_forms', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  boardId: uuid('board_id')
    .notNull()
    .references(() => boards.id),
  listId: uuid('list_id')
    .notNull()
    .references(() => lists.id),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  fields: jsonb('fields').notNull().default('[]'),
  isPublished: boolean('is_published').notNull().default(true),
  defaultAssigneeId: uuid('default_assignee_id').references(() => users.id),
  slaHours: integer('sla_hours'),
  ...timestamps,
});

export const formSubmissions = pgTable('form_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  formId: uuid('form_id')
    .notNull()
    .references(() => intakeForms.id),
  cardId: uuid('card_id')
    .notNull()
    .references(() => cards.id),
  submittedByEmail: varchar('submitted_by_email', { length: 255 }),
  submittedByName: varchar('submitted_by_name', { length: 255 }),
  data: jsonb('data').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── SSO & SCIM Directory Sync ───────────────────────────────────────────────
export const ssoConfigurations = pgTable('sso_configurations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .unique()
    .references(() => organizations.id),
  provider: varchar('provider', { length: 50 }).notNull().default('okta'),
  domain: varchar('domain', { length: 255 }).notNull(),
  idpMetadataUrl: varchar('idp_metadata_url', { length: 2048 }),
  clientId: varchar('client_id', { length: 255 }),
  clientSecret: varchar('client_secret', { length: 255 }),
  workosOrganizationId: varchar('workos_organization_id', { length: 255 }),
  workosConnectionId: varchar('workos_connection_id', { length: 255 }),
  scimEnabled: boolean('scim_enabled').notNull().default(false),
  scimToken: varchar('scim_token', { length: 255 }),
  enforceSSO: boolean('enforce_sso').notNull().default(false),
  ...timestamps,
});

// ─── Public Developer API Keys ───────────────────────────────────────────────
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 20 }).notNull(),
  keyHash: varchar('key_hash', { length: 255 }).notNull().unique(),
  scopes: jsonb('scopes').notNull().default('[]'),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  ...timestamps,
});

// ─── Marketplace Apps & Power-Ups ───────────────────────────────────────────
export const marketplaceApps = pgTable('marketplace_apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description').notNull(),
  developerName: varchar('developer_name', { length: 255 }).notNull(),
  iconUrl: varchar('icon_url', { length: 1024 }),
  category: varchar('category', { length: 50 }).notNull().default('utility'),
  isVerified: boolean('is_verified').notNull().default(false),
  capabilities: jsonb('capabilities').notNull().default('{}'),
  configSchema: jsonb('config_schema').notNull().default('[]'),
  ...timestamps,
});

export const installedApps = pgTable('installed_apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  appId: uuid('app_id')
    .notNull()
    .references(() => marketplaceApps.id),
  boardId: uuid('board_id').references(() => boards.id),
  config: jsonb('config').notNull().default('{}'),
  isEnabled: boolean('is_enabled').notNull().default(true),
  ...timestamps,
});

// ─── Mobile Push Devices ─────────────────────────────────────────────────────
export const pushDevices = pgTable('push_devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  platform: varchar('platform', { length: 20 }).notNull().default('ios'),
  token: varchar('token', { length: 512 }).notNull().unique(),
  deviceName: varchar('device_name', { length: 255 }),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});
