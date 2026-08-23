import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { automations } from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { eventBus } from '../../lib/event-bus';
import { attachLabelToCard, assignUserToCard } from '../cards/service';

export async function listAutomations(db: Database, boardId: string) {
  return db.select().from(automations).where(eq(automations.boardId, boardId));
}

export async function createAutomation(db: Database, boardId: string, input: { name: string; triggerJson: any; actionJson: any }) {
  const [automation] = await db.insert(automations).values({
    boardId,
    name: input.name,
    triggerJson: input.triggerJson,
    actionJson: input.actionJson,
  }).returning();
  return automation;
}

export async function updateAutomation(db: Database, boardId: string, id: string, input: { name?: string; triggerJson?: any; actionJson?: any; isEnabled?: boolean }) {
  const [automation] = await db
    .update(automations)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(automations.id, id), eq(automations.boardId, boardId)))
    .returning();
  if (!automation) throw httpError(404, 'Automation not found');
  return automation;
}

export async function deleteAutomation(db: Database, boardId: string, id: string) {
  const [automation] = await db
    .delete(automations)
    .where(and(eq(automations.id, id), eq(automations.boardId, boardId)))
    .returning();
  if (!automation) throw httpError(404, 'Automation not found');
  return { success: true };
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export function setupAutomationEngine(db: Database) {
  eventBus.on('internal', async (data: { event: string; payload: any; actorId: string; organizationId: string }) => {
    try {
      const { event, payload, actorId } = data;
      
      // We only support board-level automations. If event doesn't have boardId, skip.
      if (!payload.boardId) return;

      const boardAutomations = await db
        .select()
        .from(automations)
        .where(and(eq(automations.boardId, payload.boardId), eq(automations.isEnabled, true)));

      for (const auto of boardAutomations) {
        const trigger = auto.triggerJson as any;
        const action = auto.actionJson as any;
        
        // Evaluate Trigger
        let triggerMatched = false;
        if (trigger.type === 'card_moved' && event === 'card.moved') {
          if (trigger.listId === payload.listId) {
            triggerMatched = true;
          }
        }
        
        if (triggerMatched) {
          console.log(`[Automation] Trigger matched for automation: ${auto.name}`);
          // Execute Action
          try {
            if (action.type === 'add_label') {
              await attachLabelToCard(db, payload.cardId, action.labelId, actorId);
              console.log(`[Automation] Action executed: add_label ${action.labelId}`);
            } else if (action.type === 'assign_user') {
              await assignUserToCard(db, payload.cardId, action.userId, actorId);
              console.log(`[Automation] Action executed: assign_user ${action.userId}`);
            }
          } catch (actionErr) {
            console.error(`[Automation] Failed to execute action for automation ${auto.id}:`, actionErr);
          }
        }
      }
    } catch (err) {
      console.error('Error in automation engine:', err);
    }
  });
}
