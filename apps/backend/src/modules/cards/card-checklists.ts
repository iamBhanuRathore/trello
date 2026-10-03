import { eq, and, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { cards, comments, checklists, checklistItems } from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { verifyCardAccess, bumpForCard, bumpForChecklist } from './card-helpers';

/** Tenant gate for checklist-keyed routes: resolves the owning card + verifies org. */
export async function verifyChecklistAccess(
  db: Database,
  checklistId: string,
  organizationId: string
) {
  const [row] = await db
    .select({ cardId: checklists.cardId })
    .from(checklists)
    .innerJoin(cards, eq(cards.id, checklists.cardId))
    .where(and(eq(checklists.id, checklistId), eq(cards.organizationId, organizationId)))
    .limit(1);
  if (!row) throw httpError(404, 'Checklist not found or access denied');
  return row.cardId;
}

/** Tenant gate for checklist-item-keyed routes. */
export async function verifyChecklistItemAccess(
  db: Database,
  itemId: string,
  organizationId: string
) {
  const [row] = await db
    .select({ cardId: checklists.cardId })
    .from(checklistItems)
    .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
    .innerJoin(cards, eq(cards.id, checklists.cardId))
    .where(and(eq(checklistItems.id, itemId), eq(cards.organizationId, organizationId)))
    .limit(1);
  if (!row) throw httpError(404, 'Checklist item not found or access denied');
  return row.cardId;
}

export async function getCardChecklists(db: Database, cardId: string, organizationId: string) {
  await verifyCardAccess(db, cardId, organizationId);
  // Independent queries (items re-derive cardId via join) — run concurrently.
  const [allChecklists, allItems] = await Promise.all([
    db
      .select()
      .from(checklists)
      .where(and(eq(checklists.cardId, cardId), isNull(checklists.deletedAt)))
      .orderBy(checklists.position),
    db
      .select()
      .from(checklistItems)
      .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
      .where(
        and(
          eq(checklists.cardId, cardId),
          isNull(checklists.deletedAt),
          isNull(checklistItems.deletedAt)
        )
      )
      .orderBy(checklistItems.position),
  ]);

  // Group in one pass. This filtered the full item array per checklist, so a card
  // with N checklists and M items cost O(N*M) on every card open.
  const itemsByChecklistId = new Map<string, (typeof allItems)[number]['checklist_items'][]>();
  for (const row of allItems) {
    const list = itemsByChecklistId.get(row.checklist_items.checklistId);
    if (list) list.push(row.checklist_items);
    else itemsByChecklistId.set(row.checklist_items.checklistId, [row.checklist_items]);
  }

  return allChecklists.map((cl) => ({
    ...cl,
    items: itemsByChecklistId.get(cl.id) ?? [],
  }));
}

export async function createChecklist(
  db: Database,
  cardId: string,
  organizationId: string,
  title: string,
  position: number,
  actorUserId?: string,
  items?: string[]
) {
  await verifyCardAccess(db, cardId, organizationId);
  const [checklist] = await db.insert(checklists).values({ cardId, title, position }).returning();
  if (!checklist) throw httpError(500, 'Failed to create checklist');

  let insertedItems: any[] = [];
  const validItems = (items || []).map((t) => t.trim()).filter(Boolean);
  if (validItems.length > 0) {
    insertedItems = await db
      .insert(checklistItems)
      .values(
        validItems.map((text, idx) => ({
          checklistId: checklist.id,
          text,
          position: idx,
        }))
      )
      .returning();
  }

  if (actorUserId) {
    let bodyText = `📋 Added checklist: **${title}**`;
    if (validItems.length > 0) {
      bodyText += `\n` + validItems.map((t) => `- [ ] ${t}`).join('\n');
    }
    await db
      .insert(comments)
      .values({
        cardId,
        userId: actorUserId,
        body: bodyText,
      })
      .catch(() => {});
  }
  await bumpForChecklist(db, checklist.id, cardId);
  return { ...checklist, items: insertedItems };
}

export async function createBulkChecklistItems(
  db: Database,
  checklistId: string,
  organizationId: string,
  items: string[],
  actorUserId?: string
) {
  const [cl] = await db
    .select({ cardId: checklists.cardId, title: checklists.title })
    .from(checklists)
    .innerJoin(cards, eq(cards.id, checklists.cardId))
    .where(and(eq(checklists.id, checklistId), eq(cards.organizationId, organizationId)));
  if (!cl) throw httpError(404, 'Checklist not found');

  const validItems = items.map((t) => t.trim()).filter(Boolean);
  if (validItems.length === 0) return [];

  const existingItems = await db
    .select({ position: checklistItems.position })
    .from(checklistItems)
    .where(eq(checklistItems.checklistId, checklistId));

  const maxPos = existingItems.reduce((max, it) => Math.max(max, it.position), -1);

  const inserted = await db
    .insert(checklistItems)
    .values(
      validItems.map((text, idx) => ({
        checklistId,
        text,
        position: maxPos + 1 + idx,
      }))
    )
    .returning();

  if (actorUserId && cl.cardId) {
    let bodyText: string;
    if (validItems.length === 1) {
      bodyText = `➕ Added checklist item: **${validItems[0]}**`;
    } else {
      bodyText =
        `➕ Added ${validItems.length} checklist items to **${cl.title}**:\n` +
        validItems.map((t) => `- [ ] ${t}`).join('\n');
    }
    await db
      .insert(comments)
      .values({
        cardId: cl.cardId,
        userId: actorUserId,
        body: bodyText,
      })
      .catch(() => {});
  }

  await bumpForChecklist(db, checklistId, cl.cardId);
  return inserted;
}

export async function createChecklistItem(
  db: Database,
  checklistId: string,
  organizationId: string,
  text: string,
  position: number,
  assignedTo?: string,
  dueDate?: Date,
  actorUserId?: string
) {
  await verifyChecklistAccess(db, checklistId, organizationId);
  if (text.includes('\n')) {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 1) {
      const items = await createBulkChecklistItems(
        db,
        checklistId,
        organizationId,
        lines,
        actorUserId
      );
      return items[0] || null;
    }
    text = lines[0] || text.trim();
  }

  const [item] = await db
    .insert(checklistItems)
    .values({ checklistId, text, position, assignedTo, dueDate })
    .returning();

  if (actorUserId && item) {
    const [cl] = await db
      .select({ cardId: checklists.cardId })
      .from(checklists)
      .where(eq(checklists.id, checklistId));
    if (cl?.cardId) {
      await db
        .insert(comments)
        .values({
          cardId: cl.cardId,
          userId: actorUserId,
          body: `➕ Added checklist item: **${text}**`,
        })
        .catch(() => {});
    }
  }

  await bumpForChecklist(db, checklistId);
  return item;
}

export async function updateChecklistItem(
  db: Database,
  itemId: string,
  organizationId: string,
  input: any,
  actorUserId?: string
) {
  await verifyChecklistItemAccess(db, itemId, organizationId);
  const [existing] = await db
    .select({
      id: checklistItems.id,
      text: checklistItems.text,
      isDone: checklistItems.isDone,
      cardId: checklists.cardId,
    })
    .from(checklistItems)
    .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
    .where(eq(checklistItems.id, itemId));

  const [item] = await db
    .update(checklistItems)
    .set({
      ...(input?.text !== undefined ? { text: input.text } : {}),
      ...(input?.isDone !== undefined ? { isDone: input.isDone } : {}),
      ...(input?.position !== undefined ? { position: input.position } : {}),
      ...(input?.assignedTo !== undefined ? { assignedTo: input.assignedTo } : {}),
      ...(input?.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      updatedAt: new Date(),
    })
    .where(eq(checklistItems.id, itemId))
    .returning();
  if (!item) throw httpError(404, 'Checklist item not found');

  if (
    existing?.cardId &&
    actorUserId &&
    input.isDone !== undefined &&
    input.isDone !== existing.isDone
  ) {
    const actionText = input.isDone
      ? `☑️ Completed checklist item: **${existing.text}**`
      : `⬜ Marked checklist item incomplete: **${existing.text}**`;
    await db
      .insert(comments)
      .values({
        cardId: existing.cardId,
        userId: actorUserId,
        body: actionText,
      })
      .catch(() => {});
  }

  if (existing?.cardId) {
    await bumpForCard(db, existing.cardId);
  }
  return item;
}

export async function deleteChecklistItem(
  db: Database,
  itemId: string,
  organizationId: string,
  actorUserId?: string
) {
  await verifyChecklistItemAccess(db, itemId, organizationId);
  const [existing] = await db
    .select({
      text: checklistItems.text,
      cardId: checklists.cardId,
    })
    .from(checklistItems)
    .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
    .where(eq(checklistItems.id, itemId));

  const [deleted] = await db
    .delete(checklistItems)
    .where(eq(checklistItems.id, itemId))
    .returning();
  if (!deleted) throw httpError(404, 'Checklist item not found');

  if (existing?.cardId && actorUserId) {
    await db
      .insert(comments)
      .values({
        cardId: existing.cardId,
        userId: actorUserId,
        body: `🗑️ Removed checklist item: **${existing.text}**`,
      })
      .catch(() => {});
  }

  if (existing?.cardId) {
    await bumpForCard(db, existing.cardId);
  }
  return { success: true, deletedId: itemId };
}

export async function updateChecklist(
  db: Database,
  checklistId: string,
  organizationId: string,
  title: string,
  actorUserId?: string
) {
  await verifyChecklistAccess(db, checklistId, organizationId);
  const [existing] = await db
    .select({ cardId: checklists.cardId, title: checklists.title })
    .from(checklists)
    .where(eq(checklists.id, checklistId));

  const [updated] = await db
    .update(checklists)
    .set({ title, updatedAt: new Date() })
    .where(eq(checklists.id, checklistId))
    .returning();
  if (!updated) throw httpError(404, 'Checklist not found');

  if (existing?.cardId && actorUserId && existing.title !== title) {
    await db
      .insert(comments)
      .values({
        cardId: existing.cardId,
        userId: actorUserId,
        body: `📋 Renamed checklist to: **${title}**`,
      })
      .catch(() => {});
  }

  await bumpForChecklist(db, checklistId, existing?.cardId ?? null);
  return updated;
}

export async function deleteChecklist(
  db: Database,
  checklistId: string,
  organizationId: string,
  actorUserId?: string
) {
  await verifyChecklistAccess(db, checklistId, organizationId);
  const [existing] = await db
    .select({ cardId: checklists.cardId, title: checklists.title })
    .from(checklists)
    .where(eq(checklists.id, checklistId));

  await db.delete(checklistItems).where(eq(checklistItems.checklistId, checklistId));
  const [deleted] = await db.delete(checklists).where(eq(checklists.id, checklistId)).returning();
  if (!deleted) throw httpError(404, 'Checklist not found');

  if (existing?.cardId && actorUserId) {
    await db
      .insert(comments)
      .values({
        cardId: existing.cardId,
        userId: actorUserId,
        body: `🗑️ Removed checklist: **${existing.title}**`,
      })
      .catch(() => {});
  }

  await bumpForChecklist(db, checklistId, existing?.cardId ?? null);
  return { success: true, deletedId: checklistId };
}
