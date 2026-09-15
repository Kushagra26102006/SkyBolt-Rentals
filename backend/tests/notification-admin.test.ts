import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { UserModel } from '../src/models/user.model.js';
import { AuditLogModel } from '../src/models/audit-log.model.js';
import {
  NotificationModel,
  NotificationType,
  NotificationChannel,
  NotificationStatus,
  setEmailProvider,
  setSmsProvider,
  MockEmailProvider,
  MockSmsProvider
} from '../src/notifications/index.js';

describe('TASK 13: Admin Notification Monitoring & Retries API Tests', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let adminCookie: string;
  let customerCookie: string;
  let mockEmail: MockEmailProvider;
  let mockSms: MockSmsProvider;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);
    await NotificationModel.syncIndexes();
    await AuditLogModel.syncIndexes();
    await UserModel.syncIndexes();

    mockEmail = new MockEmailProvider();
    mockSms = new MockSmsProvider();
    setEmailProvider(mockEmail);
    setSmsProvider(mockSms);

    // Register Customer
    const custRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Regular Customer',
        email: 'regular.cust@skybolt.test',
        password: 'Password123!',
        phone: '+919999988888'
      });
    customerCookie = custRes.headers['set-cookie'][0];

    // Register Admin
    const adminRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Admin Supervisor',
        email: 'supervisor@skybolt.test',
        password: 'Password123!',
        phone: '+919999977777'
      });
    // Promote user to ADMIN in DB
    await UserModel.findOneAndUpdate(
      { email: 'supervisor@skybolt.test' },
      { $set: { role: 'ADMIN' } }
    );
    // Log in to get admin token cookie
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'supervisor@skybolt.test',
        password: 'Password123!'
      });
    adminCookie = loginRes.headers['set-cookie'][0];
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
    await AuditLogModel.deleteMany({});
  });

  describe('Admin RBAC & Security Access Control', () => {
    it('should reject unauthenticated requests to admin notification endpoints', async () => {
      const res = await request(app).get('/api/v1/admin/notifications');
      expect(res.status).toBe(401);
    });

    it('should reject customer role with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/admin/notifications')
        .set('Cookie', customerCookie);
      expect(res.status).toBe(403);
    });

    it('should allow ADMIN role to access admin notification endpoints', async () => {
      const res = await request(app)
        .get('/api/v1/admin/notifications')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('Admin Notification Queries & Stats', () => {
    it('should retrieve aggregated status and channel statistics', async () => {
      // Seed 2 SENT emails, 1 FAILED SMS
      await NotificationModel.create([
        {
          type: NotificationType.BOOKING_CONFIRMED,
          channel: NotificationChannel.EMAIL,
          recipient: 'user1@skybolt.test',
          template: 'BOOKING_CONFIRMED',
          templateVersion: '1.0.0',
          status: NotificationStatus.SENT,
          provider: 'mock',
          idempotencyKey: 'stat:1'
        },
        {
          type: NotificationType.PAYMENT_SUCCESS,
          channel: NotificationChannel.EMAIL,
          recipient: 'user2@skybolt.test',
          template: 'PAYMENT_SUCCESS',
          templateVersion: '1.0.0',
          status: NotificationStatus.SENT,
          provider: 'mock',
          idempotencyKey: 'stat:2'
        },
        {
          type: NotificationType.BOOKING_CONFIRMED,
          channel: NotificationChannel.SMS,
          recipient: '+919999911111',
          template: 'BOOKING_CONFIRMED',
          templateVersion: '1.0.0',
          status: NotificationStatus.FAILED,
          provider: 'mock',
          idempotencyKey: 'stat:3',
          failureCode: 'INVALID_NUMBER'
        }
      ]);

      const res = await request(app)
        .get('/api/v1/admin/notifications/stats')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.sent).toBe(2);
      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.emailTotal).toBe(2);
      expect(res.body.data.smsTotal).toBe(1);
    });

    it('should filter notifications by channel and status with pagination', async () => {
      await NotificationModel.create([
        {
          type: NotificationType.BOOKING_CONFIRMED,
          channel: NotificationChannel.EMAIL,
          recipient: 'target@skybolt.test',
          template: 'BOOKING_CONFIRMED',
          templateVersion: '1.0.0',
          status: NotificationStatus.SENT,
          provider: 'mock',
          idempotencyKey: 'filter:1'
        },
        {
          type: NotificationType.BOOKING_CONFIRMED,
          channel: NotificationChannel.SMS,
          recipient: '+919999922222',
          template: 'BOOKING_CONFIRMED',
          templateVersion: '1.0.0',
          status: NotificationStatus.FAILED,
          provider: 'mock',
          idempotencyKey: 'filter:2'
        }
      ]);

      // Query EMAIL channel only
      const res = await request(app)
        .get('/api/v1/admin/notifications?channel=EMAIL')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].channel).toBe('EMAIL');
      expect(res.body.data[0].recipient).toBe('target@skybolt.test');
    });

    it('should retrieve single notification detail by ID', async () => {
      const doc = await NotificationModel.create({
        type: NotificationType.BOOKING_CONFIRMED,
        channel: NotificationChannel.EMAIL,
        recipient: 'detail@skybolt.test',
        subject: 'Booking Confirmed',
        body: '<p>Details</p>',
        template: 'BOOKING_CONFIRMED',
        templateVersion: '1.0.0',
        status: NotificationStatus.SENT,
        provider: 'mock',
        idempotencyKey: 'detail:1'
      });

      const res = await request(app)
        .get(`/api/v1/admin/notifications/${doc._id}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(doc._id.toString());
      expect(res.body.data.recipient).toBe('detail@skybolt.test');
      expect(res.body.data.idempotencyKey).toBe('detail:1');
    });
  });

  describe('Admin Authorized Retry Action & Audit Trail', () => {
    it('should allow authorized admin to retry failed notification and log audit entry', async () => {
      const doc = await NotificationModel.create({
        type: NotificationType.BOOKING_CONFIRMED,
        channel: NotificationChannel.EMAIL,
        recipient: 'retry.cust@skybolt.test',
        template: 'BOOKING_CONFIRMED',
        templateVersion: '1.0.0',
        status: NotificationStatus.FAILED,
        provider: 'mock',
        idempotencyKey: 'retry:admin:1',
        failureCode: 'GATEWAY_ERROR',
        failureReason: 'Temporary error',
        metadata: {
          customerName: 'Retry Customer',
          bookingReference: 'SKY-20260904-ADM',
          vehicleName: 'Tesla Model Y',
          totalAmount: '₹9,000'
        }
      });

      const res = await request(app)
        .post(`/api/v1/admin/notifications/${doc._id}/retry`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify notification status updated to SENT
      const updated = await NotificationModel.findById(doc._id);
      expect(updated!.status).toBe(NotificationStatus.SENT);
      expect(updated!.providerMessageId).toBeDefined();

      // Verify Audit Log entry created for the admin action
      const auditEntry = await AuditLogModel.findOne({ action: 'NOTIFICATION_RETRY' });
      expect(auditEntry).not.toBeNull();
      expect(auditEntry!.entityType).toBe('USER');
    });

    it('should reject retry on already SENT notifications', async () => {
      const doc = await NotificationModel.create({
        type: NotificationType.BOOKING_CONFIRMED,
        channel: NotificationChannel.EMAIL,
        recipient: 'sent@skybolt.test',
        template: 'BOOKING_CONFIRMED',
        templateVersion: '1.0.0',
        status: NotificationStatus.SENT,
        provider: 'mock',
        idempotencyKey: 'retry:sent:1'
      });

      const res = await request(app)
        .post(`/api/v1/admin/notifications/${doc._id}/retry`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.message || res.body.message).toContain('already been sent successfully');
    });
  });
});
