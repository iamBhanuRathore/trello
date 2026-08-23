/**
 * Test factories — create realistic test data structures.
 * These produce plain objects (not DB records) for unit tests.
 * For DB-backed integration tests, use the seeds/ functions instead.
 *
 * All IDs are random UUIDs by default — override any field by passing partial data.
 */

import { OrgMemberRole, OrgMemberStatus, ProjectStatus, BoardMemberRole } from '@boardly/shared-types';

function uuid(): string {
  return crypto.randomUUID();
}

export function createUser(overrides: Partial<ReturnType<typeof createUser>> = {}) {
  return {
    id: uuid(),
    email: `user-${Math.random().toString(36).slice(2)}@example.com`,
    name: 'Test User',
    avatarUrl: null,
    isPlatformAdmin: false,
    twoFactorEnabled: false,
    timezone: 'UTC',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

export function createOrganization(overrides: Record<string, unknown> = {}) {
  const slug = `test-org-${Math.random().toString(36).slice(2)}`;
  return {
    id: uuid(),
    name: 'Test Organization',
    slug,
    planId: null,
    ssoEnabled: false,
    logoUrl: null,
    primaryColor: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

export function createOrgMember(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    organizationId: uuid(),
    userId: uuid(),
    role: OrgMemberRole.Member,
    status: OrgMemberStatus.Active,
    invitedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

export function createWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    organizationId: uuid(),
    name: 'Test Workspace',
    description: null,
    visibility: 'org' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

export function createProject(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    organizationId: uuid(),
    workspaceId: uuid(),
    name: 'Test Project',
    description: null,
    status: ProjectStatus.Active,
    startDate: null,
    endDate: null,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

export function createBoard(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    organizationId: uuid(),
    projectId: uuid(),
    name: 'Test Board',
    background: null,
    isArchived: false,
    isTemplate: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

export function createList(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    boardId: uuid(),
    name: 'To Do',
    position: 1.0,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

export function createCard(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    organizationId: uuid(),
    listId: uuid(),
    parentCardId: null,
    title: 'Test Card',
    description: null,
    position: 1.0,
    dueDate: null,
    stageId: null,
    coverImage: null,
    storyPoints: null,
    estimateMinutes: null,
    subtasksTotal: 0,
    subtasksDone: 0,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

/**
 * createOrgWithUsers — creates a full org context for integration tests.
 * Returns the org, owner user, and member user pre-populated.
 */
export function createOrgWithUsers() {
  const org = createOrganization();
  const owner = createUser({ name: 'Org Owner' });
  const member = createUser({ name: 'Org Member' });

  const ownerMembership = createOrgMember({
    organizationId: org.id,
    userId: owner.id,
    role: OrgMemberRole.OrgOwner,
    status: OrgMemberStatus.Active,
  });

  const memberMembership = createOrgMember({
    organizationId: org.id,
    userId: member.id,
    role: OrgMemberRole.Member,
    status: OrgMemberStatus.Active,
  });

  return { org, owner, member, ownerMembership, memberMembership };
}

/**
 * createBoardWithCards — creates a board with 3 lists and 2 cards per list.
 */
export function createBoardWithCards(orgId: string, projectId: string) {
  const board = createBoard({ organizationId: orgId, projectId });

  const lists = [
    createList({ boardId: board.id, name: 'To Do', position: 1.0 }),
    createList({ boardId: board.id, name: 'In Progress', position: 2.0 }),
    createList({ boardId: board.id, name: 'Done', position: 3.0 }),
  ];

  const cards = lists.flatMap((list, i) => [
    createCard({ organizationId: orgId, listId: list.id, title: `Card ${i * 2 + 1}`, position: 1.0 }),
    createCard({ organizationId: orgId, listId: list.id, title: `Card ${i * 2 + 2}`, position: 2.0 }),
  ]);

  return { board, lists, cards };
}
