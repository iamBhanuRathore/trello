import { defaultDropAnimationSideEffects, type DropAnimation } from '@dnd-kit/core';

export interface KanbanCard {
  id: string;
  key?: string | null;
  taskNumber?: number | null;
  projectKey?: string | null;
  title: string;
  description?: string | null;
  listId: string;
  position: number;
  version?: number;
  dueDate?: string | null;
  storyPoints?: number | null;
  estimateMinutes?: number | null;
  stage?: { id: string; name: string; color: string; category: string } | null;
  priorityId?: string | null;
  priority?: { id: string; name: string; color: string } | null;
  labels?: { id: string; name: string; color: string }[];
  assignee?: { id: string; name: string; email: string; avatarUrl?: string } | null;
  assignees?: { id: string; name: string; email: string; avatarUrl?: string }[];
  checklistTotal?: number;
  checklistDone?: number;
  commentsCount?: number;
  attachmentsCount?: number;
}

export interface KanbanList {
  id: string;
  name: string;
  position: number;
  version?: number;
  cards: KanbanCard[];
}

/** Average card tile height — seeds the virtualizer before first measurement. */
export const CARD_ESTIMATED_HEIGHT = 104;

/** Below this many cards, plain rendering is cheaper than a virtualizer. */
export const VIRTUALIZE_THRESHOLD = 20;

export const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.4',
      },
    },
  }),
  duration: 200,
  easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
};
