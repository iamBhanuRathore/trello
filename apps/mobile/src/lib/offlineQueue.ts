export type OfflineActionType =
  | 'CREATE_CARD'
  | 'MOVE_CARD'
  | 'ADD_COMMENT'
  | 'TOGGLE_CHECKLIST'
  | 'UPDATE_CARD';

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: any;
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed';
  errorMessage?: string;
}

class OfflineQueueManager {
  private queue: OfflineAction[] = [];
  private listeners: Array<(queue: OfflineAction[]) => void> = [];
  private isSyncing = false;

  constructor() {
    this.loadQueue();
  }

  private loadQueue() {
    // In-memory + storage fallback
    this.queue = [];
  }

  public getQueue(): OfflineAction[] {
    return [...this.queue];
  }

  public getPendingCount(): number {
    return this.queue.filter((a) => a.status === 'pending' || a.status === 'failed').length;
  }

  public subscribe(listener: (queue: OfflineAction[]) => void) {
    this.listeners.push(listener);
    listener(this.getQueue());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    const q = this.getQueue();
    this.listeners.forEach((l) => l(q));
  }

  public enqueue(type: OfflineActionType, payload: any): OfflineAction {
    const action: OfflineAction = {
      id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      type,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending',
    };

    this.queue.push(action);
    this.notify();
    return action;
  }

  public async replayQueue(executor: (action: OfflineAction) => Promise<any>): Promise<{
    succeeded: number;
    failed: number;
  }> {
    if (this.isSyncing || this.queue.length === 0) {
      return { succeeded: 0, failed: 0 };
    }

    this.isSyncing = true;
    let succeeded = 0;
    let failed = 0;

    const remainingQueue: OfflineAction[] = [];

    for (const action of this.queue) {
      action.status = 'syncing';
      this.notify();

      try {
        await executor(action);
        succeeded++;
      } catch (err: any) {
        failed++;
        action.status = 'failed';
        action.retryCount += 1;
        action.errorMessage = err?.message || 'Sync failed';
        remainingQueue.push(action);
      }
    }

    this.queue = remainingQueue;
    this.isSyncing = false;
    this.notify();

    return { succeeded, failed };
  }

  public clearQueue() {
    this.queue = [];
    this.notify();
  }
}

export const offlineQueue = new OfflineQueueManager();
