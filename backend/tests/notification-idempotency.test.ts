import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import {
  NotificationModel,
  notificationService,
  NotificationType,
  NotificationChannel,
  NotificationStatus,
  setEmailProvider,
  setSmsProvider,
  MockEmailProvider,
  MockSmsProvider
} from '../src/notifications/index.js';

describe('TASK 13: Notification Idempotency & Duplicate Suppression Tests', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  let mockEmail: MockEmailProvider;
  let mockSms: MockSmsProvider;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);
    await NotificationModel.syncIndexes();

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
  });

  describe('Deterministic Key Generation', () => {
    it('should generate consistent deterministic idempotency keys for same inputs', () => {
      const bookingId = new Types.ObjectId().toString();
      const key1 = notificationService.generateIdempotencyKey(
        NotificationType.BOOKING_CONFIRMED,
        NotificationChannel.EMAIL,
        { bookingId }
      );
      const key2 = notificationService.generateIdempotencyKey(
        NotificationType.BOOKING_CONFIRMED,
        NotificationChannel.EMAIL,
        { bookingId }
      );

      expect(key1).toBe(`booking_confirmed:booking:${bookingId}:email`);
      expect(key1).toBe(key2);
    });

    it('should generate distinct keys for different channels and events', () => {
      const paymentId = new Types.ObjectId().toString();
      const emailKey = notificationService.generateIdempotencyKey(
        NotificationType.PAYMENT_SUCCESS,
        NotificationChannel.EMAIL,
        { paymentId }
      );
      const smsKey = notificationService.generateIdempotencyKey(
        NotificationType.PAYMENT_SUCCESS,
        NotificationChannel.SMS,
        { paymentId }
      );

      expect(emailKey).not.toBe(smsKey);
      expect(emailKey).toContain(':email');
      expect(smsKey).toContain(':sms');
    });
  });

  describe('Duplicate Suppression & Idempotent Delivery', () => {
    it('should deliver notification once and suppress duplicate delivery on re-dispatch', async () => {
      const bookingId = new Types.ObjectId().toString();
      const userId = new Types.ObjectId().toString();

      const job = {
        type: NotificationType.BOOKING_CONFIRMED,
        userId,
        bookingId,
        recipientEmail: 'test.idempotent@skybolt.test',
        recipientPhone: '+919876543210',
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
        templateData: {
          customerName: 'Alice Idempotent',
          bookingReference: 'SKY-20260904-IDEM',
          vehicleName: 'Tesla Model 3',
          pickupLocation: 'Delhi Hub',
          pickupAt: '10 Sep 2026',
          returnLocation: 'Delhi Hub',
          returnAt: '12 Sep 2026',
          totalAmount: '₹5,000'
        }
      };

      // 1. First Dispatch: Both EMAIL and SMS should be dispatched
      const firstResults = await notificationService.processJob(job);
      expect(firstResults).toHaveLength(2);
      expect(firstResults.every((r) => r.success && r.status === NotificationStatus.SENT)).toBe(true);
      expect(mockEmail.sentEmails).toHaveLength(1);
      expect(mockSms.sentSms).toHaveLength(1);

      // Verify database records
      const records = await NotificationModel.find({ bookingId });
      expect(records).toHaveLength(2);

      // 2. Second Dispatch of the identical event:
      // Must NOT re-send via email or SMS provider
      const secondResults = await notificationService.processJob(job);
      expect(secondResults).toHaveLength(2);
      expect(secondResults.every((r) => r.success && r.status === NotificationStatus.SENT)).toBe(true);

      // Sent counts on providers must remain EXACTLY 1
      expect(mockEmail.sentEmails).toHaveLength(1);
      expect(mockSms.sentSms).toHaveLength(1);
    });

    it('should enforce unique index constraint on idempotencyKey in MongoDB', async () => {
      const idempotencyKey = `unique:test:key:${Date.now()}`;

      await NotificationModel.create({
        type: NotificationType.ACCOUNT_WELCOME,
        channel: NotificationChannel.EMAIL,
        recipient: 'test@example.com',
        template: 'ACCOUNT_WELCOME',
        templateVersion: '1.0.0',
        status: NotificationStatus.SENT,
        provider: 'mock',
        idempotencyKey,
        attemptCount: 1
      });

      // Attempting to create another document with the same idempotencyKey must throw duplicate key error (code 11000)
      await expect(
        NotificationModel.create({
          type: NotificationType.ACCOUNT_WELCOME,
          channel: NotificationChannel.EMAIL,
          recipient: 'test2@example.com',
          template: 'ACCOUNT_WELCOME',
          templateVersion: '1.0.0',
          status: NotificationStatus.SENT,
          provider: 'mock',
          idempotencyKey,
          attemptCount: 1
        })
      ).rejects.toThrow();
    });
  });
});
