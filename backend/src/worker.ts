import { Worker, WorkerOptions } from 'bullmq';
import { config } from './config/env.config.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { connectRedis, closeRedis } from './config/redis.js';
import { getBullMQConnection } from './queues/queue.config.js';
import { QueueName, queueRegistry } from './queues/queue.registry.js';
import { processNotificationJob } from './queues/processors/notification.processor.js';
import { processBookingJob } from './queues/processors/booking.processor.js';
import { processMaintenanceJob } from './queues/processors/maintenance.processor.js';
import { processReconciliationJob } from './queues/processors/reconciliation.processor.js';
import { processRecommendationJob } from './queues/processors/recommendation.processor.js';
import { schedulerService } from './queues/scheduler.service.js';
import { ErrorTracker } from './utils/error-tracker.js';

let workers: Worker[] = [];
let isShuttingDown = false;

function createWorkerOptions(concurrency = 5): WorkerOptions {
  return {
    connection: getBullMQConnection(),
    concurrency,
    prefix: config.redis.keyPrefix ? `${config.redis.keyPrefix}bull` : 'skybolt:bull'
  };
}

async function startWorker(): Promise<void> {
  console.log('🚀 [SkyBolt Worker] Starting background worker process...');

  // 1. Connect MongoDB (Authoritative DB)
  await connectDatabase();
  console.log('✅ [SkyBolt Worker] Connected to MongoDB');

  // 2. Connect Redis
  const redisOk = await connectRedis();
  if (!redisOk) {
    console.warn('⚠️ [SkyBolt Worker] Redis is unavailable. Background worker cannot proceed.');
    process.exit(1);
  }
  console.log('✅ [SkyBolt Worker] Connected to Redis');

  // 3. Initialize Workers
  const notificationWorker = new Worker(
    QueueName.NOTIFICATION,
    processNotificationJob,
    createWorkerOptions(10) // High concurrency for notifications
  );

  const bookingWorker = new Worker(
    QueueName.BOOKING,
    processBookingJob,
    createWorkerOptions(5)
  );

  const maintenanceWorker = new Worker(
    QueueName.MAINTENANCE,
    processMaintenanceJob,
    createWorkerOptions(2)
  );

  const reconciliationWorker = new Worker(
    QueueName.RECONCILIATION,
    processReconciliationJob,
    createWorkerOptions(2)
  );

  const recommendationWorker = new Worker(
    QueueName.RECOMMENDATION,
    processRecommendationJob,
    createWorkerOptions(2)
  );

  workers = [notificationWorker, bookingWorker, maintenanceWorker, reconciliationWorker, recommendationWorker];

  // 4. Attach Observability & Error Handlers
  workers.forEach((worker) => {
    worker.on('completed', (job) => {
      console.log(`[SkyBolt Worker] Job ${job.id} completed on queue "${worker.name}"`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[SkyBolt Worker] Job ${job?.id} failed on queue "${worker.name}": ${err?.message}`);
      ErrorTracker.captureException(err, {
        component: 'WORKER',
        extra: {
          queueName: worker.name,
          jobId: job?.id,
          jobName: job?.name,
          attemptsMade: job?.attemptsMade
        }
      });
    });

    worker.on('error', (err) => {
      console.error(`[SkyBolt Worker] Error on queue "${worker.name}": ${err?.message}`);
      ErrorTracker.captureException(err, {
        component: 'WORKER',
        extra: { queueName: worker.name }
      });
    });
  });

  // 5. Initialize repeatable scheduler
  await schedulerService.initScheduledJobs();

  console.log(`✨ [SkyBolt Worker] All ${workers.length} workers and scheduler active and listening.`);
}

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 [SkyBolt Worker] Received ${signal}. Starting graceful shutdown...`);

  // 1. Close all workers (allow in-flight jobs to complete)
  console.log('[SkyBolt Worker] Closing workers...');
  await Promise.all(workers.map((w) => w.close()));

  // 2. Close queue instances
  console.log('[SkyBolt Worker] Closing queues...');
  await queueRegistry.closeAllQueues();

  // 3. Close Redis
  console.log('[SkyBolt Worker] Closing Redis client...');
  await closeRedis();

  // 4. Close MongoDB
  console.log('[SkyBolt Worker] Closing MongoDB connection...');
  await disconnectDatabase();

  console.log('👋 [SkyBolt Worker] Graceful shutdown complete. Exiting.');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start worker process
startWorker().catch((err) => {
  console.error('💥 [SkyBolt Worker] Fatal initialization error:', err);
  process.exit(1);
});
