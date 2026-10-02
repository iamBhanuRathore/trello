import { eq, max, sql } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  cards,
  lists,
  checklists,
  checklistItems,
  cardLabels,
  cardAssignees,
} from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { eventBus } from '../../lib/event-bus';
import { bumpBoardCache } from '../../lib/cache';
import { verifyListAccess, bumpForCard } from './card-helpers';
import { getCard } from './card-crud';

export interface CloneCardInput {
  listId?: string;
  title?: string;
  parentCardId?: string;
  cloneChecklists?: boolean;
  cloneLabels?: boolean;
  cloneAssignees?: boolean;
}

export async function cloneCard(
  db: Database,
  cardId: string,
  organizationId: string,
  input: CloneCardInput = {}
) {
  // 1. Fetch original card
  const original = await getCard(db, cardId, organizationId);
  if (!original) throw httpError(404, 'Card not found');

  const targetListId = input.listId || original.listId;
  await verifyListAccess(db, targetListId, organizationId);

  // Position: get max position in the target list
  const [result] = await db
    .select({ maxPos: max(cards.position) })
    .from(cards)
    .where(eq(cards.listId, targetListId));

  const newPosition = (result?.maxPos ?? 0) + 65536;
  const clonedTitle =
    input.title || (input.parentCardId ? `Subtask: ${original.title}` : `${original.title} (Copy)`);

  // If cloning as a subtask, verify parentCard
  if (input.parentCardId) {
    const [parent] = await db
      .select({ id: cards.id, parentCardId: cards.parentCardId })
      .from(cards)
      .where(eq(cards.id, input.parentCardId))
      .limit(1);

    if (!parent) throw httpError(404, 'Parent card not found');
    if (parent.parentCardId) {
      throw httpError(400, 'Subtasks cannot have their own subtasks (max 2 levels of nesting)');
    }
  }

  // 2. Insert cloned card
  const [cloned] = await db
    .insert(cards)
    .values({
      organizationId,
      listId: targetListId,
      parentCardId: input.parentCardId || null,
      title: clonedTitle,
      description: original.description,
      position: newPosition,
      dueDate: original.dueDate ? new Date(original.dueDate) : null,
      stageId: original.stageId || null,
      storyPoints: original.storyPoints || null,
      estimateMinutes: original.estimateMinutes || null,
      coverImage: original.coverImage || null,
    })
    .returning();

  if (!cloned) throw httpError(500, 'Failed to clone card');

  // If parentCardId, update parent's subtasksTotal
  if (input.parentCardId) {
    await db
      .update(cards)
      .set({ subtasksTotal: sql`${cards.subtasksTotal} + 1` })
      .where(eq(cards.id, input.parentCardId));
  }

  // 3. Clone Checklists & Items
  if (input.cloneChecklists !== false) {
    const originalChecklists = await db
      .select()
      .from(checklists)
      .where(eq(checklists.cardId, cardId))
      .orderBy(checklists.position);

    for (const cl of originalChecklists) {
      const [newCl] = await db
        .insert(checklists)
        .values({
          cardId: cloned.id,
          title: cl.title,
          position: cl.position,
        })
        .returning();

      if (!newCl) continue;

      const originalItems = await db
        .select()
        .from(checklistItems)
        .where(eq(checklistItems.checklistId, cl.id))
        .orderBy(checklistItems.position);

      if (originalItems.length > 0) {
        await db.insert(checklistItems).values(
          originalItems.map((item) => ({
            checklistId: newCl.id,
            text: item.text,
            isDone: false,
            position: item.position,
            assignedTo: item.assignedTo,
            dueDate: item.dueDate,
          }))
        );
      }
    }
  }

  // 4. Clone Labels
  if (input.cloneLabels !== false) {
    const originalLabels = await db
      .select({ labelId: cardLabels.labelId })
      .from(cardLabels)
      .where(eq(cardLabels.cardId, cardId));

    if (originalLabels.length > 0) {
      await db.insert(cardLabels).values(
        originalLabels.map((l) => ({
          cardId: cloned.id,
          labelId: l.labelId,
        }))
      );
    }
  }

  // 5. Clone Assignees
  if (input.cloneAssignees !== false) {
    const originalAssignees = await db
      .select({ userId: cardAssignees.userId, assignedBy: cardAssignees.assignedBy })
      .from(cardAssignees)
      .where(eq(cardAssignees.cardId, cardId));

    if (originalAssignees.length > 0) {
      await db.insert(cardAssignees).values(
        originalAssignees.map((a) => ({
          cardId: cloned.id,
          userId: a.userId,
          assignedBy: a.assignedBy,
        }))
      );
    }
  }

  const [boardInfo] = await db
    .select({ boardId: lists.boardId })
    .from(lists)
    .where(eq(lists.id, targetListId))
    .limit(1);

  if (boardInfo) {
    eventBus.broadcast(`board:${boardInfo.boardId}`, 'card.created', cloned);
    await bumpBoardCache(boardInfo.boardId);
  }
  if (input.parentCardId) {
    // Parent's subtask counters changed — its caches are stale.
    await bumpForCard(db, input.parentCardId);
  }

  return await getCard(db, cloned.id, organizationId);
}
