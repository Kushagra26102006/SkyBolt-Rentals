import { queueRegistry } from './queue.registry.js';
import { config } from '../config/env.config.js';

export class SchedulerService {
  private isInitialized = false;

  /**
   * Register distributed repeatable jobs in BullMQ.
   * Multi-instance safe: BullMQ coordinates leadership across multiple worker processes.
   */
  public async initScheduledJobs(): Promise<void> {
    if (!config.queues.enabled || this.isInitialized) {
      return;
    }

    try {
      const bookingQueue = queueRegistry.getBookingQueue();
      const reconciliationQueue = queueRegistry.getReconciliationQueue();
      const maintenanceQueue = queueRegistry.getMaintenanceQueue();

      // 1. Expired booking cleanup: every 5 minutes
      await bookingQueue.upsertJobScheduler(
        'sched_expired-booking-cleanup',
        { every: 5 * 60 * 1000 },
        {
          name: 'expired-booking-cleanup',
          data: { type: 'EXPIRED_CLEANUP' }
        }
      );

      // 2. Payment reconciliation scan: every 30 minutes
      await reconciliationQueue.upsertJobScheduler(
        'sched_pending-payment-scan',
        { every: 30 * 60 * 1000 },
        {
          name: 'pending-payment-scan',
          data: { type: 'PENDING_PAYMENT_SCAN', thresholdMinutes: 15 }
        }
      );

      // 3. Maintenance due check: daily
      await maintenanceQueue.upsertJobScheduler(
        'sched_maintenance-check',
        { every: 24 * 60 * 60 * 1000 },
        {
          name: 'maintenance-check',
          data: { type: 'SERVICE_DUE_CHECK' }
        }
      );

      // 4. Recommendation popularity aggregation: every 1 hour
      const recommendationQueue = queueRegistry.getRecommendationQueue();
      await recommendationQueue.upsertJobScheduler(
        'sched_recommendation-popularity-agg',
        { every: 60 * 60 * 1000 },
        {
          name: 'aggregate-popularity',
          data: { action: 'aggregate-popularity' }
        }
      );

      this.isInitialized = true;
      if (!config.isTest) {
        console.log('[SkyBolt Scheduler] Repeatable background jobs registered successfully.');
      }
    } catch (err: any) {
      if (!config.isTest) {
        console.warn(`[SkyBolt Scheduler] Could not register repeatable jobs: ${err?.message}`);
      }
    }
  }
}

export const schedulerService = new SchedulerService();
export default schedulerService;
