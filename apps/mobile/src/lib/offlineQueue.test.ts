import { describe, it, expect, beforeEach } from 'bun:test';
import { offlineQueue, OfflineAction } from './offlineQueue';

describe('Mobile Offline Action Queue', () => {
  beforeEach(() => {
    offlineQueue.clearQueue();
  });

  it('should enqueue actions and update pending count', () => {
    expect(offlineQueue.getPendingCount()).toBe(0);

    const action = offlineQueue.enqueue('ADD_COMMENT', {
      cardId: 'card-1',
      text: 'Great progress on this task!',
    });

    expect(action.id.startsWith('offline_')).toBe(true);
    expect(action.type).toBe('ADD_COMMENT');
    expect(offlineQueue.getPendingCount()).toBe(1);
  });

  it('should replay queue successfully and clear succeeded items', async () => {
    offlineQueue.enqueue('CREATE_CARD', { listId: 'list-1', title: 'Offline Task 1' });
    offlineQueue.enqueue('TOGGLE_CHECKLIST', { cardId: 'c-1', itemId: 'i-1', isCompleted: true });

    expect(offlineQueue.getPendingCount()).toBe(2);

    const executedActions: string[] = [];
    const results = await offlineQueue.replayQueue(async (action: OfflineAction) => {
      executedActions.push(action.type);
      return { success: true };
    });

    expect(results.succeeded).toBe(2);
    expect(results.failed).toBe(0);
    expect(executedActions).toEqual(['CREATE_CARD', 'TOGGLE_CHECKLIST']);
    expect(offlineQueue.getPendingCount()).toBe(0);
  });

  it('should handle failed actions and retain them for retry', async () => {
    offlineQueue.enqueue('MOVE_CARD', { cardId: 'c-1', listId: 'list-2' });

    const results = await offlineQueue.replayQueue(async () => {
      throw new Error('Network timeout');
    });

    expect(results.succeeded).toBe(0);
    expect(results.failed).toBe(1);
    expect(offlineQueue.getPendingCount()).toBe(1);

    const queue = offlineQueue.getQueue();
    expect(queue[0]!.status).toBe('failed');
    expect(queue[0]!.retryCount).toBe(1);
    expect(queue[0]!.errorMessage).toBe('Network timeout');
  });
});
