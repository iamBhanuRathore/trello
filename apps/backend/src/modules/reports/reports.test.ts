import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { eq } from 'drizzle-orm';
import { signUp } from '../auth/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard } from '../cards/service';
import { createSprint, addCardToSprint } from '../sprints/service';
import {
  getProjectSummaryReport,
  getSprintBurndown,
  getProjectVelocity,
  getBoardSummaryReport,
  getCumulativeFlowDiagram,
  getLeadAndCycleTime,
  getWorkspacePortfolioHealth,
} from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Reports Service', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let workspaceId: string;
  let projectId: string;
  let boardId: string;
  let listId: string;
  let sprintId: string;
  let card1Id: string;
  let card2Id: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema });

    const email = `reports_${Date.now()}@example.com`;
    const slug = `reports-org-${Date.now()}`;

    const { organization } = await signUp(db, {
      name: 'Reports Admin',
      email,
      password: 'pass',
      orgName: 'Reports Org',
      orgSlug: slug,
    });
    orgId = organization.id;

    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ organizationId: orgId, name: 'Reports WS' })
      .returning();
    workspaceId = workspace!.id;

    const project = await createProject(db, {
      organizationId: orgId,
      workspaceId: workspace!.id,
      name: 'Analytics Project',
    });
    projectId = project!.id;

    const board = await createBoard(db, {
      organizationId: orgId,
      projectId,
      name: 'Sprint Board',
    });
    boardId = board!.id;

    const list = await createList(db, orgId, {
      boardId,
      name: 'In Progress',
      position: 1,
    });
    listId = list!.id;

    // Create cards with story points
    const card1 = await createCard(db, orgId, {
      listId,
      title: 'Task 1',
      position: 1,
      storyPoints: 5,
    });
    card1Id = card1!.id;

    const card2 = await createCard(db, orgId, {
      listId,
      title: 'Task 2',
      position: 2,
      storyPoints: 3,
    });
    card2Id = card2!.id;

    // Create a sprint
    const sprint = await createSprint(db, projectId, {
      name: 'Sprint 1',
      type: 'weekly',
      startDate: '2026-08-01',
      endDate: '2026-08-08',
      goal: 'Deliver analytics',
    });
    sprintId = sprint!.id;

    await addCardToSprint(db, sprintId, card1Id);
    await addCardToSprint(db, sprintId, card2Id);
  });

  afterAll(async () => {
    await db.delete(schema.cardSprints).where(eq(schema.cardSprints.sprintId, sprintId));
    await db.delete(schema.sprints).where(eq(schema.sprints.projectId, projectId));
    await db.delete(schema.cards).where(eq(schema.cards.organizationId, orgId));
    await db.delete(schema.lists).where(eq(schema.lists.boardId, boardId));
    await db.delete(schema.boards).where(eq(schema.boards.id, boardId));
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.workspaces).where(eq(schema.workspaces.organizationId, orgId));
    await db.delete(schema.organizationMembers).where(eq(schema.organizationMembers.organizationId, orgId));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    await client.end();
  });

  it('should generate project summary report', async () => {
    const report = await getProjectSummaryReport(db, projectId, orgId);
    expect(report.project.id).toBe(projectId);
    expect(report.metrics.totalCards).toBe(2);
    expect(report.metrics.totalStoryPoints).toBe(8);
    expect(report.metrics.sprintsCount).toBe(1);
  });

  it('should generate sprint burndown dataset', async () => {
    const burndown = await getSprintBurndown(db, sprintId, orgId);
    expect(burndown.sprint.id).toBe(sprintId);
    expect(burndown.totalCards).toBe(2);
    expect(burndown.totalStoryPoints).toBe(8);
    expect(burndown.burndownData.length).toBeGreaterThan(0);
    expect(burndown.burndownData[0]!.idealRemaining).toBe(8);
  });

  it('should generate project velocity report', async () => {
    const velocity = await getProjectVelocity(db, projectId, orgId);
    expect(velocity.projectId).toBe(projectId);
    expect(velocity.sprints.length).toBe(1);
    expect(velocity.sprints[0]!.plannedPoints).toBe(8);
  });

  it('should generate board summary report', async () => {
    const boardReport = await getBoardSummaryReport(db, boardId, orgId);
    expect(boardReport.board.id).toBe(boardId);
    expect(boardReport.metrics.totalCards).toBe(2);
    expect(boardReport.metrics.totalStoryPoints).toBe(8);
  });

  it('should generate cumulative flow diagram (CFD) dataset', async () => {
    const cfd = await getCumulativeFlowDiagram(db, projectId, orgId, 7);
    expect(cfd.projectId).toBe(projectId);
    expect(cfd.days).toBe(7);
    expect(cfd.timeline.length).toBe(7);
    expect(cfd.timeline[6]!.total).toBe(2);
  });

  it('should calculate lead and cycle time metrics', async () => {
    const metrics = await getLeadAndCycleTime(db, projectId, orgId);
    expect(metrics.projectId).toBe(projectId);
    expect(metrics.metrics).toBeDefined();
    expect(typeof metrics.metrics.avgLeadTimeDays).toBe('number');
  });

  it('should generate workspace portfolio health overview', async () => {
    const portfolio = await getWorkspacePortfolioHealth(db, workspaceId, orgId);
    expect(portfolio.workspace.id).toBe(workspaceId);
    expect(portfolio.summary.totalProjects).toBe(1);
    expect(portfolio.projects.length).toBe(1);
    expect(portfolio.projects[0]!.health).toBeDefined();
  });
});
