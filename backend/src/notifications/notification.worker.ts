import { config } from '../config/env.config.js';
import { notificationRepository } from './notification.repository.js';
import { notificationService } from './notification.service.js';
import { NotificationEnqueueJob, NotificationStatus } from './notification.types.js';

export class NotificationWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isRunning = false;
  private pollIntervalMs: number;

  constructor(pollIntervalMs?: number) {
    this.pollIntervalMs = pollIntervalMs || config.notifications.outboxPollIntervalMs || 5000;
  }

  /**
   * Start the background worker loop.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    if (!config.isTest) {
      console.log(`[SkyBolt Notification Worker] Started with poll interval ${this.pollIntervalMs}ms`);
    }

    this.scheduleNextTick();
  }

  /**
   * Stop the background worker loop cleanly.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Process a single cycle of outbox items.
   * Exposed for testing and scheduled ticks.
   */
  public async processBatch(limit = 10): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    let processedCount = 0;

    try {
      // First, recover any stale locked entries
      await notificationRepository.unlockStaleOutboxEntries(60000);

      // Process up to limit entries
      for (let i = 0; i < limit; i++) {
        const outboxEntry = await notificationRepository.lockNextPendingOutboxEntry();
        if (!outboxEntry) {
          break; // No more pending jobs ready for execution
        }

        try {
          const payload = outboxEntry.payload as NotificationEnqueueJob;
          const results = await notificationService.processJob(payload);

          const hasFailure = results.some((r) => r.status === NotificationStatus.FAILED);
          const hasPendingRetry = results.some((r) => r.status === NotificationStatus.PENDING);

          if (hasPendingRetry) {
            // Re-queue outbox entry with nextAttemptAt
            const maxRetries = config.notifications.maxRetries;
            const currentAttempts = (outboxEntry.attemptCount || 0) + 1;

            if (currentAttempts < maxRetries) {
              const baseDelay = config.notifications.retryBaseDelayMs;
              const delay = baseDelay * Math.pow(2, currentAttempts - 1) + Math.floor(Math.random() * 300);
              const nextAttemptAt = new Date(Date.now() + delay);
              await notificationRepository.markOutboxAttempt(outboxEntry._id.toString(), 'Some channels failed; scheduled for retry', nextAttemptAt);
            } else {
              await notificationRepository.markOutboxAttempt(outboxEntry._id.toString(), 'Max retries exceeded', null);
            }
          } else if (hasFailure) {
            await notificationRepository.markOutboxAttempt(outboxEntry._id.toString(), 'Channel delivery failed permanently', null);
          } else {
            // Successfully processed all channels
            await notificationRepository.markOutboxProcessed(outboxEntry._id.toString());
          }

          processedCount++;
        } catch (jobErr: any) {
          await notificationRepository.markOutboxAttempt(
            outboxEntry._id.toString(),
            jobErr?.message || 'Unexpected job execution error',
            null
          );
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  private scheduleNextTick(): void {
    if (!this.isRunning) return;

    this.timer = setTimeout(async () => {
      try {
        await this.processBatch();
      } catch (err) {
        if (!config.isTest) {
          console.error('[SkyBolt Notification Worker] Tick error:', err);
        }
      } finally {
        this.scheduleNextTick();
      }
    }, this.pollIntervalMs);
  }
}

export const notificationWorker = new NotificationWorker();
