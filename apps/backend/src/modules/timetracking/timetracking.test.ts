import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { eq } from 'drizzle-orm';
import { deleteTestOrg, deleteTestUser } from '../../test-utils';
import { signUp } from '../auth/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard } from '../cards/service';
import { logTime, getCardTimeLogs, deleteTimeLog, getTimesheet } from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Time Tracking Service', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let userId: string;
  let email: string;
  let projectId: string;
  let boardId: string;
  let listId: string;
  let cardId: string;
  let timeLogId: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema });

    email = `timetrack_${Date.now()}@example.com`;
    const slug = `timetrack-org-${Date.now()}`;

    const { user, organization } = await signUp(db, {
      name: 'TimeTrack Admin',
      email,
      password: 'pass',
      orgName: 'TimeTrack Org',
      orgSlug: slug,
    });
    orgId = organization.id;
    userId = user.id;

    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ organizationId: orgId, name: 'TimeTrack WS' })
      .returning();

    const project = await createProject(db, {
      organizationId: orgId,
      workspaceId: workspace!.id,
      name: 'TimeTrack Project',
    });
    projectId = project!.id;

    const board = await createBoard(db, {
      organizationId: orgId,
      projectId,
      name: 'TimeTrack Board',
    });
    boardId = board!.id;

    const list = await createList(db, orgId, {
      boardId,
      name: 'To Do',
      position: 1,
    });
    listId = list!.id;

    const card = await createCard(db, orgId, {
      listId,
      title: 'Implement OAuth',
      position: 1,
      estimateMinutes: 240, // 4 hours
    });
    cardId = card!.id;
  });

  afterAll(async () => {
    await db.delete(schema.timeLogs).where(eq(schema.timeLogs.cardId, cardId));
    await db.delete(schema.cards).where(eq(schema.cards.organizationId, orgId));
    await db.delete(schema.lists).where(eq(schema.lists.boardId, boardId));
    await db.delete(schema.boards).where(eq(schema.boards.id, boardId));
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.workspaces).where(eq(schema.workspaces.organizationId, orgId));
    // The roles and organizations deletes each carried `.catch(() => {})`, which
    // is what hid the real failure: there was no rolePermissions delete, so the
    // roles delete threw on the restrict FK, was swallowed, and the org delete
    // after it was swallowed too. Nothing was ever cleaned up and nothing said
    // so. deleteTestOrg orders rolePermissions before roles.
    await deleteTestOrg(db, orgId);
    await deleteTestUser(db, email);
    await client.end();
  });

  it('should log time on a card', async () => {
    const entry = await logTime(db, orgId, userId, {
      cardId,
      minutes: 90, // 1.5 hours
      description: 'Worked on Google OAuth integration',
      isBillable: true,
      loggedDate: '2026-08-16',
    });

    expect(entry.id).toBeDefined();
    expect(entry.minutes).toBe(90);
    expect(entry.isBillable).toBe(true);
    expect(entry.description).toBe('Worked on Google OAuth integration');
    timeLogId = entry.id;
  });

  it('should log a second non-billable entry and get card time logs', async () => {
    await logTime(db, orgId, userId, {
      cardId,
      minutes: 30,
      description: 'Team standup and discussion',
      isBillable: false,
      loggedDate: '2026-08-16',
    });

    const cardLogs = await getCardTimeLogs(db, orgId, cardId);
    expect(cardLogs.cardId).toBe(cardId);
    expect(cardLogs.totalMinutes).toBe(120); // 2 hours
    expect(cardLogs.billableMinutes).toBe(90);
    expect(cardLogs.nonBillableMinutes).toBe(30);
    expect(cardLogs.estimateMinutes).toBe(240);
    expect(cardLogs.timeLogs.length).toBe(2);
  });

  it('should get timesheet overview across organization', async () => {
    const timesheet = await getTimesheet(db, orgId, {
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });

    expect(timesheet.totalMinutes).toBe(120);
    expect(timesheet.totalHours).toBe(2);
    expect(timesheet.billableMinutes).toBe(90);
    expect(timesheet.billableHours).toBe(1.5);
    expect(timesheet.nonBillableHours).toBe(0.5);
    expect(timesheet.billableRate).toBe(75); // 90 / 120 = 75%
    expect(timesheet.entriesCount).toBe(2);
    expect(timesheet.userSummary.length).toBe(1);
    expect(timesheet.projectSummary.length).toBe(1);
  });

  it('should delete a time log entry', async () => {
    const deleted = await deleteTimeLog(db, orgId, userId, timeLogId);
    expect(deleted!.id).toBe(timeLogId);

    const cardLogs = await getCardTimeLogs(db, orgId, cardId);
    expect(cardLogs.totalMinutes).toBe(30);
    expect(cardLogs.timeLogs.length).toBe(1);
  });
});
