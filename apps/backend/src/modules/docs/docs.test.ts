import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { eq, inArray } from 'drizzle-orm';
import { signUp } from '../auth/service';
import { deleteTestOrg, uniqueTestEmail, uniqueTestSlug } from '../../test-utils';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard } from '../cards/service';
import {
  createDocument,
  listProjectDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
  linkCardToDocument,
  unlinkCardFromDocument,
} from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Docs & Wiki Service', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let userId: string;
  let projectId: string;
  let boardId: string;
  let listId: string;
  let cardId: string;
  let docId: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema }) as unknown as Database;

    const email = uniqueTestEmail('docs');
    const slug = uniqueTestSlug('docs-org');

    const { user, organization } = await signUp(db, {
      name: 'Docs Admin',
      email,
      password: 'pass',
      orgName: 'Docs Org',
      orgSlug: slug,
    });
    orgId = organization.id;
    userId = user.id;

    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ organizationId: orgId, name: 'Docs WS' })
      .returning();

    const project = await createProject(db, {
      organizationId: orgId,
      workspaceId: workspace!.id,
      name: 'Docs Project',
    });
    projectId = project!.id;

    const board = await createBoard(db, {
      organizationId: orgId,
      projectId,
      name: 'Docs Board',
    });
    boardId = board!.id;

    const list = await createList(db, orgId, {
      boardId,
      name: 'Tasks',
      position: 1,
    });
    listId = list!.id;

    const card = await createCard(db, orgId, {
      listId,
      title: 'Task for RFC',
      position: 1,
    });
    cardId = card!.id;
  });

  afterAll(async () => {
    // Scoped to this suite's documents. A bare `db.delete(schema.documentCards)`
    // deleted every card↔document link in boardly_test.
    await db
      .delete(schema.documentCards)
      .where(
        inArray(
          schema.documentCards.documentId,
          db
            .select({ id: schema.documents.id })
            .from(schema.documents)
            .where(eq(schema.documents.organizationId, orgId))
        )
      );
    await db.delete(schema.documents).where(eq(schema.documents.organizationId, orgId));
    await db.delete(schema.cards).where(eq(schema.cards.organizationId, orgId));
    await db.delete(schema.lists).where(eq(schema.lists.boardId, boardId));
    await db.delete(schema.boards).where(eq(schema.boards.id, boardId));
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.workspaces).where(eq(schema.workspaces.organizationId, orgId));
    await deleteTestOrg(db, orgId);
    await client.end();
  });

  it('should create a project document', async () => {
    const doc = await createDocument(db, orgId, projectId, userId, {
      title: 'Architecture RFC & Specs',
      content: '# Architecture\n\nThis is the core specification.',
    });

    expect(doc.id).toBeDefined();
    expect(doc.title).toBe('Architecture RFC & Specs');
    expect(doc.content).toContain('This is the core specification');
    expect(doc.slug).toContain('architecture-rfc-specs');
    docId = doc.id;
  });

  it('should list project documents', async () => {
    const docs = await listProjectDocuments(db, orgId, projectId);
    expect(docs.length).toBe(1);
    expect(docs[0]!.title).toBe('Architecture RFC & Specs');
    expect(docs[0]!.author.name).toBe('Docs Admin');
  });

  it('should link a task card to the document and retrieve with linked cards', async () => {
    await linkCardToDocument(db, orgId, docId, cardId);

    const doc = await getDocument(db, orgId, docId);
    expect(doc.id).toBe(docId);
    expect(doc.linkedCards.length).toBe(1);
    expect(doc.linkedCards[0]!.title).toBe('Task for RFC');
    expect(doc.linkedCards[0]!.boardName).toBe('Docs Board');
  });

  it('should update document title and content', async () => {
    const updated = await updateDocument(db, orgId, docId, {
      title: 'Architecture RFC v2',
      content: '# Architecture v2\n\nUpdated RFC.',
    });

    expect(updated!.title).toBe('Architecture RFC v2');
    expect(updated!.content).toBe('# Architecture v2\n\nUpdated RFC.');
  });

  it('should unlink card from document', async () => {
    await unlinkCardFromDocument(db, orgId, docId, cardId);
    const doc = await getDocument(db, orgId, docId);
    expect(doc.linkedCards.length).toBe(0);
  });

  it('should delete a document', async () => {
    const deleted = await deleteDocument(db, orgId, docId);
    expect(deleted!.id).toBe(docId);

    const docs = await listProjectDocuments(db, orgId, projectId);
    expect(docs.length).toBe(0);
  });
});
