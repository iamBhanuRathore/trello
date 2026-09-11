import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index';
import type { ImportTasksBody } from './schema';
import {
  projects,
  boards,
  lists,
  cards,
  labels,
  cardLabels,
  checklists,
  checklistItems,
} from '../../db/schema/index';

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

const TRELLO_COLOR_MAP: Record<string, string> = {
  green: '#22c55e',
  yellow: '#f59e0b',
  orange: '#f97316',
  red: '#ef4444',
  purple: '#a855f7',
  blue: '#3b82f6',
  sky: '#0284c7',
  lime: '#84cc16',
  pink: '#ec4899',
  black: '#334155',
};

export async function importTrelloBoard(
  db: Database,
  organizationId: string,
  projectId: string,
  trelloData: any
) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)));

  if (!project) throw httpError(404, 'Project not found');

  if (!trelloData || typeof trelloData !== 'object') {
    throw httpError(400, 'Invalid Trello JSON format');
  }

  const boardName = trelloData.name || 'Imported Trello Board';

  // 1. Create Board
  const [newBoard] = await db
    .insert(boards)
    .values({
      organizationId,
      projectId,
      name: boardName,
      background: trelloData.prefs?.backgroundColor || '#6366f1',
    })
    .returning();

  if (!newBoard) throw httpError(500, 'Failed to create board');

  // 2. Create Labels
  const labelIdMap = new Map<string, string>();
  const trelloLabels = Array.isArray(trelloData.labels) ? trelloData.labels : [];
  let labelsCount = 0;

  for (const lbl of trelloLabels) {
    if (lbl.name || lbl.color) {
      const colorHex = TRELLO_COLOR_MAP[lbl.color] || '#6366f1';
      const [createdLabel] = await db
        .insert(labels)
        .values({
          boardId: newBoard.id,
          name: lbl.name || lbl.color || 'Label',
          color: colorHex,
        })
        .returning();

      if (createdLabel && lbl.id) {
        labelIdMap.set(lbl.id, createdLabel.id);
        labelsCount++;
      }
    }
  }

  // 3. Create Lists
  const listIdMap = new Map<string, string>();
  const trelloLists = Array.isArray(trelloData.lists) ? trelloData.lists : [];
  let listsCount = 0;

  const openLists = trelloLists.filter((l: any) => !l.closed);
  for (let i = 0; i < openLists.length; i++) {
    const l = openLists[i]!;
    const [createdList] = await db
      .insert(lists)
      .values({
        boardId: newBoard.id,
        name: l.name || `List ${i + 1}`,
        position: typeof l.pos === 'number' ? l.pos : (i + 1) * 65536,
      })
      .returning();

    if (createdList && l.id) {
      listIdMap.set(l.id, createdList.id);
      listsCount++;
    }
  }

  // 4. Create Cards
  const cardIdMap = new Map<string, string>();
  const trelloCards = Array.isArray(trelloData.cards) ? trelloData.cards : [];
  let cardsCount = 0;

  const openCards = trelloCards.filter((c: any) => !c.closed);
  for (let i = 0; i < openCards.length; i++) {
    const c = openCards[i]!;
    const targetListId = listIdMap.get(c.idList);
    if (!targetListId) continue; // list not imported

    const [createdCard] = await db
      .insert(cards)
      .values({
        organizationId,
        listId: targetListId,
        title: c.name || 'Untitled Card',
        description: c.desc || null,
        position: typeof c.pos === 'number' ? c.pos : (i + 1) * 65536,
        dueDate: c.due ? new Date(c.due) : null,
      })
      .returning();

    if (createdCard) {
      cardsCount++;
      if (c.id) {
        cardIdMap.set(c.id, createdCard.id);
      }

      // Attach Labels
      if (Array.isArray(c.idLabels)) {
        for (const tid of c.idLabels) {
          const mappedLabelId = labelIdMap.get(tid);
          if (mappedLabelId) {
            await db
              .insert(cardLabels)
              .values({
                cardId: createdCard.id,
                labelId: mappedLabelId,
              })
              .onConflictDoNothing();
          }
        }
      }
    }
  }

  // 5. Create Checklists
  const trelloChecklists = Array.isArray(trelloData.checklists) ? trelloData.checklists : [];
  let checklistsCount = 0;

  for (const chk of trelloChecklists) {
    const targetCardId = cardIdMap.get(chk.idCard);
    if (!targetCardId) continue;

    const [createdChecklist] = await db
      .insert(checklists)
      .values({
        cardId: targetCardId,
        title: chk.name || 'Checklist',
        position: typeof chk.pos === 'number' ? chk.pos : 65536,
      })
      .returning();

    if (createdChecklist) {
      checklistsCount++;
      const checkItems = Array.isArray(chk.checkItems) ? chk.checkItems : [];
      for (let j = 0; j < checkItems.length; j++) {
        const item = checkItems[j]!;
        await db.insert(checklistItems).values({
          checklistId: createdChecklist.id,
          text: item.name || 'Item',
          isDone: item.state === 'complete',
          position: typeof item.pos === 'number' ? item.pos : (j + 1) * 65536,
        });
      }
    }
  }

  return {
    board: newBoard,
    stats: {
      listsCount,
      cardsCount,
      labelsCount,
      checklistsCount,
    },
  };
}

export async function importGenericTasks(
  db: Database,
  organizationId: string,
  projectId: string,
  input: ImportTasksBody
) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)));

  if (!project) throw httpError(404, 'Project not found');

  const [newBoard] = await db
    .insert(boards)
    .values({
      organizationId,
      projectId,
      name: input.boardName || 'Imported Board',
      background: '#6366f1',
    })
    .returning();

  let listsCount = 0;
  let cardsCount = 0;

  for (let i = 0; i < input.lists.length; i++) {
    const listData = input.lists[i]!;
    const [createdList] = await db
      .insert(lists)
      .values({
        boardId: newBoard!.id,
        name: listData.name,
        position: (i + 1) * 65536,
      })
      .returning();

    if (createdList) {
      listsCount++;
      const tasks = Array.isArray(listData.tasks) ? listData.tasks : [];
      for (let j = 0; j < tasks.length; j++) {
        const task = tasks[j]!;
        await db.insert(cards).values({
          organizationId,
          listId: createdList.id,
          title: task.title,
          description: task.description || null,
          storyPoints: task.storyPoints,
          dueDate: task.dueDate ? new Date(task.dueDate) : null,
          position: (j + 1) * 65536,
        });
        cardsCount++;
      }
    }
  }

  return {
    board: newBoard!,
    stats: {
      listsCount,
      cardsCount,
      labelsCount: 0,
      checklistsCount: 0,
    },
  };
}
