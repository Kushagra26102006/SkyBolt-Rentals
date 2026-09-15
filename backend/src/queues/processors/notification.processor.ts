import { Job } from 'bullmq';
import { notificationService } from '../../notifications/notification.service.js';
import { NotificationEnqueueJob } from '../../notifications/notification.types.js';
import { config } from '../../config/env.config.js';

/**
 * Worker processor for the Notification Queue.
 * Dispatches asynchronous transactional email & SMS notifications with retries.
 */
export async function processNotificationJob(job: Job<NotificationEnqueueJob>): Promise<any> {
  const payload = job.data;

  if (!config.isTest) {
    console.log(`[SkyBolt Worker] Processing notification job ${job.id} (type: ${payload.type})`);
  }

  const results = await notificationService.processJob(payload);

  const hasSuccess = results.some((r) => r.success);
  const allTransient = results.every((r) => r.isTransient);

  if (!hasSuccess && allTransient && results.length > 0) {
    // Throw error to trigger BullMQ exponential backoff retry for transient provider outages
    throw new Error(`Transient delivery failure for notification job ${job.id}: ${results.map((r) => r.error).join('; ')}`);
  }

  // Mark transactional outbox record processed in MongoDB
  if (payload.outboxId) {
    const { notificationRepository } = await import('../../notifications/notification.repository.js');
    await notificationRepository.markOutboxProcessed(payload.outboxId).catch(() => {});
  }

  return {
    success: hasSuccess,
    channels: results.map((r) => ({ channel: r.channel, status: r.status, id: r.notificationId }))
  };
}
