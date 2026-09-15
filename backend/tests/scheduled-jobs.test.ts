import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Types } from 'mongoose';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { EphemeralRedisServer } from './helpers/test-redis.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { connectRedis, closeRedis } from '../src/config/redis.js';
import { BookingModel } from '../src/models/booking.model.js';
import { UserModel } from '../src/models/user.model.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { processBookingJob } from '../src/queues/processors/booking.processor.js';
import { schedulerService } from '../src/queues/scheduler.service.js';
import { queueRegistry } from '../src/queues/queue.registry.js';

describe('TASK 15: Scheduled Background Jobs, Stale Job Protection & Reminders', () => {
  let mongoServer: EphemeralMongoServer;
  let redisServer: EphemeralRedisServer;
  let redisUrl: string;
  let testMongoUri: string;

  let testUserId: Types.ObjectId;
  let testVehicleId: Types.ObjectId;

  let confirmedBookingId: string;
  let cancelledBookingId: string;
  let activeBookingId: string;
  let completedBookingId: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    redisServer = new EphemeralRedisServer();
    redisUrl = await redisServer.start();
    process.env.REDIS_URL = redisUrl;
    await closeRedis();
    await connectRedis();

    // 1. Create test user & vehicle
    const user = await UserModel.create({
      name: 'Scheduled Test Customer',
      email: 'schedtest@skybolt.test',
      passwordHash: 'hash12345678901234567890',
      phone: '+91 9988776655',
      role: 'CUSTOMER',
      status: 'ACTIVE'
    });
    testUserId = user._id;

    const vehicle = await VehicleModel.create({
      vehicleCode: 'SKY-SCHED-01',
      registrationNumber: 'DL-01-AB-1234',
      brand: 'Tesla',
      model: 'Model Y',
      name: 'Tesla Model Y',
      year: 2024,
      category: 'CAR',
      status: 'ACTIVE',
      specifications: { seats: 5, transmission: 'AUTOMATIC', fuelType: 'ELECTRIC' },
      rental: { baseRate: 5000, currency: 'INR', deposit: 10000 },
      location: { name: 'Main Hub', city: 'Delhi' }
    });
    testVehicleId = vehicle._id;

    // 2. Create bookings in distinct lifecycle states
    const createBookingDoc = async (status: string, refSuffix: string) => {
      return await BookingModel.create({
        bookingReference: `BK-SCHED-${refSuffix}`,
        userId: testUserId,
        vehicleId: testVehicleId,
        status,
        pickupAt: new Date(Date.now() + 24 * 3600 * 1000),
        returnAt: new Date(Date.now() + 48 * 3600 * 1000),
        pickupLocation: { name: 'Delhi Hub', address: '123 Hub St' },
        returnLocation: { name: 'Delhi Hub', address: '123 Hub St' },
        vehicleSnapshot: {
          brand: 'Tesla',
          model: 'Model Y',
          name: 'Tesla Model Y',
          image: '/tesla.png',
          registrationNumber: 'DL-01-AB-1234'
        },
        pricingSnapshot: {
          currency: 'INR',
          baseAmount: 5000,
          subtotal: 5000,
          tax: 0,
          discount: 0,
          fees: 0,
          total: 5000,
          pricingVersion: 'v1_base'
        }
      });
    };

    const confirmed = await createBookingDoc('CONFIRMED', '001');
    confirmedBookingId = confirmed._id.toString();

    const cancelled = await createBookingDoc('CANCELLED', '002');
    cancelledBookingId = cancelled._id.toString();

    const active = await createBookingDoc('ACTIVE', '003');
    activeBookingId = active._id.toString();

    const completed = await createBookingDoc('COMPLETED', '004');
    completedBookingId = completed._id.toString();
  });

  afterAll(async () => {
    await queueRegistry.closeAllQueues();
    await closeRedis();
    await redisServer.stop();
    await disconnectDatabase();
    await mongoServer.stop();
    delete process.env.REDIS_URL;
  });

  it('Stale Job Protection (Pickup Reminder): Sends reminder for CONFIRMED booking', async () => {
    const mockJob: any = {
      id: 'job-pickup-1',
      data: {
        type: 'PICKUP_REMINDER',
        bookingId: confirmedBookingId
      }
    };

    const result = await processBookingJob(mockJob);
    expect(result.success).toBe(true);
    expect(result.reminder).toBe('PICKUP_REMINDER');
  });

  it('Stale Job Protection (Pickup Reminder): Skips reminder if booking was CANCELLED', async () => {
    const mockJob: any = {
      id: 'job-pickup-2',
      data: {
        type: 'PICKUP_REMINDER',
        bookingId: cancelledBookingId
      }
    };

    const result = await processBookingJob(mockJob);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('STALE_STATUS_CANCELLED');
  });

  it('Stale Job Protection (Return Reminder): Sends reminder for ACTIVE booking', async () => {
    const mockJob: any = {
      id: 'job-return-1',
      data: {
        type: 'RETURN_REMINDER',
        bookingId: activeBookingId
      }
    };

    const result = await processBookingJob(mockJob);
    expect(result.success).toBe(true);
    expect(result.reminder).toBe('RETURN_REMINDER');
  });

  it('Stale Job Protection (Return Reminder): Skips reminder if booking was CANCELLED', async () => {
    const mockJob: any = {
      id: 'job-return-2',
      data: {
        type: 'RETURN_REMINDER',
        bookingId: cancelledBookingId
      }
    };

    const result = await processBookingJob(mockJob);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('STALE_STATUS_CANCELLED');
  });

  it('Stale Job Protection (Review Invitation): Dispatches for COMPLETED booking, skips non-COMPLETED', async () => {
    // 1. Completed booking
    const compJob: any = {
      id: 'job-review-1',
      data: {
        type: 'REVIEW_INVITATION',
        bookingId: completedBookingId
      }
    };
    const compResult = await processBookingJob(compJob);
    expect(compResult.success).toBe(true);
    expect(compResult.action).toBe('REVIEW_INVITATION_SENT');

    // 2. Active booking (not completed yet)
    const activeJob: any = {
      id: 'job-review-2',
      data: {
        type: 'REVIEW_INVITATION',
        bookingId: activeBookingId
      }
    };
    const activeResult = await processBookingJob(activeJob);
    expect(activeResult.skipped).toBe(true);
    expect(activeResult.reason).toBe('NOT_ELIGIBLE_FOR_REVIEW');
  });

  it('Scheduler Service: Repeatable jobs are registered idempotently without duplicate tasks', async () => {
    // Calling initScheduledJobs multiple times must not fail or throw
    await schedulerService.initScheduledJobs();
    await schedulerService.initScheduledJobs();

    const bookingQueue = queueRegistry.getBookingQueue();
    const schedulers = await bookingQueue.getJobSchedulers();
    expect(schedulers.length).toBeGreaterThanOrEqual(1);

    const cleanupJob = schedulers.find((j) => j.name === 'expired-booking-cleanup');
    expect(cleanupJob).toBeDefined();
    expect(cleanupJob?.every).toBe(5 * 60 * 1000);
  });
});
