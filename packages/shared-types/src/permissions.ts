/**
 * Permission keys registry — all RBAC permission keys used in requirePermission() and usePermission().
 * See PERMISSIONS_MATRIX.md for the full role → permission mapping.
 *
 * Rule: Never invent a permission key inline. Add it here first, then to seed data.
 */

// ─── Platform (Super Admin only) ─────────────────────────────────────────────
export const PLATFORM_PERMISSIONS = {
  MANAGE: 'platform.manage',
  IMPERSONATE_ORG: 'org.impersonate',
  CREATE_ORG: 'org.create',
  DELETE_ANY_ORG: 'org.delete',
  MANAGE_FEATURE_FLAGS: 'feature_flag.manage',
  MANAGE_PLANS: 'plan.manage',
  READ_AUDIT_LOG: 'platform.audit_log.read',
  READ_HEALTH: 'platform.health.read',
  MANAGE_RATE_LIMITS: 'rate_limit.manage',
} as const;

// ─── Organization ────────────────────────────────────────────────────────────
export const ORG_PERMISSIONS = {
  READ: 'org.read',
  UPDATE: 'org.update',
  DELETE: 'org.delete',
  TRANSFER_OWNERSHIP: 'org.transfer_ownership',
  INVITE_MEMBER: 'member.invite',
  REMOVE_MEMBER: 'member.remove',
  UPDATE_MEMBER_ROLE: 'member.role.update',
  DEACTIVATE_MEMBER: 'member.deactivate',
  READ_BILLING: 'billing.read',
  MANAGE_BILLING: 'billing.manage',
  CONFIGURE_SSO: 'sso.configure',
  MANAGE_SECURITY_POLICY: 'security_policy.manage',
  MANAGE_BRANDING: 'branding.manage',
  MANAGE_INTEGRATIONS: 'integration.manage',
  MANAGE_WEBHOOKS: 'webhook.manage',
  READ_AUDIT_LOG: 'audit_log.read',
  EXPORT_AUDIT_LOG: 'audit_log.export',
  EXPORT_DATA: 'data.export',
  MANAGE_CUSTOM_ROLES: 'custom_role.manage',
  MANAGE_STAGE_TEMPLATES: 'stage_template.manage',
} as const;

// ─── Workspace ───────────────────────────────────────────────────────────────
export const WORKSPACE_PERMISSIONS = {
  CREATE: 'workspace.create',
  READ: 'workspace.read',
  UPDATE: 'workspace.update',
  DELETE: 'workspace.delete',
  INVITE_MEMBER: 'workspace.member.invite',
  REMOVE_MEMBER: 'workspace.member.remove',
  UPDATE_MEMBER_ROLE: 'workspace.member.role.update',
} as const;

// ─── Project ─────────────────────────────────────────────────────────────────
export const PROJECT_PERMISSIONS = {
  CREATE: 'project.create',
  READ: 'project.read',
  UPDATE: 'project.update',
  DELETE: 'project.delete',
  ARCHIVE: 'project.archive',
  INVITE_MEMBER: 'project.member.invite',
  REMOVE_MEMBER: 'project.member.remove',
  UPDATE_MEMBER_ROLE: 'project.member.role.update',
  CREATE_SPRINT: 'sprint.create',
  UPDATE_SPRINT: 'sprint.update',
  DELETE_SPRINT: 'sprint.delete',
  CREATE_PHASE: 'phase.create',
  UPDATE_PHASE: 'phase.update',
  DELETE_PHASE: 'phase.delete',
  SIGN_OFF_PHASE: 'phase.sign_off',
  READ_REPORTS: 'project.report.read',
  EXPORT: 'project.export',
  MANAGE_AUTOMATIONS: 'automation.manage',
} as const;

// ─── Board ───────────────────────────────────────────────────────────────────
export const BOARD_PERMISSIONS = {
  CREATE: 'board.create',
  READ: 'board.read',
  UPDATE: 'board.update',
  DELETE: 'board.delete',
  ARCHIVE: 'board.archive',
  INVITE_MEMBER: 'board.member.invite',
  REMOVE_MEMBER: 'board.member.remove',
  UPDATE_MEMBER_ROLE: 'board.member.role.update',
  SAVE_AS_TEMPLATE: 'board.template.save',
  CREATE_LABEL: 'label.create',
  UPDATE_LABEL: 'label.update',
  DELETE_LABEL: 'label.delete',
  CREATE_LIST: 'list.create',
  UPDATE_LIST: 'list.update',
  DELETE_LIST: 'list.delete',
  ARCHIVE_LIST: 'list.archive',
} as const;

// ─── Card ────────────────────────────────────────────────────────────────────
export const CARD_PERMISSIONS = {
  CREATE: 'card.create',
  READ: 'card.read',
  UPDATE: 'card.update',
  DELETE: 'card.delete',
  ARCHIVE: 'card.archive',
  MOVE: 'card.move',
  ASSIGN: 'card.assign',
  WATCH: 'card.watch',
  ADD_LABEL: 'card.label.add',
  REMOVE_LABEL: 'card.label.remove',
  SET_DUE_DATE: 'card.due_date.set',
  UPDATE_STAGE: 'card.stage.update',
  ASSIGN_SPRINT: 'card.sprint.assign',
  CREATE_SUBTASK: 'card.subtask.create',
  CREATE_CHECKLIST: 'card.checklist.create',
  UPDATE_CHECKLIST: 'card.checklist.update',
  DELETE_CHECKLIST: 'card.checklist.delete',
  ADD_ATTACHMENT: 'card.attachment.add',
  DELETE_ATTACHMENT: 'card.attachment.delete',
  CREATE_COMMENT: 'card.comment.create',
  UPDATE_COMMENT: 'card.comment.update',
  DELETE_COMMENT: 'card.comment.delete',
  CREATE_TIME_LOG: 'card.time_log.create',
  UPDATE_TIME_LOG: 'card.time_log.update',
  DELETE_TIME_LOG: 'card.time_log.delete',
  UPDATE_CUSTOM_FIELD: 'card.custom_field.update',
} as const;

// ─── Combined type for use in requirePermission() / usePermission() ──────────
export type PermissionKey =
  | (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS]
  | (typeof ORG_PERMISSIONS)[keyof typeof ORG_PERMISSIONS]
  | (typeof WORKSPACE_PERMISSIONS)[keyof typeof WORKSPACE_PERMISSIONS]
  | (typeof PROJECT_PERMISSIONS)[keyof typeof PROJECT_PERMISSIONS]
  | (typeof BOARD_PERMISSIONS)[keyof typeof BOARD_PERMISSIONS]
  | (typeof CARD_PERMISSIONS)[keyof typeof CARD_PERMISSIONS];

// All keys as a flat array — useful for seed data
export const ALL_PERMISSION_KEYS: PermissionKey[] = [
  ...Object.values(PLATFORM_PERMISSIONS),
  ...Object.values(ORG_PERMISSIONS),
  ...Object.values(WORKSPACE_PERMISSIONS),
  ...Object.values(PROJECT_PERMISSIONS),
  ...Object.values(BOARD_PERMISSIONS),
  ...Object.values(CARD_PERMISSIONS),
];
