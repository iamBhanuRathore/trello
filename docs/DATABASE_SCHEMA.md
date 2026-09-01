# DATABASE_SCHEMA.md — Boardly Drizzle ORM Schema Reference

Canonical schema definitions for every table in the system. Written in Drizzle ORM syntax (PostgreSQL dialect).
When adding a new table or column, update this file first, then write the Drizzle migration via `drizzle-kit generate`.

**Rules:**
- All primary keys are UUIDs (`uuid` type, default `gen_random_uuid()`).
- All tables have `created_at` and `updated_at` timestamps.
- All tables have `deleted_at` (nullable) for soft deletes — never hard-delete rows.
- Every tenant-scoped table has `organization_id` — no exceptions.
- Use `organization_id` + Postgres Row-Level Security; see `Agents.md` §5 and `project-tech-stack.md` §5.

---

## 1. Platform / Auth Layer

### `organizations`
```typescript
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),  // subdomain: acme.boardly.com
  planId: uuid('plan_id').references(() => plans.id),
  ssoEnabled: boolean('sso_enabled').notNull().default(false),
  workosOrgId: varchar('workos_org_id', { length: 255 }),     // WorkOS org ID for SSO/SCIM
  logoUrl: varchar('logo_url', { length: 2048 }),
  primaryColor: varchar('primary_color', { length: 7 }),      // hex color for white-label
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `users`
```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),    // null if SSO-only
  name: varchar('name', { length: 255 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 2048 }),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  twoFactorSecret: varchar('two_factor_secret', { length: 255 }),
  timezone: varchar('timezone', { length: 100 }).default('UTC'),
  lastLoginAt: timestamp('last_login_at'),
  deactivatedAt: timestamp('deactivated_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `organization_members`
```typescript
export const organizationMemberRoleEnum = pgEnum('org_member_role', [
  'org_owner', 'org_admin', 'billing_manager', 'workspace_admin', 'member', 'viewer'
]);

export const organizationMemberStatusEnum = pgEnum('org_member_status', [
  'active', 'invited', 'deactivated'
]);

export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: organizationMemberRoleEnum('role').notNull().default('member'),
  status: organizationMemberStatusEnum('status').notNull().default('invited'),
  invitedBy: uuid('invited_by').references(() => users.id),
  lastActiveAt: timestamp('last_active_at'),
  deactivationReason: varchar('deactivation_reason', { length: 500 }),
  deactivatedBy: uuid('deactivated_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  uniqueIndex('org_members_org_user_idx').on(t.organizationId, t.userId),
]);
```

### `invitations`
```typescript
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: organizationMemberRoleEnum('role').notNull().default('member'),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `refresh_tokens`
```typescript
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

---

## 2. Billing

### `plans`
```typescript
export const planTierEnum = pgEnum('plan_tier', ['free', 'pro', 'business', 'enterprise']);

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  tier: planTierEnum('tier').notNull(),
  stripePriceId: varchar('stripe_price_id', { length: 255 }),
  maxSeats: integer('max_seats'),         // null = unlimited
  maxWorkspaces: integer('max_workspaces'),
  maxBoards: integer('max_boards'),
  maxStorageGb: integer('max_storage_gb'),
  featureFlags: jsonb('feature_flags').default('{}'),  // per-plan feature overrides
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

### `subscriptions`
```typescript
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active', 'past_due', 'canceled', 'trialing'
]);

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id).unique(),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  status: subscriptionStatusEnum('status').notNull().default('active'),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  seatCount: integer('seat_count').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

---

## 3. RBAC

### `roles`
```typescript
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id), // null = system role
  name: varchar('name', { length: 100 }).notNull(),
  isSystemRole: boolean('is_system_role').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `permissions`
```typescript
export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 100 }).notNull().unique(),  // e.g. 'board.create'
  description: varchar('description', { length: 500 }),
});
```

### `role_permissions`
```typescript
export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id').notNull().references(() => roles.id),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id),
}, (t) => [
  primaryKey({ columns: [t.roleId, t.permissionId] }),
]);
```

---

## 4. Workspace Layer

### `workspaces`
```typescript
export const workspaceVisibilityEnum = pgEnum('workspace_visibility', ['private', 'org']);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  visibility: workspaceVisibilityEnum('visibility').notNull().default('org'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `workspace_members`
```typescript
export const workspaceMemberRoleEnum = pgEnum('workspace_member_role', [
  'admin', 'member'
]);

export const workspaceMembers = pgTable('workspace_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: workspaceMemberRoleEnum('role').notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  uniqueIndex('workspace_members_ws_user_idx').on(t.workspaceId, t.userId),
]);
```

---

## 5. Project Layer

### `projects`
```typescript
export const projectStatusEnum = pgEnum('project_status', [
  'active', 'on_hold', 'completed', 'archived'
]);

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  name: varchar('name', { length: 255 }).notNull(),
  key: varchar('key', { length: 10 }), // e.g. 'BCW', 'CFP', 'ENG'
  description: text('description'),
  status: projectStatusEnum('status').notNull().default('active'),
  taskCounter: integer('task_counter').notNull().default(0), // atomic incremental ticket counter
  startDate: date('start_date'),
  endDate: date('end_date'),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `project_members`
```typescript
export const projectMemberRoleEnum = pgEnum('project_member_role', [
  'owner', 'admin', 'member', 'viewer'
]);

export const projectMembers = pgTable('project_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: projectMemberRoleEnum('role').notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  uniqueIndex('project_members_proj_user_idx').on(t.projectId, t.userId),
]);
```

---

## 6. Board Layer

### `boards`
```typescript
export const boards = pgTable('boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  background: varchar('background', { length: 255 }),  // color hex or image URL
  isArchived: boolean('is_archived').notNull().default(false),
  isTemplate: boolean('is_template').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `board_members`
```typescript
export const boardMemberRoleEnum = pgEnum('board_member_role', [
  'admin', 'member', 'commenter', 'viewer'
]);

export const boardMembers = pgTable('board_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id').notNull().references(() => boards.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: boardMemberRoleEnum('role').notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  uniqueIndex('board_members_board_user_idx').on(t.boardId, t.userId),
]);
```

### `labels`
```typescript
export const labels = pgTable('labels', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id').notNull().references(() => boards.id),
  name: varchar('name', { length: 100 }).notNull(),
  color: varchar('color', { length: 7 }).notNull(),  // hex color
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

---

## 7. List & Card Layer

### `lists`
```typescript
export const lists = pgTable('lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id').notNull().references(() => boards.id),
  name: varchar('name', { length: 255 }).notNull(),
  position: real('position').notNull(),  // fractional indexing for drag-drop
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `cards`
```typescript
export const cards = pgTable('cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  listId: uuid('list_id').notNull().references(() => lists.id),
  parentCardId: uuid('parent_card_id'),  // self-reference for subtasks
  taskNumber: integer('task_number'),    // sequential issue number (1, 2, 3...)
  key: varchar('key', { length: 30 }),   // human-readable ticket ID (e.g. 'BCW-1', 'CFP-14')
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),      // rich text (TipTap JSON stored as text or jsonb)
  position: real('position').notNull(),  // fractional indexing
  dueDate: timestamp('due_date'),
  stageId: uuid('stage_id').references(() => stages.id),
  coverImage: varchar('cover_image', { length: 2048 }),
  storyPoints: integer('story_points'),
  estimateMinutes: integer('estimate_minutes'),
  subtasksTotal: integer('subtasks_total').notNull().default(0),
  subtasksDone: integer('subtasks_done').notNull().default(0),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

> **Note:** `parentCardId` is a self-reference. Add a FK constraint at migration time: `FOREIGN KEY (parent_card_id) REFERENCES cards(id)`. Enforce max 2-level nesting in application logic, not DB constraints.

### `card_assignees`
```typescript
export const cardAssignees = pgTable('card_assignees', {
  cardId: uuid('card_id').notNull().references(() => cards.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  assignedAt: timestamp('assigned_at').notNull().defaultNow(),
  assignedBy: uuid('assigned_by').references(() => users.id),
}, (t) => [
  primaryKey({ columns: [t.cardId, t.userId] }),
]);
```

### `card_participants`
```typescript
export const cardParticipants = pgTable('card_participants', {
  cardId: uuid('card_id').notNull().references(() => cards.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  addedAt: timestamp('added_at').notNull().defaultNow(),
  addedBy: uuid('added_by').references(() => users.id),  // null = auto-added by system
}, (t) => [
  primaryKey({ columns: [t.cardId, t.userId] }),
]);
```

### `card_watchers`
```typescript
export const cardWatchers = pgTable('card_watchers', {
  cardId: uuid('card_id').notNull().references(() => cards.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  subscribedAt: timestamp('subscribed_at').notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.cardId, t.userId] }),
]);
```

### `card_labels`
```typescript
export const cardLabels = pgTable('card_labels', {
  cardId: uuid('card_id').notNull().references(() => cards.id),
  labelId: uuid('label_id').notNull().references(() => labels.id),
}, (t) => [
  primaryKey({ columns: [t.cardId, t.labelId] }),
]);
```

---

## 8. Card Content

### `checklists`
```typescript
export const checklists = pgTable('checklists', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id').notNull().references(() => cards.id),
  title: varchar('title', { length: 255 }).notNull(),
  position: real('position').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `checklist_items`
```typescript
export const checklistItems = pgTable('checklist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  checklistId: uuid('checklist_id').notNull().references(() => checklists.id),
  text: varchar('text', { length: 1000 }).notNull(),
  isDone: boolean('is_done').notNull().default(false),
  position: real('position').notNull(),
  assignedTo: uuid('assigned_to').references(() => users.id),
  dueDate: timestamp('due_date'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `comments`
```typescript
export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id').notNull().references(() => cards.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  body: text('body').notNull(),   // markdown or TipTap JSON
  isEdited: boolean('is_edited').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `attachments`
```typescript
export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id').notNull().references(() => cards.id),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  fileName: varchar('file_name', { length: 500 }).notNull(),
  url: varchar('url', { length: 2048 }).notNull(),  // S3 object URL
  fileType: varchar('file_type', { length: 100 }),
  sizeBytes: integer('size_bytes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

---

## 9. Custom Stages

### `stage_templates`
```typescript
export const stageTemplates = pgTable('stage_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  projectId: uuid('project_id').references(() => projects.id), // null = org-wide default
  name: varchar('name', { length: 255 }).notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `stages`
```typescript
export const stageCategoryEnum = pgEnum('stage_category', [
  'not_started', 'in_progress', 'blocked', 'done'
]);

export const stages = pgTable('stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id').notNull().references(() => stageTemplates.id),
  name: varchar('name', { length: 100 }).notNull(),
  color: varchar('color', { length: 7 }).notNull(),
  position: real('position').notNull(),
  category: stageCategoryEnum('category').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

---

## 10. Sprints & Phases

### `sprints`
```typescript
export const sprintTypeEnum = pgEnum('sprint_type', [
  'weekly', 'biweekly', 'monthly', 'custom'
]);

export const sprintStatusEnum = pgEnum('sprint_status', [
  'planned', 'active', 'completed'
]);

export const sprints = pgTable('sprints', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  type: sprintTypeEnum('type').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  goal: text('goal'),
  status: sprintStatusEnum('status').notNull().default('planned'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `card_sprints`
```typescript
export const cardSprints = pgTable('card_sprints', {
  cardId: uuid('card_id').notNull().references(() => cards.id),
  sprintId: uuid('sprint_id').notNull().references(() => sprints.id),
  addedAt: timestamp('added_at').notNull().defaultNow(),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => [
  primaryKey({ columns: [t.cardId, t.sprintId] }),
]);
```

### `phases`
```typescript
export const phaseStatusEnum = pgEnum('phase_status', [
  'not_started', 'active', 'completed', 'blocked'
]);

export const phases = pgTable('phases', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  position: real('position').notNull(),
  status: phaseStatusEnum('status').notNull().default('not_started'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `card_phase`
```typescript
export const cardPhase = pgTable('card_phase', {
  cardId: uuid('card_id').notNull().references(() => cards.id),
  phaseId: uuid('phase_id').notNull().references(() => phases.id),
}, (t) => [
  primaryKey({ columns: [t.cardId, t.phaseId] }),
]);
```

---

## 11. Time Tracking

### `time_logs`
```typescript
export const timeLogs = pgTable('time_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id').notNull().references(() => cards.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  minutes: integer('minutes').notNull(),
  description: varchar('description', { length: 500 }),
  loggedDate: date('logged_date').notNull(),
  isBillable: boolean('is_billable').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

---

## 12. Notifications

### `notification_preferences`
```typescript
export const notificationChannelEnum = pgEnum('notification_channel', [
  'in_app', 'email', 'push'
]);

export const notificationFrequencyEnum = pgEnum('notification_frequency', [
  'instant', 'digest_daily', 'digest_weekly', 'off'
]);

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  eventType: varchar('event_type', { length: 100 }).notNull(),  // e.g. 'card.assigned'
  channel: notificationChannelEnum('channel').notNull(),
  frequency: notificationFrequencyEnum('frequency').notNull().default('instant'),
  quietHoursStart: integer('quiet_hours_start'),  // hour 0-23
  quietHoursEnd: integer('quiet_hours_end'),
}, (t) => [
  uniqueIndex('notif_pref_user_org_event_channel_idx').on(
    t.userId, t.organizationId, t.eventType, t.channel
  ),
]);
```

### `notifications`
```typescript
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull().default('{}'),
  isRead: boolean('is_read').notNull().default(false),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

---

## 13. Activity & Audit

### `activity_log`
```typescript
export const activityLog = pgTable('activity_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  entityType: varchar('entity_type', { length: 50 }).notNull(),  // 'card', 'board', etc.
  entityId: uuid('entity_id').notNull(),
  actorId: uuid('actor_id').references(() => users.id),  // null = system action
  action: varchar('action', { length: 100 }).notNull(),   // e.g. 'card.moved'
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

### `audit_log`
```typescript
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  actorId: uuid('actor_id').references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(),
  target: varchar('target', { length: 255 }),
  targetId: uuid('target_id'),
  metadata: jsonb('metadata').default('{}'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 500 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

---

## 14. Automations & Webhooks

### `automations`
```typescript
export const automations = pgTable('automations', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id').notNull().references(() => boards.id),
  name: varchar('name', { length: 255 }).notNull(),
  triggerJson: jsonb('trigger_json').notNull(),  // { event: 'card.moved', conditions: [...] }
  actionJson: jsonb('action_json').notNull(),    // { type: 'assign', params: {...} }
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `webhooks`
```typescript
export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  url: varchar('url', { length: 2048 }).notNull(),
  events: jsonb('events').notNull(),      // string[] of event types
  secret: varchar('secret', { length: 255 }).notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

---

## 15. Card Events (for Reporting)

### `card_events`
```typescript
// Append-only event store for analytics (cycle time, CFD, velocity)
export const cardEvents = pgTable('card_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id').notNull().references(() => cards.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  eventType: varchar('event_type', { length: 100 }).notNull(), // 'list.changed', 'stage.changed', etc.
  fromValue: varchar('from_value', { length: 255 }),
  toValue: varchar('to_value', { length: 255 }),
  actorId: uuid('actor_id').references(() => users.id),
  occurredAt: timestamp('occurred_at').notNull().defaultNow(),
});
```

---

## 15. Docs & Wiki

### `documents`
```typescript
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  content: text('content').notNull().default(''),
  authorId: uuid('author_id').notNull().references(() => users.id),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `document_cards`
```typescript
export const documentCards = pgTable(
  'document_cards',
  {
    documentId: uuid('document_id').notNull().references(() => documents.id),
    cardId: uuid('card_id').notNull().references(() => cards.id),
    linkedAt: timestamp('linked_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.cardId] })]
);
```

---

## 16. Intake Forms & SLAs

### `intake_forms`
```typescript
export const intakeForms = pgTable('intake_forms', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  boardId: uuid('board_id').notNull().references(() => boards.id),
  listId: uuid('list_id').notNull().references(() => lists.id),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  fields: jsonb('fields').notNull().default('[]'),
  isPublished: boolean('is_published').notNull().default(true),
  defaultAssigneeId: uuid('default_assignee_id').references(() => users.id),
  slaHours: integer('sla_hours'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `form_submissions`
```typescript
export const formSubmissions = pgTable('form_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  formId: uuid('form_id').notNull().references(() => intakeForms.id),
  cardId: uuid('card_id').notNull().references(() => cards.id),
  submittedByEmail: varchar('submitted_by_email', { length: 255 }),
  submittedByName: varchar('submitted_by_name', { length: 255 }),
  data: jsonb('data').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

---

## 17. Single Sign-On (SSO) & SCIM Directory Sync

### `sso_configurations`
```typescript
export const ssoConfigurations = pgTable('sso_configurations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().unique().references(() => organizations.id),
  provider: varchar('provider', { length: 50 }).notNull().default('okta'),
  domain: varchar('domain', { length: 255 }).notNull(),
  idpMetadataUrl: varchar('idp_metadata_url', { length: 2048 }),
  clientId: varchar('client_id', { length: 255 }),
  clientSecret: varchar('client_secret', { length: 255 }),
  scimEnabled: boolean('scim_enabled').notNull().default(false),
  scimToken: varchar('scim_token', { length: 255 }),
  enforceSSO: boolean('enforce_sso').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

---

## 18. Public Developer API Keys

### `api_keys`
```typescript
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 20 }).notNull(),
  keyHash: varchar('key_hash', { length: 255 }).notNull().unique(),
  scopes: jsonb('scopes').notNull().default('[]'),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

---

## 19. Marketplace Apps & Power-Ups

### `marketplace_apps`
```typescript
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
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

### `installed_apps`
```typescript
export const installedApps = pgTable('installed_apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  appId: uuid('app_id').notNull().references(() => marketplaceApps.id),
  boardId: uuid('board_id').references(() => boards.id),
  config: jsonb('config').notNull().default('{}'),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

---

## 20. Mobile Push Devices

### `push_devices`
```typescript
export const pushDevices = pgTable('push_devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  platform: varchar('platform', { length: 20 }).notNull().default('ios'),
  token: varchar('token', { length: 512 }).notNull().unique(),
  deviceName: varchar('device_name', { length: 255 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

---

## Drizzle Config Reference

```typescript
// apps/backend/drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

Migration workflow:
```bash
# Generate migration file from schema changes
bun drizzle-kit generate

# Apply migrations to the database
bun drizzle-kit migrate

# View current schema in Drizzle Studio
bun drizzle-kit studio
```
