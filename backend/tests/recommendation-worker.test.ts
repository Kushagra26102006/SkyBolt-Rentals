import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Worker } from 'bullmq';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { EphemeralRedisServer } from './helpers/test-redis.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { connectRedis, closeRedis } from '../src/config/redis.js';
import { BookingModel } from '../src/models/booking.model.js';
import { UserModel } from '../src/models/user.model.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { queueRegistry, QueueName } from '../src/queues/queue.registry.js';
import { getBullMQConnection } from '../src/queues/queue.config.js';
import {
  processRecommendationJob,
  RecommendationJobData
} from '../src/queues/processors/recommendation.processor.js';
import { cacheService } from '../src/services/cache.service.js';

describe('TASK 16: BullMQ Recommendation Worker & Background Learning Jobs', () => {
  let mongoServer: EphemeralMongoServer;
  let redisServer: EphemeralRedisServer;
  let redisUrl: string;
  let testMongoUri: string;
  let testUserId: string;
  let testVehicleId: string;
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

    // Seed test user
    const user = await UserModel.create({
      name: 'Worker Test User',
      email: 'workertest@skybolt.test',
      passwordHash: 'hash12345678901234567890',
      phone: '+91 9999988888',
      role: 'CUSTOMER',
      status: 'ACTIVE'
    });
    testUserId = user._id.toString();

    // Seed test vehicle
    const vehicle = await VehicleModel.create({
      vehicleCode: 'SKY-WORKER-01',
      registrationNumber: 'PB-10-XY-9999',
      brand: 'Hyundai',
      model: 'Creta',
      name: 'Creta SX',
      year: 2023,
      category: 'SUV',
      status: 'ACTIVE',
      specifications: { seats: 5, transmission: 'AUTOMATIC', fuelType: 'PETROL' },
      rental: { baseRate: 3200, currency: 'INR', deposit: 5000 },
      location: { name: 'Ludhiana Central', city: 'Ludhiana' }
    });
    testVehicleId = vehicle._id.toString();

    // Create completed bookings for popularity calculation
    await BookingModel.create({
      bookingReference: 'BK-WORKER-01',
      userId: user._id,
      vehicleId: vehicle._id,
      status: 'COMPLETED',
      pickupAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      returnAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      pickupLocation: { name: 'Ludhiana Central' },
      returnLocation: { name: 'Ludhiana Central' },
      vehicleSnapshot: {
        brand: 'Hyundai',
        model: 'Creta',
        name: 'Creta SX',
        category: 'SUV',
        image: 'assets/images/hero-bg.webp',
        registrationNumber: 'PB-10-XY-9999'
      },
      pricingSnapshot: {
        currency: 'INR',
        baseAmount: 9600,
        subtotal: 9600,
        tax: 1728,
        discount: 0,
        fees: 0,
        total: 11328,
        pricingVersion: 'v2_engine'
      },
      createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000)
    });
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

  it('should process aggregate-popularity job and cache popularity metrics in Redis', async () => {
    const mockJob: any = {
      id: 'job-agg-pop-1',
      data: {
        action: 'aggregate-popularity'
      } as RecommendationJobData
    };

    const res = await processRecommendationJob(mockJob);
    expect(res.success).toBe(true);
    expect(res.message).toContain('Successfully aggregated popularity metrics');

    // Verify cache entry in Redis
    const cachedMap = await cacheService.get<Record<string, { bookingCount: number }>>('rec:popularity_map');
    expect(cachedMap).toBeDefined();
    expect(cachedMap![testVehicleId]).toBeDefined();
    expect(cachedMap![testVehicleId].bookingCount).toBeGreaterThanOrEqual(1);
  });

  it('should process refresh-category-stats job and cache category stats in Redis', async () => {
    const mockJob: any = {
      id: 'job-refresh-cat-1',
      data: {
        action: 'refresh-category-stats'
      } as RecommendationJobData
    };

    const res = await processRecommendationJob(mockJob);
    expect(res.success).toBe(true);
    expect(res.message).toContain('Successfully refreshed statistics');

    // Verify cache entry in Redis
    const cachedStats = await cacheService.get<Record<string, number>>('rec:category_stats');
    expect(cachedStats).toBeDefined();
    expect(cachedStats!['SUV']).toBeGreaterThanOrEqual(1);
  });

  it('should handle unknown recommendation actions gracefully without throwing', async () => {
    const mockJob: any = {
      id: 'job-unknown-1',
      data: {
        action: 'non-existent-action' as any
      }
    };

    const res = await processRecommendationJob(mockJob);
    expect(res.success).toBe(false);
    expect(res.message).toContain('Unknown recommendation action');
  });

  it('should enqueue and process job asynchronously via BullMQ recommendation queue', async () => {
    const queue = queueRegistry.getRecommendationQueue();

    // Start a worker for the recommendation queue
    worker = new Worker(
      QueueName.RECOMMENDATION,
      async (job) => {
        return await processRecommendationJob(job as any);
      },
      {
        connection: getBullMQConnection(),
        prefix: 'skybolt:bull'
      }
    );

    const job = await queue.add('test-rec-job', {
      action: 'aggregate-popularity'
    });

    expect(job.id).toBeDefined();

    // Wait for the worker to process the job
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Recommendation job timeout')), 5000);
      worker!.on('completed', (completedJob) => {
        if (completedJob.id === job.id) {
          clearTimeout(timeout);
          resolve();
        }
      });
      worker!.on('failed', (_failedJob, err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const counts = await queue.getJobCounts('completed', 'failed');
    expect(counts.completed).toBeGreaterThanOrEqual(1);
  });
});
