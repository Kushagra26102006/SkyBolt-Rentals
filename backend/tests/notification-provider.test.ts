import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Types } from 'mongoose';
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
  MockSmsProvider,
  classifyError
} from '../src/notifications/index.js';

describe('TASK 13: Provider Abstraction & Retry Logic Tests', () => {
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

  describe('Error Classification', () => {
    it('should classify HTTP 429 and 5xx as transient retryable errors', () => {
      const rateLimit = classifyError(429, 'RATE_LIMIT_EXCEEDED');
      expect(rateLimit.isTransient).toBe(true);
      expect(rateLimit.code).toBe('RATE_LIMIT_EXCEEDED');

      const serverError = classifyError(503, 'SERVICE_UNAVAILABLE');
      expect(serverError.isTransient).toBe(true);

      const gatewayTimeout = classifyError(504, 'GATEWAY_TIMEOUT');
      expect(gatewayTimeout.isTransient).toBe(true);
    });

    it('should classify HTTP 400, 401, 404, 422 as permanent non-retryable errors', () => {
      const badRequest = classifyError(400, 'BAD_REQUEST');
      expect(badRequest.isTransient).toBe(false);

      const unauthorized = classifyError(401, 'INVALID_API_KEY');
      expect(unauthorized.isTransient).toBe(false);

      const unprocessable = classifyError(422, 'INVALID_RECIPIENT');
      expect(unprocessable.isTransient).toBe(false);
    });

    it('should classify network connection timeouts as transient', () => {
      const timeout = classifyError(undefined, 'ETIMEDOUT');
      expect(timeout.isTransient).toBe(true);

      const connReset = classifyError(undefined, 'ECONNRESET');
      expect(connReset.isTransient).toBe(true);
    });
  });

  describe('Retry Strategy & Exponential Backoff', () => {
    it('should schedule retry for transient errors when attempt count is below max', async () => {
      // Simulate transient error on email provider
      mockEmail.simulateTransientFailure(1, 'CARRIER_TIMEOUT', 'Transient timeout connecting to carrier');

      const bookingId = new Types.ObjectId().toString();
      const results = await notificationService.processJob({
        type: NotificationType.BOOKING_CONFIRMED,
        bookingId,
        recipientEmail: 'transient.test@skybolt.test',
        channels: [NotificationChannel.EMAIL],
        templateData: {
          customerName: 'Dave Transient',
          bookingReference: 'SKY-20260904-TRAN',
          vehicleName: 'BMW i4',
          pickupLocation: 'Hub 1',
          pickupAt: 'Tomorrow',
          returnAt: 'Day after',
          totalAmount: '₹10,000'
        }
      });

      expect(results).toHaveLength(1);
      const emailResult = results[0];
      expect(emailResult.success).toBe(false);
      expect(emailResult.status).toBe(NotificationStatus.PENDING);
      expect(emailResult.isTransient).toBe(true);

      // Verify database record has nextAttemptAt set in the future
      const doc = await NotificationModel.findById(emailResult.notificationId);
      expect(doc).not.toBeNull();
      expect(doc!.status).toBe(NotificationStatus.PENDING);
      expect(doc!.attemptCount).toBe(1);
      expect(doc!.nextAttemptAt).toBeInstanceOf(Date);
      expect(doc!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should mark status as FAILED immediately for permanent non-retryable errors', async () => {
      // Simulate permanent error (e.g. blacklisted/invalid address)
      mockEmail.simulatePermanentFailure(1, 'INVALID_EMAIL_SYNTAX', 'Mailbox does not exist');

      const bookingId = new Types.ObjectId().toString();
      const results = await notificationService.processJob({
        type: NotificationType.BOOKING_CONFIRMED,
        bookingId,
        recipientEmail: 'permanent.failure@skybolt.test',
        channels: [NotificationChannel.EMAIL],
        templateData: {
          customerName: 'Eve Permanent',
          bookingReference: 'SKY-20260904-PERM',
          vehicleName: 'BMW i4',
          pickupLocation: 'Hub 1',
          pickupAt: 'Tomorrow',
          returnAt: 'Day after',
          totalAmount: '₹10,000'
        }
      });

      expect(results).toHaveLength(1);
      const emailResult = results[0];
      expect(emailResult.success).toBe(false);
      expect(emailResult.status).toBe(NotificationStatus.FAILED);
      expect(emailResult.isTransient).toBe(false);

      const doc = await NotificationModel.findById(emailResult.notificationId);
      expect(doc).not.toBeNull();
      expect(doc!.status).toBe(NotificationStatus.FAILED);
      expect(doc!.nextAttemptAt).toBeNull();
      expect(doc!.failedAt).toBeInstanceOf(Date);
      expect(doc!.failureCode).toBe('INVALID_EMAIL_SYNTAX');
    });
  });

  describe('Independent Channel Delivery', () => {
    it('should record independent channel statuses when EMAIL fails but SMS succeeds', async () => {
      // Fail EMAIL transiently, but let SMS succeed
      mockEmail.simulateTransientFailure(1, 'EMAIL_GATEWAY_DOWN', 'Gateway unresponsive');

      const bookingId = new Types.ObjectId().toString();
      const results = await notificationService.processJob({
        type: NotificationType.BOOKING_CONFIRMED,
        bookingId,
        recipientEmail: 'mixed.test@skybolt.test',
        recipientPhone: '+919876543210',
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
        templateData: {
          customerName: 'Frank Mixed',
          bookingReference: 'SKY-20260904-MIXD',
          vehicleName: 'Tata Nexon EV',
          pickupLocation: 'Delhi Hub',
          pickupAt: '12 Sep 2026',
          returnLocation: 'Delhi Hub',
          returnAt: '14 Sep 2026',
          totalAmount: '₹4,000'
        }
      });

      expect(results).toHaveLength(2);

      const emailResult = results.find((r) => r.channel === NotificationChannel.EMAIL);
      const smsResult = results.find((r) => r.channel === NotificationChannel.SMS);

      expect(emailResult).toBeDefined();
      expect(smsResult).toBeDefined();

      // EMAIL: Failed / Scheduled retry
      expect(emailResult!.success).toBe(false);
      expect(emailResult!.status).toBe(NotificationStatus.PENDING);

      // SMS: Succeeded
      expect(smsResult!.success).toBe(true);
      expect(smsResult!.status).toBe(NotificationStatus.SENT);
      expect(smsResult!.providerMessageId).toBeDefined();

      // Verify records in DB are distinct
      const emailDoc = await NotificationModel.findById(emailResult!.notificationId);
      const smsDoc = await NotificationModel.findById(smsResult!.notificationId);

      expect(emailDoc!.status).toBe(NotificationStatus.PENDING);
      expect(smsDoc!.status).toBe(NotificationStatus.SENT);
    });
  });
});
