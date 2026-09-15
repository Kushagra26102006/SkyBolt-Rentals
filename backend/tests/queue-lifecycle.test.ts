import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Worker } from 'bullmq';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { EphemeralRedisServer } from './helpers/test-redis.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { connectRedis, closeRedis, isRedisConnected } from '../src/config/redis.js';
import { queueRegistry, QueueName } from '../src/queues/queue.registry.js';
import { getBullMQConnection } from '../src/queues/queue.config.js';
import { processNotificationJob } from '../src/queues/processors/notification.processor.js';
import { notificationService } from '../src/notifications/notification.service.js';
import {
  NotificationType,
  NotificationChannel,
  NotificationPriority
} from '../src/notifications/notification.types.js';
import { UserModel } from '../src/models/user.model.js';

describe('TASK 15: BullMQ Queue Lifecycle, Worker Execution & Idempotency', () => {
  let mongoServer: EphemeralMongoServer;
  let redisServer: EphemeralRedisServer;
  let redisUrl: string;
  let testMongoUri: string;
  let testUserId: string;
  let worker: Worker | null = null;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    redisServer = new EphemeralRedisServer();
    redisUrl = await redisServer.start();
    process.env.REDIS_URL = redisUrl;
    await closeRedis();
    await connectRedis();

    // Create a real user in MongoDB
    const user = await UserModel.create({
      name: 'Queue Test User',
      email: 'queueuser@skybolt.test',
      passwordHash: 'hash12345678901234567890',
      phone: '+91 9876543210',
      role: 'CUSTOMER',
      status: 'ACTIVE'
    });
    testUserId = user._id.toString();
  });

  afterAll(async () => {
    if (worker) {
      await worker.close();
    }
    await queueRegistry.closeAllQueues();
    await closeRedis();
    await redisServer.stop();
    await disconnectDatabase();
    await mongoServer.stop();
    delete process.env.REDIS_URL;
  });

  it('Enqueuing a notification job places it into BullMQ with minimal payload and deterministic ID', async () => {
    const queue = queueRegistry.getNotificationQueue();

    const { outboxId } = await notificationService.enqueue({
      type: NotificationType.BOOKING_CONFIRMED,
      channels: [NotificationChannel.EMAIL],
      userId: testUserId,
      priority: NotificationPriority.HIGH,
      templateData: {
        bookingId: 'BK-QUEUE-001',
        vehicleName: 'Tesla Model 3',
        totalAmount: '₹4,500'
      }
    });

    expect(outboxId).toBeDefined();

    // Verify job in BullMQ
    const waitingJobs = await queue.getJobs(['waiting', 'active', 'completed', 'prioritized', 'delayed']);
    expect(waitingJobs.length).toBeGreaterThan(0);
    const lastJob = waitingJobs[waitingJobs.length - 1];
    expect(lastJob.data.type).toBe(NotificationType.BOOKING_CONFIRMED);
    expect(lastJob.data.userId).toBe(testUserId);
    expect(lastJob.data.outboxId).toBe(outboxId);
  });

  it('Worker processes the enqueued job asynchronously to completion', async () => {
    const queue = queueRegistry.getNotificationQueue();

    // Start a worker to process the job
    worker = new Worker(
      QueueName.NOTIFICATION,
      processNotificationJob,
      {
        connection: getBullMQConnection(),
        concurrency: 1,
        prefix: 'skybolt:bull'
      }
    );

    // Wait for job to be processed
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(); // proceed to assert
      }, 3000);

      worker!.on('completed', () => {
        clearTimeout(timeout);
        resolve();
      });

      worker!.on('failed', (_job, err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Check counts
    const counts = await queue.getJobCounts('completed', 'failed');
    expect(counts.completed).toBeGreaterThanOrEqual(1);
  });

  it('Queue metrics reflect accurate real-time queue states', async () => {
    const metrics = await queueRegistry.getAllQueueMetrics();
    expect(Array.isArray(metrics)).toBe(true);
    expect(metrics.length).toBe(5);

    const notifMetric = metrics.find((m) => m.queueName === QueueName.NOTIFICATION);
    expect(notifMetric).toBeDefined();
    expect(notifMetric?.completed).toBeGreaterThanOrEqual(1);

    const recMetric = metrics.find((m) => m.queueName === QueueName.RECOMMENDATION);
    expect(recMetric).toBeDefined();
  });

  it('Job Idempotency: deterministic jobId prevents duplicate job execution in BullMQ', async () => {
    const queue = queueRegistry.getNotificationQueue();
    const deterministicId = 'notif_idempotency_test_123';

    // Add first job
    const job1 = await queue.add('test-job', { foo: 'bar' }, { jobId: deterministicId });
    expect(job1.id).toBe(deterministicId);

    // Attempting to add duplicate job with identical jobId does not create a duplicate
    const job2 = await queue.add('test-job', { foo: 'bar' }, { jobId: deterministicId });
    expect(job2.id).toBe(deterministicId);

    const jobs = await queue.getJobs(['waiting', 'active', 'completed', 'prioritized', 'delayed']);
    const matches = jobs.filter((j) => j.id === deterministicId);
    expect(matches.length).toBe(1);
  });
});
