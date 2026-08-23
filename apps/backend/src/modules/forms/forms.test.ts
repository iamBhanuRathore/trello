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
import {
  createIntakeForm,
  getFormsByBoard,
  getPublicFormBySlug,
  updateIntakeForm,
  submitIntakeForm,
  deleteIntakeForm,
} from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Intake Forms & SLAs Service', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let userId: string;
  let projectId: string;
  let boardId: string;
  let listId: string;
  let formId: string;
  let formSlug: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema }) as unknown as Database;

    const email = `forms_${Date.now()}@example.com`;
    const slug = `forms-org-${Date.now()}`;

    const { user, organization } = await signUp(db, {
      name: 'Forms Admin',
      email,
      password: 'pass',
      orgName: 'Forms Org',
      orgSlug: slug,
    });
    orgId = organization.id;
    userId = user.id;

    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ organizationId: orgId, name: 'Forms WS' })
      .returning();

    const project = await createProject(db, {
      organizationId: orgId,
      workspaceId: workspace!.id,
      name: 'Forms Project',
    });
    projectId = project!.id;

    const board = await createBoard(db, {
      organizationId: orgId,
      projectId,
      name: 'Support Helpdesk',
    });
    boardId = board!.id;

    const list = await createList(db, orgId, {
      boardId,
      name: 'Incoming Tickets',
      position: 1,
    });
    listId = list!.id;
  });

  afterAll(async () => {
    await db.delete(schema.formSubmissions);
    await db.delete(schema.intakeForms).where(eq(schema.intakeForms.organizationId, orgId));
    await db.delete(schema.cardAssignees);
    await db.delete(schema.cards).where(eq(schema.cards.organizationId, orgId));
    await db.delete(schema.lists).where(eq(schema.lists.boardId, boardId));
    await db.delete(schema.boards).where(eq(schema.boards.id, boardId));
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.workspaces).where(eq(schema.workspaces.organizationId, orgId));
    await db.delete(schema.organizationMembers).where(eq(schema.organizationMembers.organizationId, orgId));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    await client.end();
  });

  it('should create an intake form with SLA settings', async () => {
    const form = await createIntakeForm(db, orgId, {
      boardId,
      listId,
      title: 'Customer Bug Report',
      description: 'Report issues found in production.',
      defaultAssigneeId: userId,
      slaHours: 24,
    });

    expect(form.id).toBeDefined();
    expect(form.title).toBe('Customer Bug Report');
    expect(form.slaHours).toBe(24);
    expect(form.slug).toContain('customer-bug-report');
    formId = form.id;
    formSlug = form.slug;
  });

  it('should fetch public form by slug', async () => {
    const pub = await getPublicFormBySlug(db, formSlug);
    expect(pub.id).toBe(formId);
    expect(pub.boardName).toBe('Support Helpdesk');
    expect(pub.slaHours).toBe(24);
  });

  it('should list forms for a board with submission count', async () => {
    const forms = await getFormsByBoard(db, orgId, boardId);
    expect(forms.length).toBe(1);
    expect(forms[0]!.listName).toBe('Incoming Tickets');
    expect(forms[0]!.submissionCount).toBe(0);
  });

  it('should submit an intake form, generating card and calculating SLA due date', async () => {
    const result = await submitIntakeForm(db, formSlug, {
      submittedByName: 'Alice Requester',
      submittedByEmail: 'alice@external.com',
      data: {
        title: 'Checkout button unresponsive on Safari',
        description: 'Clicking checkout throws javascript TypeError',
        priority: 'High',
      },
    });

    expect(result.success).toBe(true);
    expect(result.cardId).toBeDefined();
    expect(result.submissionId).toBeDefined();
    expect(result.slaDueDate).toBeDefined();

    // Verify card was created in target list
    const [card] = await db.select().from(schema.cards).where(eq(schema.cards.id, result.cardId));
    expect(card!.title).toBe('Checkout button unresponsive on Safari');
    expect(card!.description).toContain('Alice Requester');
    expect(card!.dueDate).not.toBeNull();

    // Verify forms list reflects 1 submission
    const forms = await getFormsByBoard(db, orgId, boardId);
    expect(forms[0]!.submissionCount).toBe(1);
  });

  it('should update intake form properties', async () => {
    const updated = await updateIntakeForm(db, orgId, formId, {
      title: 'Customer Bug & Incident Report',
      slaHours: 48,
    });

    expect(updated!.title).toBe('Customer Bug & Incident Report');
    expect(updated!.slaHours).toBe(48);
  });

  it('should delete an intake form', async () => {
    const deleted = await deleteIntakeForm(db, orgId, formId);
    expect(deleted!.id).toBe(formId);

    const forms = await getFormsByBoard(db, orgId, boardId);
    expect(forms.length).toBe(0);
  });
});
