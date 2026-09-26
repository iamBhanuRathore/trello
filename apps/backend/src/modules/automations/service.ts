import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { automations } from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { eventBus } from '../../lib/event-bus';
import { logger } from '../../lib/logger';
import { attachLabelToCard, assignUserToCard, isValidUuid } from '../cards/service';

interface AutomationTrigger {
  type?: string;
  listId?: string;
  [key: string]: unknown;
}

interface AutomationAction {
  type?: string;
  labelId?: string;
  userId?: string;
  [key: string]: unknown;
}

interface AutomationEventPayload {
  boardId?: string;
  listId?: string;
  cardId?: string;
  [key: string]: unknown;
}

export async function listAutomations(db: Database, boardId: string) {
  return db.select().from(automations).where(eq(automations.boardId, boardId));
}

export async function createAutomation(
  db: Database,
  boardId: string,
  input: { name: string; triggerJson: unknown; actionJson: unknown }
) {
  const [automation] = await db
    .insert(automations)
    .values({
      boardId,
      name: input.name,
      triggerJson: input.triggerJson,
      actionJson: input.actionJson,
    })
    .returning();
  return automation;
}

export async function updateAutomation(
  db: Database,
  boardId: string,
  id: string,
  input: { name?: string; triggerJson?: unknown; actionJson?: unknown; isEnabled?: boolean }
) {
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
  eventBus.on(
    'internal',
    async (data: { event: string; payload: unknown; actorId: string; organizationId: string }) => {
      try {
        const { event, actorId } = data;
        const payload = data.payload as AutomationEventPayload;

        // We only support board-level automations. If event doesn't have boardId, skip.
        if (!payload.boardId || !isValidUuid(payload.boardId)) return;

        const boardAutomations = await db
          .select()
          .from(automations)
          .where(and(eq(automations.boardId, payload.boardId), eq(automations.isEnabled, true)));

        for (const auto of boardAutomations) {
          const trigger = auto.triggerJson as AutomationTrigger;
          const action = auto.actionJson as AutomationAction;

          // Evaluate Trigger
          let triggerMatched = false;
          if (trigger.type === 'card_moved' && event === 'card.moved') {
            if (trigger.listId === payload.listId) {
              triggerMatched = true;
            }
          }

          if (triggerMatched) {
            logger.info({ automationId: auto.id, name: auto.name }, 'Automation trigger matched');
            // Execute Action
            try {
              if (
                action.type === 'add_label' &&
                isValidUuid(payload.cardId) &&
                isValidUuid(action.labelId)
              ) {
                await attachLabelToCard(
                  db,
                  payload.cardId as string,
                  action.labelId as string,
                  actorId
                );
                logger.info(
                  { automationId: auto.id, labelId: action.labelId },
                  'Automation action executed: add_label'
                );
              } else if (
                action.type === 'assign_user' &&
                isValidUuid(payload.cardId) &&
                isValidUuid(action.userId)
              ) {
                await assignUserToCard(
                  db,
                  payload.cardId as string,
                  action.userId as string,
                  actorId
                );
                logger.info(
                  { automationId: auto.id, userId: action.userId },
                  'Automation action executed: assign_user'
                );
              }
            } catch (actionErr) {
              logger.error({ err: actionErr, automationId: auto.id }, 'Automation action failed');
            }
          }
        }
      } catch (err) {
        logger.error({ err }, 'Error in automation engine');
      }
    }
  );
}
