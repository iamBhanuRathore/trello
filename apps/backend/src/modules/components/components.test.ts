import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { inviteMember } from '../organizations/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard } from '../cards/service';
import { seedOrgTeamRoles, assignTeamRole, listMemberTeamRoles } from '../roles/service';
import {
  createComponent,
  setAssignmentRule,
  resolveDefaultAssignee,
  updateAssignmentPolicy,
} from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;
let db: Database;

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema }) as unknown as Database;
});

afterAll(async () => {
  await client.end();
});

async function setup(tag: string) {
  const id = `${Date.now()}_${Math.random().toString(36).substring(7)}_${tag}`;
  const { user, organization } = await signUp(db, {
    name: 'Owner',
    email: `owner_${id}@comp.com`,
    password: 'pass',
    orgName: `Comp Org ${id}`,
    orgSlug: `comp-org-${id}`,
  });
  const ws = await createWorkspace(db, { organizationId: organization.id, name: 'WS' });
  const proj = await createProject(db, {
    organizationId: organization.id,
    workspaceId: ws!.id,
    name: 'App',
  });
  const board = await createBoard(db, {
    organizationId: organization.id,
    projectId: proj!.id,
    name: 'Board',
  });
  const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
  return { user, organization, proj: proj!, board: board!, list: list! };
}

async function addMember(orgId: string, ownerId: string, tag: string) {
  const email = `member_${tag}_${Date.now()}@comp.com`;
  const [u] = await db
    .insert(schema.users)
    .values({ name: tag, email, passwordHash: 'hash' })
    .returning();
  await inviteMember(db, orgId, email, 'member', ownerId);
  await db
    .update(schema.organizationMembers)
    .set({ status: 'active' })
    .where(eq_(schema.organizationMembers.userId, u!.id));
  return u!;
}

// tiny local eq to avoid importing drizzle twice (same symbol, but explicit)
import { eq as eq_ } from 'drizzle-orm';

describe('Team Roles + Assignment Rules', () => {
  it('seeds Lead/Developer/Tester on signup', async () => {
    const { organization } = await setup('seed');
    const roles = await db
      .select({ name: schema.roles.name })
      .from(schema.roles)
      .where(eq_(schema.roles.organizationId, organization.id));
    const names = roles.map((r) => r.name);
    expect(names).toContain('Lead');
    expect(names).toContain('Developer');
    expect(names).toContain('Tester');
  });

  it('attaches team roles to members and resolves holders', async () => {
    const { user, organization } = await setup('attach');
    await seedOrgTeamRoles(db, organization.id);
    const dev = await addMember(organization.id, user.id, 'dev1');
    const [leadRole] = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq_(schema.roles.organizationId, organization.id));
    await assignTeamRole(db, organization.id, dev!.id, leadRole!.id, user.id);
    const held = await listMemberTeamRoles(db, organization.id, dev!.id);
    expect(held.length).toBe(1);

    // Non-members cannot be attached
    const outsider = await setup('outsider');
    await expect(
      assignTeamRole(db, organization.id, outsider.user.id, leadRole!.id, user.id)
    ).rejects.toMatchObject({ status: 404 });
  });

  it('resolves most-specific scope first (component > board > project > org)', async () => {
    const { user, organization, proj, board, list } = await setup('precedence');
    await seedOrgTeamRoles(db, organization.id);
    const dev = await addMember(organization.id, user.id, 'dev2');
    const tester = await addMember(organization.id, user.id, 'tester2');

    const allRoles = await db
      .select({ id: schema.roles.id, name: schema.roles.name })
      .from(schema.roles)
      .where(eq_(schema.roles.organizationId, organization.id));
    const devRole = allRoles.find((r) => r.name === 'Developer')!;
    const testerRole = allRoles.find((r) => r.name === 'Tester')!;
    await assignTeamRole(db, organization.id, dev!.id, devRole.id, user.id);
    await assignTeamRole(db, organization.id, tester!.id, testerRole.id, user.id);

    const component = await createComponent(db, organization.id, board.id, {
      name: 'frontend',
      leadUserId: tester!.id,
    });

    // Org rule -> Developer, project rule -> Tester, board rule -> Developer
    await setAssignmentRule(db, organization.id, {}, { defaultRoleId: devRole.id }, user.id);
    await setAssignmentRule(
      db,
      organization.id,
      { projectId: proj.id },
      { defaultRoleId: testerRole.id },
      user.id
    );
    await setAssignmentRule(
      db,
      organization.id,
      { projectId: proj.id, boardId: board.id },
      { defaultRoleId: devRole.id },
      user.id
    );

    // Board scope beats project scope
    let resolved = await resolveDefaultAssignee(db, organization.id, {
      projectId: proj.id,
      boardId: board.id,
      componentIds: [],
    });
    expect(resolved.userId).toBe(dev!.id);
    expect(resolved.source).toBe('board-rule:role');

    // Component lead beats board rule
    resolved = await resolveDefaultAssignee(db, organization.id, {
      projectId: proj.id,
      boardId: board.id,
      componentIds: [component.id],
    });
    expect(resolved.userId).toBe(tester!.id);
    expect(resolved.source).toBe('component-lead');

    // Project scope alone resolves the project rule
    resolved = await resolveDefaultAssignee(db, organization.id, {
      projectId: proj.id,
      boardId: null,
      componentIds: [],
    });
    expect(resolved.userId).toBe(tester!.id);

    // New cards auto-assign through the board rule
    const card = await createCard(db, organization.id, { listId: list!.id, title: 'Auto' });
    const assignees = await db
      .select({ userId: schema.cardAssignees.userId })
      .from(schema.cardAssignees)
      .where(eq_(schema.cardAssignees.cardId, card!.id));
    expect(assignees.some((a) => a.userId === dev!.id)).toBe(true);

    // Explicit assignee wins over rules
    const manual = await createCard(db, organization.id, {
      listId: list!.id,
      title: 'Manual',
      assigneeId: user.id,
    });
    const manualAssignees = await db
      .select({ userId: schema.cardAssignees.userId })
      .from(schema.cardAssignees)
      .where(eq_(schema.cardAssignees.cardId, manual!.id));
    expect(manualAssignees.map((a) => a.userId)).toContain(user.id);
  });

  it('rejects creation without assignee when allowUnassigned is false', async () => {
    const { organization, list } = await setup('required');
    await updateAssignmentPolicy(db, organization.id, { allowUnassigned: false });
    await expect(
      createCard(db, organization.id, { listId: list!.id, title: 'Needs owner' })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('rejects cross-org rule planting and component theft', async () => {
    const a = await setup('ruleA');
    const b = await setup('ruleB');
    await seedOrgTeamRoles(db, b.organization.id);
    const bRoles = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq_(schema.roles.organizationId, b.organization.id));

    // A's board cannot be targeted by B's admin
    await expect(
      setAssignmentRule(
        db,
        b.organization.id,
        { boardId: a.board.id },
        { defaultRoleId: bRoles[0]!.id },
        b.user.id
      )
    ).rejects.toMatchObject({ status: 404 });

    // B's role cannot back A's rule
    await expect(
      setAssignmentRule(db, a.organization.id, {}, { defaultRoleId: bRoles[0]!.id }, a.user.id)
    ).rejects.toMatchObject({ status: 404 });

    // A's component cannot be linked to B's card
    const comp = await createComponent(db, a.organization.id, a.board.id, { name: 'api' });
    const bCard = await (async () => {
      const { createCard: cc } = await import('../cards/service');
      return cc(db, b.organization.id, { listId: b.list!.id, title: 'B card' });
    })();
    const { addComponentToCard } = await import('./service');
    await expect(
      addComponentToCard(db, b.organization.id, bCard!.id, comp.id, b.user.id)
    ).rejects.toMatchObject({ status: 404 });
  });
});
