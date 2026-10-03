import { eq, and, desc, isNull } from 'drizzle-orm';
import { clampLimit } from '../../lib/pagination';
import type { Database } from '../../db/index';
import {
  documents,
  documentCards,
  cards,
  projects,
  users,
  boards,
  lists,
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
      .replace(/^-+|-+$/g, '') || 'document'
  );
}

export async function createDocument(
  db: Database,
  organizationId: string,
  projectId: string,
  authorId: string,
  input: {
    title: string;
    content?: string;
  }
) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .limit(1);

  if (!project) throw httpError(404, 'Project not found');
  if (!input.title || input.title.trim().length === 0) {
    throw httpError(400, 'Document title is required');
  }

  const baseSlug = generateSlug(input.title);
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  const [doc] = await db
    .insert(documents)
    .values({
      organizationId,
      projectId,
      title: input.title.trim(),
      slug,
      content: input.content || '',
      authorId,
    })
    .returning();

  return doc!;
}

export async function listProjectDocuments(
  db: Database,
  organizationId: string,
  projectId: string,
  options?: { limit?: number | string }
) {
  const limit = clampLimit(options?.limit, { def: 100, max: 200 });

  // `content` is deliberately NOT selected. The list endpoint fed every document
  // body in the project to the client; the dashboard fetches the body it is
  // actually about to render via GET /docs/:id, so this was pure payload.
  const docs = await db
    .select({
      id: documents.id,
      organizationId: documents.organizationId,
      projectId: documents.projectId,
      title: documents.title,
      slug: documents.slug,
      isArchived: documents.isArchived,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      author: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(documents)
    .innerJoin(users, eq(documents.authorId, users.id))
    .where(
      and(
        eq(documents.organizationId, organizationId),
        eq(documents.projectId, projectId),
        isNull(documents.deletedAt)
      )
    )
    .orderBy(desc(documents.updatedAt))
    .limit(limit);

  return docs;
}

export async function getDocument(db: Database, organizationId: string, docId: string) {
  const [doc] = await db
    .select({
      id: documents.id,
      organizationId: documents.organizationId,
      projectId: documents.projectId,
      title: documents.title,
      slug: documents.slug,
      content: documents.content,
      isArchived: documents.isArchived,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      author: {
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(documents)
    .innerJoin(users, eq(documents.authorId, users.id))
    .where(
      and(
        eq(documents.id, docId),
        eq(documents.organizationId, organizationId),
        isNull(documents.deletedAt)
      )
    )
    .limit(1);

  if (!doc) throw httpError(404, 'Document not found');

  // Fetch linked cards
  const linkedCards = await db
    .select({
      id: cards.id,
      title: cards.title,
      position: cards.position,
      dueDate: cards.dueDate,
      storyPoints: cards.storyPoints,
      listName: lists.name,
      boardId: boards.id,
      boardName: boards.name,
    })
    .from(documentCards)
    .innerJoin(cards, eq(documentCards.cardId, cards.id))
    .innerJoin(lists, eq(cards.listId, lists.id))
    .innerJoin(boards, eq(lists.boardId, boards.id))
    .where(eq(documentCards.documentId, docId));

  return {
    ...doc,
    linkedCards,
  };
}

export async function updateDocument(
  db: Database,
  organizationId: string,
  docId: string,
  input: {
    title?: string;
    content?: string;
    isArchived?: boolean;
  }
) {
  const [existing] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, docId),
        eq(documents.organizationId, organizationId),
        isNull(documents.deletedAt)
      )
    )
    .limit(1);

  if (!existing) throw httpError(404, 'Document not found');

  const updates: Partial<typeof documents.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.title) {
    updates.title = input.title.trim();
    updates.slug = `${generateSlug(input.title)}-${Date.now().toString(36)}`;
  }
  if (input.content !== undefined) {
    updates.content = input.content;
  }
  if (input.isArchived !== undefined) {
    updates.isArchived = input.isArchived;
  }

  const [updated] = await db
    .update(documents)
    .set(updates)
    .where(eq(documents.id, docId))
    .returning();

  return updated;
}

export async function deleteDocument(db: Database, organizationId: string, docId: string) {
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.organizationId, organizationId)))
    .limit(1);

  if (!doc) throw httpError(404, 'Document not found');

  await db.delete(documentCards).where(eq(documentCards.documentId, docId));
  const [deleted] = await db.delete(documents).where(eq(documents.id, docId)).returning();

  return deleted;
}

export async function linkCardToDocument(
  db: Database,
  organizationId: string,
  docId: string,
  cardId: string
) {
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.organizationId, organizationId)))
    .limit(1);

  if (!doc) throw httpError(404, 'Document not found');

  const [card] = await db
    .select()
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.organizationId, organizationId)))
    .limit(1);

  if (!card) throw httpError(404, 'Card not found');

  await db
    .insert(documentCards)
    .values({
      documentId: docId,
      cardId: cardId,
    })
    .onConflictDoNothing();

  return { success: true, documentId: docId, cardId };
}

export async function unlinkCardFromDocument(
  db: Database,
  _organizationId: string,
  docId: string,
  cardId: string
) {
  await db
    .delete(documentCards)
    .where(and(eq(documentCards.documentId, docId), eq(documentCards.cardId, cardId)));

  return { success: true };
}
