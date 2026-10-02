import type { Database } from '../db/index';
import { setupNotificationListeners } from '../modules/notifications/service';
import { setupWebhookDispatcher } from '../modules/webhooks/service';
import { setupAutomationEngine } from '../modules/automations/service';
import { setupProjectAutomationEngine } from '../modules/automations/project-engine';
import { startRetentionJob } from '../modules/audit/retention';
import { startRefreshTokenCleanup } from '../modules/auth/cleanup';
import { startScanWorker } from '../modules/media/scan';
import { startMediaGC } from '../modules/media/gc';
import { logger } from './logger';

/**
 * Singleton service orchestrating background worker lifecycle, event listeners, and maintenance intervals.
 */
export class WorkerService {
  private static instance: WorkerService | null = null;
  private cleanupFns: Array<() => void> = [];
  private isRunning = false;

  private constructor() {}

  public static getInstance(): WorkerService {
    if (!WorkerService.instance) {
      WorkerService.instance = new WorkerService();
    }
    return WorkerService.instance;
  }

  /**
   * Starts event listeners, automation engines, and recurring background housekeeping jobs.
   */
  public start(database: Database): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. Setup real-time event listeners & dispatchers
    setupNotificationListeners(database);
    setupWebhookDispatcher(database);
    setupAutomationEngine(database);
    setupProjectAutomationEngine(database);

    // 2. Start recurring background housekeeping intervals
    this.cleanupFns.push(startRetentionJob(database));
    this.cleanupFns.push(startRefreshTokenCleanup(database));
    this.cleanupFns.push(startScanWorker(database));
    this.cleanupFns.push(startMediaGC(database));

    logger.info({}, 'Background workers and event listeners initialized');
  }

  /**
   * Gracefully stops all active background housekeeping jobs and workers.
   */
  public stop(): void {
    for (const cleanup of this.cleanupFns) {
      try {
        cleanup();
      } catch (err) {
        logger.warn({ err }, 'Error stopping worker cleanup job');
      }
    }
    this.cleanupFns = [];
    this.isRunning = false;
    logger.info({}, 'Background workers stopped cleanly');
  }
}

export const workerService = WorkerService.getInstance();
