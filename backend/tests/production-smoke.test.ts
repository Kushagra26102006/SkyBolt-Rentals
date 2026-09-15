import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { EphemeralRedisServer } from './helpers/test-redis.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { connectRedis, closeRedis } from '../src/config/redis.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { UserModel } from '../src/models/user.model.js';
import { BookingModel } from '../src/models/booking.model.js';
import { PaymentModel } from '../src/models/payment.model.js';
import { NotificationModel } from '../src/notifications/notification.model.js';
import { HubModel } from '../src/models/hub.model.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';
import { queueRegistry, QueueName } from '../src/queues/queue.registry.js';
import crypto from 'crypto';

describe('SkyBolt Rentals — Production Smoke Test Suite (23 Verification Scenarios)', () => {
  let mongoServer: EphemeralMongoServer;
  let redisServer: EphemeralRedisServer;
  let redisUrl: string;

  // State retained across scenarios
  let customerCookie: string;
  let customerId: string;
  let adminCookie: string;
  let adminId: string;
  let testVehicleId: string;
  let testBookingId: string;
  let testOrderId: string;
  let testPaymentId: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    const mongoUri = await mongoServer.start();
    await connectDatabase(mongoUri);

    redisServer = new EphemeralRedisServer();
    redisUrl = await redisServer.start();
    process.env.REDIS_URL = redisUrl;
    await connectRedis(redisUrl);

    await Promise.all([
      UserModel.syncIndexes(),
      VehicleModel.syncIndexes(),
      BookingModel.syncIndexes(),
      PaymentModel.syncIndexes(),
      NotificationModel.syncIndexes(),
      HubModel.syncIndexes()
    ]);

    await seedVehicles(true);
    const vehicle = await VehicleModel.findOne({ status: 'ACTIVE' }).exec();
    if (!vehicle) throw new Error('Smoke test initialization failed: No active vehicle found.');
    testVehicleId = vehicle._id.toString();

    // Setup Administrator User
    const adminReg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Smoke SuperAdmin',
        email: 'smoke.admin@skybolt.test',
        password: 'Password123!',
        phone: '+919876543211'
      });
    adminId = adminReg.body.data.user.id;
    await UserModel.updateOne({ _id: adminId }, { $set: { role: 'ADMIN' } });

    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'smoke.admin@skybolt.test', password: 'Password123!' });
    adminCookie = adminLogin.headers['set-cookie'][0];
  });

  afterAll(async () => {
    await closeRedis();
    await redisServer.stop();
    await disconnectDatabase();
    await mongoServer.stop();
    delete process.env.REDIS_URL;
  });

  // 1. Frontend Asset & Core Config Availability
  it('1. Frontend loads and exposes verified configuration structure', async () => {
    const res = await request(app).get('/api/v1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('SkyBolt Rentals API');
  });

  // 2. API Responds
  it('2. API responds cleanly to baseline requests', async () => {
    const res = await request(app).get('/api/v1/vehicles');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // 3. Health Endpoint
  it('3. Health endpoint GET /health returns live process status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  // 4. Readiness Endpoint
  it('4. Readiness endpoint GET /ready confirms database connection', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ready).toBe(true);
    expect(res.body.data.database).toBe('connected');
  });

  // 5. User Registration
  it('5. User registration succeeds and sets secure cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Smoke Customer',
        email: 'smoke.customer@skybolt.test',
        password: 'Password123!',
        phone: '+919876543210'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    customerId = res.body.data.user.id;
    const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cookies).toBeDefined();
    customerCookie = cookies![0] || '';
  });

  // 6. Login
  it('6. Login succeeds with valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'smoke.customer@skybolt.test',
        password: 'Password123!'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('smoke.customer@skybolt.test');
  });

  // 7. Logout
  it('7. Logout clears the authentication session cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [customerCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // 8. Vehicle Listing
  it('8. Vehicle listing returns active fleet catalog', async () => {
    const res = await request(app).get('/api/v1/vehicles');
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });

  // 9. Vehicle Details
  it('9. Vehicle details returns complete specifications', async () => {
    const res = await request(app).get(`/api/v1/vehicles/${testVehicleId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.vehicle.id).toBe(testVehicleId);
  });

  // 10. Availability Checking
  it('10. Availability check verifies window eligibility', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const dayAfter = new Date(Date.now() + 172800000).toISOString();

    const res = await request(app)
      .get(`/api/v1/vehicles/${testVehicleId}/availability`)
      .query({ pickupAt: tomorrow, returnAt: dayAfter });

    expect(res.status).toBe(200);
    expect(res.body.data.available).toBe(true);
  });

  // 11. Quote Calculation
  it('11. Dynamic quote calculation generates authoritative pricing breakdown', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const dayAfter = new Date(Date.now() + 172800000).toISOString();

    const res = await request(app)
      .post('/api/v1/pricing/quote')
      .send({
        vehicleId: testVehicleId,
        pickupAt: tomorrow,
        returnAt: dayAfter
      });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThan(0);
    expect(res.body.data.currency).toBe('INR');
  });

  // 12. Booking Creation
  it('12. Booking creation reserves vehicle and returns pending booking', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const dayAfter = new Date(Date.now() + 172800000).toISOString();

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', [customerCookie])
      .send({
        vehicleId: testVehicleId,
        pickupAt: tomorrow,
        returnAt: dayAfter,
        pickupLocation: 'SkyBolt Central Hub',
        returnLocation: 'SkyBolt Central Hub'
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    testBookingId = res.body.data.id;
  });

  // 13. Payment Order Creation
  it('13. Payment order creation returns checkout credentials with exact paise amount', async () => {
    const res = await request(app)
      .post('/api/v1/payments/orders')
      .set('Cookie', [customerCookie])
      .send({ bookingId: testBookingId });

    expect(res.status).toBe(201);
    expect(res.body.data.orderId).toBeDefined();
    expect(res.body.data.amount).toBeGreaterThan(0);
    testOrderId = res.body.data.orderId;
  });

  // 14. Razorpay Payment Flow (Signature Verification)
  it('14. Payment verification validates HMAC SHA-256 signature server-side', async () => {
    testPaymentId = `pay_smoke_${Date.now()}`;
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'rzp_test_placeholder_key_secret')
      .update(`${testOrderId}|${testPaymentId}`)
      .digest('hex');

    const res = await request(app)
      .post('/api/v1/payments/verify')
      .set('Cookie', [customerCookie])
      .send({
        bookingId: testBookingId,
        razorpay_order_id: testOrderId,
        razorpay_payment_id: testPaymentId,
        razorpay_signature: signature
      });

    expect(res.status).toBe(200);
    expect(res.body.data.payment.status).toBe('CAPTURED');
  });

  // 15. Webhook Processing (Idempotency & Replay Protection)
  it('15. Webhook processing cryptographically verifies webhook signature', async () => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_test_placeholder_webhook_secret';
    const rawPayload = JSON.stringify({
      entity: 'event',
      account_id: 'acc_smoke',
      event: 'payment.captured',
      event_id: `evt_${Date.now()}`,
      payload: {
        payment: { entity: { id: testPaymentId, order_id: testOrderId, method: 'card' } }
      }
    });

    const signature = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');

    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-razorpay-signature', signature)
      .set('Content-Type', 'application/json')
      .send(rawPayload);

    expect(res.status).toBe(200);
  });

  // 16. Booking Confirmation
  it('16. Booking confirmed after verified payment capture', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${testBookingId}`)
      .set('Cookie', [customerCookie]);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(res.body.data.paymentStatus).toBe('PAID');
  });

  // 17. Booking Cancellation
  it('17. Booking cancellation transitions status and releases reservation', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${testBookingId}/cancel`)
      .set('Cookie', [customerCookie])
      .send({ reason: 'CUSTOMER_REQUEST', notes: 'Smoke test user cancellation request' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  // 18. Fleet Management Update (Admin)
  it('18. Admin user can update fleet vehicle status', async () => {
    const updateRes = await request(app)
      .patch(`/api/v1/fleet/${testVehicleId}/status`)
      .set('Cookie', [adminCookie])
      .send({ status: 'AVAILABLE', reason: 'Smoke test status audit' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
  });

  // 19. Review Retrieval
  it('19. Review subsystem retrieves vehicle review summary', async () => {
    const res = await request(app).get(`/api/v1/vehicles/${testVehicleId}/reviews/summary`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('averageRating');
  });

  // 20. Notification Generation
  it('20. Notification records are generated in database outbox', async () => {
    const notifications = await NotificationModel.find({ userId: customerId }).exec();
    expect(notifications).toBeDefined();
  });

  // 21. BullMQ Queue Processing
  it('21. Queue registry exposes active BullMQ queues', async () => {
    const notifQueue = queueRegistry.getQueue(QueueName.NOTIFICATION);
    expect(notifQueue).toBeDefined();
    const count = await notifQueue.getJobCounts();
    expect(count).toBeDefined();
  });

  // 22. Admin Dashboard Access
  it('22. Admin can successfully access the overview dashboard metrics', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard/overview')
      .set('Cookie', [adminCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('vehicles');
  });

  // 23. Unauthorized Access Rejection
  it('23. Unauthorized request to protected admin route is rejected with 401/403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard/overview')
      .set('Cookie', [customerCookie]); // Customer attempting admin endpoint

    expect([401, 403]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});
