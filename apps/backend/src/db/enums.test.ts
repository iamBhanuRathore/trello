import { describe, it, expect } from 'bun:test';
import {
  PlanTier,
  SubscriptionStatus,
  OrgMemberRole,
  OrgMemberStatus,
  WorkspaceMemberRole,
  WorkspaceVisibility,
  ProjectMemberRole,
  ProjectStatus,
  BoardMemberRole,
  StageCategory,
  SprintType,
  SprintStatus,
  PhaseStatus,
  NotificationChannel,
  NotificationFrequency,
} from '@boardly/shared-types';
import {
  planTierEnum,
  subscriptionStatusEnum,
  orgMemberRoleEnum,
  orgMemberStatusEnum,
  workspaceMemberRoleEnum,
  workspaceVisibilityEnum,
  projectMemberRoleEnum,
  projectStatusEnum,
  boardMemberRoleEnum,
  stageCategoryEnum,
  sprintTypeEnum,
  sprintStatusEnum,
  phaseStatusEnum,
  notificationChannelEnum,
  notificationFrequencyEnum,
} from './schema/index';

// Guards the documented invariant in packages/shared-types/src/enums/index.ts:
// shared const objects must mirror the Drizzle pgEnum value sets exactly.
// DB-free (imports schema definitions only — no connections).
describe('Shared enums mirror Drizzle pgEnums', () => {
  const cases: [string, Record<string, string>, { enumValues: readonly string[] }][] = [
    ['PlanTier', PlanTier, planTierEnum],
    ['SubscriptionStatus', SubscriptionStatus, subscriptionStatusEnum],
    ['OrgMemberRole', OrgMemberRole, orgMemberRoleEnum],
    ['OrgMemberStatus', OrgMemberStatus, orgMemberStatusEnum],
    ['WorkspaceMemberRole', WorkspaceMemberRole, workspaceMemberRoleEnum],
    ['WorkspaceVisibility', WorkspaceVisibility, workspaceVisibilityEnum],
    ['ProjectMemberRole', ProjectMemberRole, projectMemberRoleEnum],
    ['ProjectStatus', ProjectStatus, projectStatusEnum],
    ['BoardMemberRole', BoardMemberRole, boardMemberRoleEnum],
    ['StageCategory', StageCategory, stageCategoryEnum],
    ['SprintType', SprintType, sprintTypeEnum],
    ['SprintStatus', SprintStatus, sprintStatusEnum],
    ['PhaseStatus', PhaseStatus, phaseStatusEnum],
    ['NotificationChannel', NotificationChannel, notificationChannelEnum],
    ['NotificationFrequency', NotificationFrequency, notificationFrequencyEnum],
  ];

  for (const [name, shared, pg] of cases) {
    it(`${name} matches pgEnum values`, () => {
      expect([...Object.values(shared)].sort()).toEqual([...pg.enumValues].sort());
    });
  }
});
