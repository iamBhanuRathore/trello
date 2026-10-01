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
  bigint,
  date,
  jsonb,
  uniqueIndex,
  index,
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
export const chatChannelTypeEnum = pgEnum('chat_channel_type', [
  'direct',
  'group_private',
  'group_public',
  'task_thread',
]);
export const chatMemberRoleEnum = pgEnum('chat_member_role', ['owner', 'admin', 'member']);
export const userPresenceStatusEnum = pgEnum('user_presence_status', [
  'available',
  'busy',
  'away',
  'leave',
  'offline',
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
  // ── Default-assignee policy (Jira parity, company-configurable) ──
  allowUnassigned: boolean('allow_unassigned').notNull().default(true),
  defaultAssigneeStrategy: varchar('default_assignee_strategy', { length: 16 })
    .notNull()
    .default('unassigned'),
  defaultAssigneeId: uuid('default_assignee_id').references(() => users.id, {
    onDelete: 'set null',
  }),
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
  (t) => [
    uniqueIndex('org_members_org_user_idx').on(t.organizationId, t.userId),
    // signIn + RBAC look up membership by user first (unique above is (org,user) ordered).
    index('org_members_user_idx').on(t.userId),
  ]
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

// ─── Refresh Tokens (sliding rotation families) ───────────────────────────────
// A login creates a family; each rotation mints a child in the same family with
// expiresAt = LEAST(now + idle, absoluteExpiresAt). absoluteExpiresAt never
// extends — it forces re-login. revoked rows stay until expiry so reuse of an
// old token is still detectable; a reuse inside the grace window (graceUses <
// cap, UA match) mints a sibling child instead of burning the family (covers
// 2-tab / StrictMode races). Real reuse burns only that family.
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    familyId: uuid('family_id').notNull(),
    parentHash: varchar('parent_hash', { length: 255 }),
    replacedByHash: varchar('replaced_by_hash', { length: 255 }),
    absoluteExpiresAt: timestamp('absolute_expires_at').notNull(),
    lastUsedAt: timestamp('last_used_at'),
    graceUses: integer('grace_uses').notNull().default(0),
    uaHash: varchar('ua_hash', { length: 64 }),
    ipHash: varchar('ip_hash', { length: 64 }),
  },
  (t) => [
    index('refresh_tokens_family_idx').on(t.familyId),
    index('refresh_tokens_user_idx').on(t.userId),
    index('refresh_tokens_expires_idx').on(t.expiresAt),
  ]
);

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
export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    visibility: workspaceVisibilityEnum('visibility').notNull().default('org'),
    ...timestamps,
  },
  (t) => [index('workspaces_org_idx').on(t.organizationId)]
);

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
  (t) => [
    uniqueIndex('workspace_members_ws_user_idx').on(t.workspaceId, t.userId),
    index('workspace_members_user_idx').on(t.userId),
  ]
);

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projects = pgTable(
  'projects',
  {
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
  },
  (t) => [
    index('projects_workspace_idx').on(t.workspaceId),
    index('projects_org_idx').on(t.organizationId),
  ]
);

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
  (t) => [
    uniqueIndex('project_members_proj_user_idx').on(t.projectId, t.userId),
    index('project_members_user_idx').on(t.userId),
  ]
);

// ─── Boards ───────────────────────────────────────────────────────────────────
export const boards = pgTable(
  'boards',
  {
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
  },
  (t) => [index('boards_project_idx').on(t.projectId), index('boards_org_idx').on(t.organizationId)]
);

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
  (t) => [
    uniqueIndex('board_members_board_user_idx').on(t.boardId, t.userId),
    index('board_members_user_idx').on(t.userId),
  ]
);

export const labels = pgTable(
  'labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id),
    name: varchar('name', { length: 100 }).notNull(),
    color: varchar('color', { length: 7 }).notNull(),
    ...timestamps,
  },
  (t) => [index('labels_board_idx').on(t.boardId)]
);

// ─── Lists ────────────────────────────────────────────────────────────────────
export const lists = pgTable(
  'lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id),
    name: varchar('name', { length: 255 }).notNull(),
    position: real('position').notNull(),
    isArchived: boolean('is_archived').notNull().default(false),
    // OCC guard for concurrent reorders — clients send the version they saw.
    version: integer('version').notNull().default(1),
    // Global monotonic feed cursor (shared sequence w/ cards) — see 0029.
    changeSeq: bigint('change_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('board_change_seq')`),
    ...timestamps,
  },
  (t) => [
    index('lists_board_idx').on(t.boardId),
    index('lists_change_seq_idx').on(t.changeSeq),
    index('lists_board_updated_idx').on(t.boardId, t.updatedAt),
  ]
);

// ─── Custom Stages ────────────────────────────────────────────────────────────
export const stageTemplates = pgTable(
  'stage_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: uuid('project_id').references(() => projects.id),
    name: varchar('name', { length: 255 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('stage_templates_org_idx').on(t.organizationId),
    index('stage_templates_project_idx').on(t.projectId),
  ]
);

export const stages = pgTable(
  'stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => stageTemplates.id),
    name: varchar('name', { length: 100 }).notNull(),
    color: varchar('color', { length: 7 }).notNull(),
    position: real('position').notNull(),
    category: stageCategoryEnum('category').notNull(),
    ...timestamps,
  },
  (t) => [index('stages_template_idx').on(t.templateId)]
);

// ─── Cards ────────────────────────────────────────────────────────────────────
export const cards = pgTable(
  'cards',
  {
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
    scheduledStart: timestamp('scheduled_start'),
    scheduledEnd: timestamp('scheduled_end'),
    stageId: uuid('stage_id').references(() => stages.id),
    priorityId: uuid('priority_id').references(() => priorities.id, { onDelete: 'set null' }),
    coverImage: varchar('cover_image', { length: 2048 }),
    storyPoints: integer('story_points'),
    estimateMinutes: integer('estimate_minutes'),
    subtasksTotal: integer('subtasks_total').notNull().default(0),
    subtasksDone: integer('subtasks_done').notNull().default(0),
    isArchived: boolean('is_archived').notNull().default(false),
    isPrivate: boolean('is_private').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    // Project automation provenance: which (rule, action) created this subtask.
    // Nullable + backward-compatible; the bounce guard lives in a partial unique
    // index below so duplication is physically impossible (no check-then-insert race).
    sourceRuleId: uuid('source_rule_id'),
    sourceActionId: uuid('source_action_id'),
    // OCC guard for concurrent moves — clients send the version they saw.
    version: integer('version').notNull().default(1),
    // Global monotonic feed cursor (shared sequence w/ lists) — see 0029.
    changeSeq: bigint('change_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('board_change_seq')`),
    ...timestamps,
  },
  (t) => [
    // listCards WHERE list_id + archived + sort by position (hottest query).
    index('cards_change_seq_idx').on(t.changeSeq),
    index('cards_list_idx').on(t.listId),
    index('cards_org_idx').on(t.organizationId),
    index('cards_parent_idx').on(t.parentCardId),
    index('cards_stage_idx').on(t.stageId),
    index('cards_priority_idx').on(t.priorityId),
    index('cards_scheduled_idx').on(t.scheduledStart, t.scheduledEnd),
    // changes-feed gap-fill: rows touched since a cursor, per list.
    index('cards_list_updated_idx').on(t.listId, t.updatedAt),
    // Board payload order within an active list (5.3).
    index('cards_list_position_active_idx')
      .on(t.listId, t.position)
      .where(sql`is_archived = false AND deleted_at IS NULL`),
    // Automation bounce guard: one open subtask per (parent, rule, action).
    // Partial so ordinary cards (NULL source) are unaffected; the loser of a
    // same-millisecond race gets 23505, recorded as an OPEN_SUBTASK skip.
    uniqueIndex('cards_automation_bounce_idx')
      .on(t.parentCardId, t.sourceRuleId, t.sourceActionId)
      .where(
        sql`parent_card_id IS NOT NULL AND source_rule_id IS NOT NULL AND source_action_id IS NOT NULL AND is_archived = false AND deleted_at IS NULL`
      ),
  ]
);

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
  (t) => [
    primaryKey({ columns: [t.cardId, t.userId] }),
    // getMyTasks looks up by user.
    index('card_assignees_user_idx').on(t.userId),
    index('card_assignees_assigned_by_idx').on(t.assignedBy),
  ]
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
  (t) => [
    primaryKey({ columns: [t.cardId, t.userId] }),
    index('card_participants_user_idx').on(t.userId),
  ]
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
  (t) => [
    primaryKey({ columns: [t.cardId, t.userId] }),
    index('card_watchers_user_idx').on(t.userId),
  ]
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
  (t) => [
    primaryKey({ columns: [t.cardId, t.labelId] }),
    index('card_labels_label_idx').on(t.labelId),
  ]
);

// ─── Card Content ─────────────────────────────────────────────────────────────
export const checklists = pgTable(
  'checklists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id),
    title: varchar('title', { length: 255 }).notNull(),
    position: real('position').notNull(),
    ...timestamps,
  },
  (t) => [index('checklists_card_idx').on(t.cardId)]
);

export const checklistItems = pgTable(
  'checklist_items',
  {
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
  },
  (t) => [index('checklist_items_checklist_idx').on(t.checklistId)]
);

export const comments = pgTable(
  'comments',
  {
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
  },
  (t) => [index('comments_card_idx').on(t.cardId), index('comments_user_idx').on(t.userId)]
);

export const attachments = pgTable(
  'attachments',
  {
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
    // 5.5 scan gate (migration 0035). Fail-closed: servable only when
    // status=ready AND scan_status=clean (or skipped in non-prod SCAN_MODE=disabled).
    status: varchar('status', { length: 16 }).notNull().default('staged'),
    scanStatus: varchar('scan_status', { length: 16 }).notNull().default('pending'),
    scanAttempts: integer('scan_attempts').notNull().default(0),
    scannedAt: timestamp('scanned_at'),
    checksumSha256: varchar('checksum_sha256', { length: 64 }),
    declaredMime: varchar('declared_mime', { length: 100 }),
    storageKey: text('storage_key'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    index('attachments_card_idx').on(t.cardId),
    index('attachments_status_created_idx').on(t.status, t.createdAt),
  ]
);

// ─── Sprints & Phases ─────────────────────────────────────────────────────────
export const sprints = pgTable(
  'sprints',
  {
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
  },
  (t) => [index('sprints_project_idx').on(t.projectId)]
);

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
  (t) => [
    primaryKey({ columns: [t.cardId, t.sprintId] }),
    // listSprintCards filters on sprint_id (2nd PK col) — PK unusable there.
    index('card_sprints_sprint_idx').on(t.sprintId),
  ]
);

export const phases = pgTable(
  'phases',
  {
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
  },
  (t) => [index('phases_project_idx').on(t.projectId)]
);

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
  (t) => [
    primaryKey({ columns: [t.cardId, t.phaseId] }),
    index('card_phase_phase_idx').on(t.phaseId),
  ]
);

// ─── Time Tracking ────────────────────────────────────────────────────────────
export const timeLogs = pgTable(
  'time_logs',
  {
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
  },
  (t) => [index('time_logs_card_idx').on(t.cardId), index('time_logs_user_idx').on(t.userId)]
);

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

export const notifications = pgTable(
  'notifications',
  {
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
    isStarred: boolean('is_starred').notNull().default(false),
    archivedAt: timestamp('archived_at'),
    searchText: text('search_text').notNull().default(''),
    // 4.6a federated inbox: per-user snooze + origin facet (notification|dm|task|git).
    snoozedUntil: timestamp('snoozed_until'),
    source: varchar('source', { length: 16 }).notNull().default('notification'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_org_created_idx').on(t.userId, t.organizationId, t.createdAt),
    index('notifications_inbox_idx')
      .on(t.userId, t.organizationId, t.createdAt, t.id)
      .where(sql`${t.archivedAt} IS NULL`),
    index('notifications_unread_idx')
      .on(t.userId, t.organizationId)
      .where(sql`${t.isRead} = false AND ${t.archivedAt} IS NULL`),
    index('notifications_snooze_idx')
      .on(t.userId, t.snoozedUntil)
      .where(sql`${t.snoozedUntil} IS NOT NULL`),
  ]
);

// ─── Federated inbox triage state (4.6a) ─────────────────────────────────────
// DMs/tasks/git have no per-user row to store snooze/dismiss, so watermarks
// live here: snooze hides until snoozed_until; dismiss hides up to dismissed_at
// (DM = watermark over message time, task = dismiss-only, git = dismiss until
// the link's updated_at moves past dismissed_at).
export const inboxItemState = pgTable(
  'inbox_item_state',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    source: varchar('source', { length: 16 }).notNull(),
    refId: text('ref_id').notNull(),
    snoozedUntil: timestamp('snoozed_until'),
    dismissedAt: timestamp('dismissed_at'),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.source, t.refId] }),
    index('inbox_item_state_user_idx').on(t.userId),
  ]
);

// ─── Inbound email (4.6b): capability tokens + receive log ───────────────────
export const inboundEmailTokens = pgTable(
  'inbound_email_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    scope: varchar('scope', { length: 16 }).notNull(),
    refId: uuid('ref_id').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    tokenPrefix: varchar('token_prefix', { length: 16 }).notNull(),
    allowlist: text('allowlist'),
    expiresAt: timestamp('expires_at'),
    revokedAt: timestamp('revoked_at'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('inbound_token_hash_idx').on(t.tokenHash),
    index('inbound_token_scope_idx').on(t.organizationId, t.scope, t.refId),
  ]
);

export const inboundEmails = pgTable(
  'inbound_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: varchar('message_id', { length: 1024 }).notNull(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    tokenId: uuid('token_id').references(() => inboundEmailTokens.id),
    fromAddress: varchar('from_address', { length: 320 }),
    toAddress: varchar('to_address', { length: 320 }),
    subject: varchar('subject', { length: 500 }),
    status: varchar('status', { length: 16 }).notNull().default('received'),
    result: jsonb('result').notNull().default('{}'),
    rawEmail: text('raw_email'),
    rawTruncated: boolean('raw_truncated').notNull().default(false),
    failedAt: timestamp('failed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('inbound_emails_message_idx').on(t.organizationId, t.messageId)]
);

// ─── Activity & Audit ─────────────────────────────────────────────────────────
export const activityLog = pgTable(
  'activity_log',
  {
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
  },
  (t) => [
    index('activity_log_org_created_idx').on(t.organizationId, t.createdAt),
    index('activity_log_entity_idx').on(t.entityType, t.entityId, t.createdAt),
    index('activity_log_created_idx').on(t.createdAt),
  ]
);

export const auditLog = pgTable(
  'audit_log',
  {
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
  },
  (t) => [
    // Every audit page used to seq-scan twice (rows + count) — PK-only table.
    index('audit_log_org_created_idx').on(t.organizationId, t.createdAt),
    index('audit_log_org_action_created_idx').on(t.organizationId, t.action, t.createdAt),
    index('audit_log_org_target_created_idx')
      .on(t.organizationId, t.target, t.createdAt)
      .where(sql`"target" IS NOT NULL`),
    index('audit_log_created_idx').on(t.createdAt),
  ]
);

// ─── Automations & Webhooks ───────────────────────────────────────────────────
export const automations = pgTable(
  'automations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id),
    name: varchar('name', { length: 255 }).notNull(),
    triggerJson: jsonb('trigger_json').notNull(),
    actionJson: jsonb('action_json').notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('automations_board_idx').on(t.boardId)]
);

// ─── Search ───────────────────────────────────────────────────────────────────
export const savedSearches = pgTable(
  'saved_searches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    name: varchar('name', { length: 255 }).notNull(),
    query: text('query').notNull(),
    filters: jsonb('filters'), // e.g. { type: 'card', status: 'active' }
    ...timestamps,
  },
  (t) => [index('saved_searches_user_idx').on(t.userId)]
);

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
export const cardEvents = pgTable(
  'card_events',
  {
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
  },
  (t) => [
    index('card_events_card_idx').on(t.cardId),
    index('card_events_org_idx').on(t.organizationId),
  ]
);

// ─── RBAC ─────────────────────────────────────────────────────────────────────
export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id),
    name: varchar('name', { length: 100 }).notNull(),
    description: varchar('description', { length: 500 }),
    isSystemRole: boolean('is_system_role').notNull().default(false),
    isDefault: boolean('is_default').notNull().default(false),
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
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionId] }),
    // RBAC check joins permission_id — PK leads with role_id.
    index('role_permissions_permission_idx').on(t.permissionId),
  ]
);

// ─── Team Role Membership (company-configurable roles per member) ────────────
// A member can hold several team roles (Lead + Developer). Kept additive: the
// legacy organizationMembers.role enum tier is untouched.
export const organizationRoleMembers = pgTable(
  'organization_role_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('org_role_member_unique_idx').on(t.organizationId, t.roleId, t.userId),
    index('org_role_member_role_idx').on(t.roleId),
    index('org_role_member_user_idx').on(t.organizationId, t.userId),
  ]
);

// ─── Components (board-scoped workstreams, Jira parity) ──────────────────────
// Components group cards (frontend, backend, api) and carry a lead used as the
// most-specific default-assignee source when no explicit rule exists.
export const components = pgTable(
  'components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    description: varchar('description', { length: 500 }),
    leadUserId: uuid('lead_user_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('component_board_name_idx').on(t.boardId, t.name),
    index('component_org_idx').on(t.organizationId),
    index('component_board_idx').on(t.boardId),
  ]
);

export const cardComponents = pgTable(
  'card_components',
  {
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id')
      .notNull()
      .references(() => components.id, { onDelete: 'cascade' }),
    addedBy: uuid('added_by').references(() => users.id, { onDelete: 'set null' }),
    addedAt: timestamp('added_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.componentId] }),
    index('card_components_component_idx').on(t.componentId),
  ]
);

// ─── Assignment Rules (static default-assignee policy) ───────────────────────
// One optional row per scope level; most-specific scope wins
// (component > board > project > org). A rule points at either a team role
// (resolved to that scope's lead holder) or a static user.
export const assignmentRules = pgTable(
  'assignment_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    boardId: uuid('board_id').references(() => boards.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id').references(() => components.id, { onDelete: 'cascade' }),
    defaultRoleId: uuid('default_role_id').references(() => roles.id, { onDelete: 'set null' }),
    defaultUserId: uuid('default_user_id').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('assignment_rules_org_idx').on(t.organizationId),
    index('assignment_rules_project_idx').on(t.projectId),
    index('assignment_rules_board_idx').on(t.boardId),
    index('assignment_rules_component_idx').on(t.componentId),
  ]
);

// ─── Card Views ("Viewed by") ───────────────────────────────────────────────
export const cardViews = pgTable(
  'card_views',
  {
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    viewedAt: timestamp('viewed_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.userId] }),
    index('card_views_card_idx').on(t.cardId, t.viewedAt),
  ]
);

// ─── Card Access Requests (private-task join flow) ──────────────────────────
export const cardAccessRequests = pgTable(
  'card_access_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('card_access_request_unique_idx').on(t.cardId, t.userId)]
);

// ─── Card Priorities (org-scoped, configurable w/ colors) ────────────────────
export const priorities = pgTable(
  'priorities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 60 }).notNull(),
    color: varchar('color', { length: 16 }).notNull().default('#64748b'),
    rank: integer('rank').notNull().default(0),
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('org_priority_name_idx').on(t.organizationId, t.name),
    index('priorities_org_idx').on(t.organizationId),
  ]
);

// ─── Docs & Wiki ─────────────────────────────────────────────────────────────
export const documents = pgTable(
  'documents',
  {
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
  },
  (t) => [index('documents_project_idx').on(t.projectId)]
);

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
  (t) => [
    primaryKey({ columns: [t.documentId, t.cardId] }),
    index('document_cards_card_idx').on(t.cardId),
  ]
);

// ─── Intake Forms & SLAs ─────────────────────────────────────────────────────
export const intakeForms = pgTable(
  'intake_forms',
  {
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
  },
  (t) => [
    index('intake_forms_board_idx').on(t.boardId),
    index('intake_forms_org_idx').on(t.organizationId),
  ]
);

export const formSubmissions = pgTable(
  'form_submissions',
  {
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
  },
  (t) => [
    index('form_submissions_form_idx').on(t.formId),
    index('form_submissions_card_idx').on(t.cardId),
  ]
);

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
export const pushDevices = pgTable(
  'push_devices',
  {
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
  },
  (t) => [index('push_devices_user_idx').on(t.userId)]
);

// ─── Enterprise Chat: Channels ────────────────────────────────────────────────
export const chatChannels = pgTable(
  'chat_channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    type: chatChannelTypeEnum('type').notNull().default('direct'),
    name: varchar('name', { length: 255 }),
    topic: text('topic'),
    avatarUrl: varchar('avatar_url', { length: 2048 }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    isArchived: boolean('is_archived').notNull().default(false),
    isAnnouncementOnly: boolean('is_announcement_only').notNull().default(false),
    allowMemberInvites: boolean('allow_member_invites').notNull().default(true),
    cardId: uuid('card_id').references(() => cards.id),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    lastMessageAt: timestamp('last_message_at').notNull().defaultNow(),
    lastMessagePreview: text('last_message_preview'),
    ...timestamps,
  },
  (t) => [
    index('chat_channels_org_idx').on(t.organizationId),
    index('chat_channels_card_idx').on(t.cardId),
    index('chat_channels_project_idx').on(t.projectId),
    index('chat_channels_last_msg_idx').on(t.lastMessageAt),
  ]
);

// ─── Enterprise Chat: Channel Members ─────────────────────────────────────────
export const chatChannelMembers = pgTable(
  'chat_channel_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => chatChannels.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: chatMemberRoleEnum('role').notNull().default('member'),
    lastReadAt: timestamp('last_read_at').notNull().defaultNow(),
    isMuted: boolean('is_muted').notNull().default(false),
    isPinned: boolean('is_pinned').notNull().default(false),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chat_members_channel_user_idx').on(t.channelId, t.userId),
    index('chat_members_user_idx').on(t.userId),
    index('chat_members_channel_idx').on(t.channelId),
  ]
);

// ─── Enterprise Chat: Messages ────────────────────────────────────────────────
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => chatChannels.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    parentMessageId: uuid('parent_message_id'),
    replyToMessageId: uuid('reply_to_message_id'),
    isEdited: boolean('is_edited').notNull().default(false),
    isSystem: boolean('is_system').notNull().default(false),
    isAnnouncement: boolean('is_announcement').notNull().default(false),
    // Telegram parity: pinned messages + forwarded provenance
    isPinned: boolean('is_pinned').notNull().default(false),
    pinnedAt: timestamp('pinned_at'),
    pinnedBy: uuid('pinned_by').references(() => users.id),
    forwardedFromId: uuid('forwarded_from_id'),
    deletedBy: uuid('deleted_by').references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index('chat_messages_channel_idx').on(t.channelId),
    index('chat_messages_parent_idx').on(t.parentMessageId),
    index('chat_messages_reply_to_idx').on(t.replyToMessageId),
    index('chat_messages_created_idx').on(t.createdAt),
    index('chat_messages_pinned_idx').on(t.channelId, t.isPinned),
    // Feed: channel + top-level + not-deleted, newest first (5.3).
    index('chat_messages_channel_created_idx').on(t.channelId, t.createdAt),
    index('chat_messages_parent_created_idx').on(t.parentMessageId, t.createdAt),
  ]
);

// ─── Enterprise Chat: Attachments ─────────────────────────────────────────────
export const chatAttachments = pgTable(
  'chat_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id').references(() => chatMessages.id),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => chatChannels.id, { onDelete: 'cascade' }),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    fileName: varchar('file_name', { length: 500 }).notNull(),
    fileUrl: varchar('file_url', { length: 2048 }).notNull(),
    fileSize: integer('file_size').notNull().default(0),
    fileType: varchar('file_type', { length: 100 }).notNull().default('application/octet-stream'),
    // 5.5 scan gate (migration 0035) — same lifecycle as card attachments.
    status: varchar('status', { length: 16 }).notNull().default('staged'),
    scanStatus: varchar('scan_status', { length: 16 }).notNull().default('pending'),
    scanAttempts: integer('scan_attempts').notNull().default(0),
    scannedAt: timestamp('scanned_at'),
    checksumSha256: varchar('checksum_sha256', { length: 64 }),
    declaredMime: varchar('declared_mime', { length: 100 }),
    storageKey: text('storage_key'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('chat_attachments_msg_idx').on(t.messageId),
    index('chat_attachments_channel_idx').on(t.channelId),
    index('chat_attachments_status_created_idx').on(t.status, t.createdAt),
  ]
);

// ─── Enterprise Chat: Reactions ───────────────────────────────────────────────
export const chatReactions = pgTable(
  'chat_reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => chatMessages.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    emoji: varchar('emoji', { length: 64 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chat_reactions_msg_user_emoji_idx').on(t.messageId, t.userId, t.emoji),
    index('chat_reactions_msg_idx').on(t.messageId),
  ]
);

// ─── Calendar: per-user provider connections (Google Calendar sync) ──────────
// Tokens are personal (OAuth consent is per Google account), so connections are
// user-scoped — unlike the org-scoped `integrations` mock catalog.
export const calendarConnections = pgTable(
  'calendar_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    provider: varchar('provider', { length: 32 }).notNull().default('google'),
    googleSub: varchar('google_sub', { length: 255 }),
    email: varchar('email', { length: 320 }),
    refreshToken: text('refresh_token').notNull(),
    scope: text('scope'),
    calendarId: varchar('calendar_id', { length: 255 }).notNull().default('primary'),
    syncToken: text('sync_token'),
    lastSyncAt: timestamp('last_sync_at'),
    lastError: text('last_error'),
    ...timestamps,
  },
  (t) => [uniqueIndex('calendar_conn_user_provider_idx').on(t.userId, t.provider)]
);

// ─── Calendar: Boardly card ↔ provider event links (push tracking) ───────────
export const calendarEventLinks = pgTable(
  'calendar_event_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => calendarConnections.id),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id),
    providerEventId: varchar('provider_event_id', { length: 512 }).notNull(),
    providerCalendarId: varchar('provider_calendar_id', { length: 255 })
      .notNull()
      .default('primary'),
    htmlUrl: varchar('html_url', { length: 2048 }),
    lastPushedAt: timestamp('last_pushed_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('calendar_link_card_conn_idx').on(t.cardId, t.connectionId)]
);

// ─── Git automations: linked repos + card ↔ branch/commit/PR links ───────────
// Webhook-driven (no GitHub API dependency): payloads carry all link data.
// Secrets reuse the AES-GCM token crypto convention (see calendar/google.ts).
export const gitRepositories = pgTable(
  'git_repositories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    provider: varchar('provider', { length: 16 }).notNull().default('github'),
    owner: varchar('owner', { length: 255 }).notNull(),
    repo: varchar('repo', { length: 255 }).notNull(),
    webhookSecret: text('webhook_secret').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    lastEventAt: timestamp('last_event_at'),
    lastError: text('last_error'),
    ...timestamps,
  },
  (t) => [uniqueIndex('git_repos_owner_repo_idx').on(t.organizationId, t.owner, t.repo)]
);

export const gitLinks = pgTable(
  'git_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => gitRepositories.id),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id),
    kind: varchar('kind', { length: 16 }).notNull(),
    ref: varchar('ref', { length: 512 }).notNull(),
    url: varchar('url', { length: 2048 }),
    title: varchar('title', { length: 500 }),
    state: varchar('state', { length: 32 }).notNull().default('open'),
    author: varchar('author', { length: 255 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('git_links_card_ref_idx').on(t.cardId, t.kind, t.ref),
    index('git_links_repo_idx').on(t.repositoryId),
  ]
);

// ─── User Working Hours ───────────────────────────────────────────────────────
export const userWorkingHours = pgTable('user_working_hours', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  timezone: varchar('timezone', { length: 100 }).notNull().default('UTC'),
  schedule: jsonb('schedule').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── User Presence Overrides ──────────────────────────────────────────────────
export const userPresenceOverrides = pgTable('user_presence_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  status: userPresenceStatusEnum('status').notNull().default('available'),
  customStatusText: varchar('custom_status_text', { length: 255 }),
  expiresAt: timestamp('expires_at'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Project Automation Engine (project-scoped WHEN/IF/THEN rules) ──────────
// One configuration point per project that behaves differently per project.
// The legacy board-scoped `automations` table is untouched (backward compat).
export const projectAutomationRules = pgTable(
  'project_automation_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    schemaVersion: integer('schema_version').notNull().default(1),
    triggerJson: jsonb('trigger_json').notNull(),
    conditionJson: jsonb('condition_json').notNull().default('{}'),
    actionJson: jsonb('action_json').notNull().default('[]'),
    // Set when a referenced role/user/list is deleted — broken rules announce
    // themselves instead of silently dying.
    needsAttention: boolean('needs_attention').notNull().default(false),
    attentionReason: text('attention_reason'),
    // Execution health for the rule list (enable toggle / last-run / count).
    lastExecutedAt: timestamp('last_executed_at'),
    executionCount: integer('execution_count').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('project_auto_rules_org_idx').on(t.organizationId),
    index('project_auto_rules_project_idx').on(t.projectId),
    // Event matching is one indexed lookup over enabled rules of the project.
    index('project_auto_rules_enabled_idx')
      .on(t.projectId)
      .where(sql`is_enabled = true`),
  ]
);

// Round-robin position per (rule, action) — NOT per rule: a rule can hold two
// pool actions (test subtask + review subtask) and a single cursor column
// would make them steal each other's turn.
export const automationRuleCursors = pgTable(
  'automation_rule_cursors',
  {
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => projectAutomationRules.id, { onDelete: 'cascade' }),
    actionId: uuid('action_id').notNull(),
    position: integer('position').notNull().default(0),
    lastUserId: uuid('last_user_id').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ruleId, t.actionId] })]
);

// Audit log (Jira pattern): EVERY execution including skips with reason codes,
// so "why didn't my rule fire?" is answerable from day one.
export const automationRuleRuns = pgTable(
  'automation_rule_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => projectAutomationRules.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id').references(() => cards.id, { onDelete: 'set null' }),
    // Redelivery idempotency: the originating card event's id.
    eventId: varchar('event_id', { length: 100 }),
    status: varchar('status', { length: 16 }).notNull().default('executed'),
    reason: varchar('reason', { length: 32 }),
    details: jsonb('details').notNull().default('{}'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('auto_runs_rule_created_idx').on(t.ruleId, t.createdAt),
    index('auto_runs_project_created_idx').on(t.projectId, t.createdAt),
    // Same event redelivered to the same rule → second is a DUPLICATE_EVENT skip.
    uniqueIndex('auto_runs_rule_event_idx').on(t.ruleId, t.eventId),
  ]
);
