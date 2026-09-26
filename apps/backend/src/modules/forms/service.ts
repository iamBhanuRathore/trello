import { eq, and, desc, sql, isNull, inArray } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  intakeForms,
  formSubmissions,
  boards,
  lists,
  cards,
  cardAssignees,
} from '../../db/schema/index';

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

function generateSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'form'
  );
}

export async function createIntakeForm(
  db: Database,
  organizationId: string,
  input: {
    boardId: string;
    listId: string;
    title: string;
    description?: string;
    fields?: any[];
    isPublished?: boolean;
    defaultAssigneeId?: string;
    slaHours?: number;
  }
) {
  const [board] = await db
    .select()
    .from(boards)
    .where(and(eq(boards.id, input.boardId), eq(boards.organizationId, organizationId)))
    .limit(1);

  if (!board) throw httpError(404, 'Board not found');

  const [targetList] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.id, input.listId), eq(lists.boardId, input.boardId)))
    .limit(1);

  if (!targetList) throw httpError(404, 'Target list not found on board');
  if (!input.title || input.title.trim().length === 0) {
    throw httpError(400, 'Form title is required');
  }

  const baseSlug = generateSlug(input.title);
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  const defaultFields =
    input.fields && input.fields.length > 0
      ? input.fields
      : [
          { id: 'title', label: 'Issue / Request Title', type: 'text', required: true },
          { id: 'description', label: 'Detailed Description', type: 'textarea', required: true },
          {
            id: 'priority',
            label: 'Urgency',
            type: 'select',
            options: ['Low', 'Medium', 'High', 'Critical'],
            required: false,
          },
        ];

  const [form] = await db
    .insert(intakeForms)
    .values({
      organizationId,
      boardId: input.boardId,
      listId: input.listId,
      title: input.title.trim(),
      description: input.description || '',
      slug,
      fields: defaultFields,
      isPublished: input.isPublished ?? true,
      defaultAssigneeId: input.defaultAssigneeId || null,
      slaHours: input.slaHours || null,
    })
    .returning();

  return form!;
}

export async function getFormsByBoard(db: Database, organizationId: string, boardId: string) {
  const forms = await db
    .select({
      id: intakeForms.id,
      organizationId: intakeForms.organizationId,
      boardId: intakeForms.boardId,
      listId: intakeForms.listId,
      title: intakeForms.title,
      description: intakeForms.description,
      slug: intakeForms.slug,
      fields: intakeForms.fields,
      isPublished: intakeForms.isPublished,
      defaultAssigneeId: intakeForms.defaultAssigneeId,
      slaHours: intakeForms.slaHours,
      createdAt: intakeForms.createdAt,
      updatedAt: intakeForms.updatedAt,
      listName: lists.name,
    })
    .from(intakeForms)
    .innerJoin(lists, eq(intakeForms.listId, lists.id))
    .where(
      and(
        eq(intakeForms.organizationId, organizationId),
        eq(intakeForms.boardId, boardId),
        isNull(intakeForms.deletedAt)
      )
    )
    .orderBy(desc(intakeForms.createdAt));

  if (forms.length === 0) return [];

  // Single grouped count (was: one count query per form).
  const counts = await db
    .select({ formId: formSubmissions.formId, count: sql<number>`count(*)::int` })
    .from(formSubmissions)
    .where(
      inArray(
        formSubmissions.formId,
        forms.map((f) => f.id)
      )
    )
    .groupBy(formSubmissions.formId);
  const countByForm = new Map(counts.map((c) => [c.formId, Number(c.count || 0)]));

  return forms.map((f) => ({
    ...f,
    submissionCount: countByForm.get(f.id) || 0,
  }));
}

export async function getPublicFormBySlug(db: Database, slug: string) {
  const [form] = await db
    .select({
      id: intakeForms.id,
      title: intakeForms.title,
      description: intakeForms.description,
      slug: intakeForms.slug,
      fields: intakeForms.fields,
      isPublished: intakeForms.isPublished,
      slaHours: intakeForms.slaHours,
      boardName: boards.name,
    })
    .from(intakeForms)
    .innerJoin(boards, eq(intakeForms.boardId, boards.id))
    .where(and(eq(intakeForms.slug, slug), isNull(intakeForms.deletedAt)))
    .limit(1);

  if (!form || !form.isPublished) throw httpError(404, 'Intake form not found or inactive');

  return form;
}

export async function updateIntakeForm(
  db: Database,
  organizationId: string,
  formId: string,
  input: {
    title?: string;
    description?: string;
    listId?: string;
    fields?: any[];
    isPublished?: boolean;
    defaultAssigneeId?: string;
    slaHours?: number;
  }
) {
  const [form] = await db
    .select()
    .from(intakeForms)
    .where(
      and(
        eq(intakeForms.id, formId),
        eq(intakeForms.organizationId, organizationId),
        isNull(intakeForms.deletedAt)
      )
    )
    .limit(1);

  if (!form) throw httpError(404, 'Intake form not found');

  const updates: Partial<typeof intakeForms.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.title) updates.title = input.title.trim();
  if (input.description !== undefined) updates.description = input.description;
  if (input.listId) updates.listId = input.listId;
  if (input.fields !== undefined) updates.fields = input.fields;
  if (input.isPublished !== undefined) updates.isPublished = input.isPublished;
  if (input.defaultAssigneeId !== undefined)
    updates.defaultAssigneeId = input.defaultAssigneeId || null;
  if (input.slaHours !== undefined) updates.slaHours = input.slaHours || null;

  const [updated] = await db
    .update(intakeForms)
    .set(updates)
    .where(eq(intakeForms.id, formId))
    .returning();

  return updated;
}

export async function deleteIntakeForm(db: Database, organizationId: string, formId: string) {
  const [form] = await db
    .select()
    .from(intakeForms)
    .where(and(eq(intakeForms.id, formId), eq(intakeForms.organizationId, organizationId)))
    .limit(1);

  if (!form) throw httpError(404, 'Intake form not found');

  await db.delete(formSubmissions).where(eq(formSubmissions.formId, formId));
  const [deleted] = await db.delete(intakeForms).where(eq(intakeForms.id, formId)).returning();

  return deleted;
}

export async function submitIntakeForm(
  db: Database,
  slug: string,
  input: {
    submittedByName?: string;
    submittedByEmail?: string;
    data: Record<string, any>;
  }
) {
  const [form] = await db
    .select()
    .from(intakeForms)
    .where(and(eq(intakeForms.slug, slug), eq(intakeForms.isPublished, true)))
    .limit(1);

  if (!form) throw httpError(404, 'Form not found or not accepting responses');

  // 1. Calculate Card Title & Description
  const titleField =
    input.data['title'] ||
    input.data['summary'] ||
    input.data['subject'] ||
    `${form.title} Submission`;
  const cardTitle = String(titleField).trim();

  let formattedDesc = `**Submitted by**: ${input.submittedByName || 'Anonymous'} (${input.submittedByEmail || 'No email provided'})\n\n---\n\n`;
  for (const [key, value] of Object.entries(input.data)) {
    if (key !== 'title' && key !== 'summary') {
      formattedDesc += `**${key}**: ${value}\n`;
    }
  }

  // 2. Calculate SLA Due Date
  let dueDate: Date | null = null;
  if (form.slaHours && form.slaHours > 0) {
    dueDate = new Date(Date.now() + form.slaHours * 60 * 60 * 1000);
  }

  // 3. Create Card in Target List
  const [newCard] = await db
    .insert(cards)
    .values({
      organizationId: form.organizationId,
      listId: form.listId,
      title: cardTitle,
      description: formattedDesc,
      position: 65535,
      dueDate,
    })
    .returning();

  if (!newCard) throw httpError(500, 'Failed to generate ticket card');

  // 4. Assign default assignee if configured
  if (form.defaultAssigneeId) {
    await db
      .insert(cardAssignees)
      .values({
        cardId: newCard.id,
        userId: form.defaultAssigneeId,
      })
      .onConflictDoNothing();
  }

  // 5. Record Form Submission
  const [submission] = await db
    .insert(formSubmissions)
    .values({
      formId: form.id,
      cardId: newCard.id,
      submittedByName: input.submittedByName || null,
      submittedByEmail: input.submittedByEmail || null,
      data: input.data,
    })
    .returning();

  return {
    success: true,
    submissionId: submission!.id,
    cardId: newCard.id,
    slaDueDate: dueDate,
  };
}
