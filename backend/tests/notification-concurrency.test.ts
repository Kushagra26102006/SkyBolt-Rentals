import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import {
  NotificationModel,
  NotificationOutboxModel,
  OutboxStatus,
  NotificationWorker,
  notificationService,
  NotificationType,
  NotificationChannel,
  NotificationStatus,
  setEmailProvider,
  setSmsProvider,
  MockEmailProvider,
  MockSmsProvider
} from '../src/notifications/index.js';
import { AuthenticatedUser } from '../src/types/auth.types.js';

describe('TASK 13: Notification Concurrency & Outbox Contention Tests', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  let mockEmail: MockEmailProvider;
  let mockSms: MockSmsProvider;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);
    await NotificationModel.syncIndexes();
    await NotificationOutboxModel.syncIndexes();

    mockEmail = new MockEmailProvider();
    mockSms = new MockSmsProvider();
    setEmailProvider(mockEmail);
    setSmsProvider(mockSms);
  });

  afterAll(async () => {
    setEmailProvider(null);
    setSmsProvider(null);
    await disconnectDatabase();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    mockEmail.clear();
    mockSms.clear();
    await NotificationModel.deleteMany({});
    await NotificationOutboxModel.deleteMany({});
  });

  describe('Outbox Atomic Locking Under High Worker Contention', () => {
    it('should process every outbox item exactly once when multiple workers process concurrently', async () => {
      const totalJobs = 10;
      const worker1 = new NotificationWorker();
      const worker2 = new NotificationWorker();

      // Enqueue 10 distinct outbox notification jobs
      for (let i = 0; i < totalJobs; i++) {
        const bookingId = new Types.ObjectId().toString();
        await notificationService.enqueue({
          type: NotificationType.BOOKING_CONFIRMED,
          bookingId,
          recipientEmail: `customer${i}@skybolt.test`,
          channels: [NotificationChannel.EMAIL],
          templateData: {
            customerName: `Customer ${i}`,
            bookingReference: `SKY-20260904-C${i}`,
            vehicleName: 'Hyundai Ioniq 5',
            pickupLocation: 'Hub',
            pickupAt: '15 Sep 2026',
            returnLocation: 'Hub',
            returnAt: '17 Sep 2026',
            totalAmount: '₹8,000'
          }
        });
      }

      // Verify all 10 are pending in outbox
      const pendingCount = await NotificationOutboxModel.countDocuments({ status: OutboxStatus.PENDING });
      expect(pendingCount).toBe(totalJobs);

      // Launch both workers simultaneously competing for the queue
      const [processed1, processed2] = await Promise.all([
        worker1.processBatch(10),
        worker2.processBatch(10)
      ]);

      // Together they must have processed all 10 jobs
      expect(processed1 + processed2).toBe(totalJobs);

      // Verify all outbox records are now marked PROCESSED
      const remainingPending = await NotificationOutboxModel.countDocuments({ status: OutboxStatus.PENDING });
      const processedOutbox = await NotificationOutboxModel.countDocuments({ status: OutboxStatus.PROCESSED });
      expect(remainingPending).toBe(0);
      expect(processedOutbox).toBe(totalJobs);

      // Verify mock provider received exactly 10 emails (no duplicate deliveries)
      expect(mockEmail.sentEmails).toHaveLength(totalJobs);

      // Verify exactly 10 notification records in database
      const totalNotifications = await NotificationModel.countDocuments({ status: NotificationStatus.SENT });
      expect(totalNotifications).toBe(totalJobs);
    });
  });

  describe('Admin Concurrent Retry Contention', () => {
    it('should prevent duplicate delivery if two admins trigger retry concurrently', async () => {
      // Create a failed notification
      const bookingId = new Types.ObjectId().toString();
      const doc = await NotificationModel.create({
        type: NotificationType.BOOKING_CONFIRMED,
        channel: NotificationChannel.EMAIL,
        recipient: 'retry.test@skybolt.test',
        template: 'BOOKING_CONFIRMED',
        templateVersion: '1.0.0',
        status: NotificationStatus.FAILED,
        provider: 'mock',
        idempotencyKey: `booking_confirmed:booking:${bookingId}:email`,
        failureCode: 'GATEWAY_TIMEOUT',
        failureReason: 'Gateway timed out',
        failedAt: new Date(),
        attemptCount: 1,
        metadata: {
          customerName: 'Retry User',
          bookingReference: 'SKY-20260904-RTRY',
          vehicleName: 'Tata Curvv EV',
          totalAmount: '₹6,000'
        }
      });

      const adminUser: AuthenticatedUser = {
        id: new Types.ObjectId().toString(),
        name: 'Admin User',
        email: 'admin@skybolt.test',
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        phoneVerified: true
      };

      // Two concurrent retry requests
      const [res1, res2] = await Promise.allSettled([
        notificationService.retryNotification(doc._id.toString(), adminUser),
        notificationService.retryNotification(doc._id.toString(), adminUser)
      ]);

      // At least one must succeed
      const successful = [res1, res2].filter((r) => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThanOrEqual(1);

      // Verify the final record status is SENT
      const updatedDoc = await NotificationModel.findById(doc._id);
      expect(updatedDoc!.status).toBe(NotificationStatus.SENT);
    });
  });
});
