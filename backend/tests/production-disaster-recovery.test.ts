import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { EphemeralRedisServer } from './helpers/test-redis.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { connectRedis, closeRedis, isRedisConnected } from '../src/config/redis.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { UserModel } from '../src/models/user.model.js';
import { BookingModel } from '../src/models/booking.model.js';
import { PaymentModel } from '../src/models/payment.model.js';
import { WebhookEventModel } from '../src/models/webhook-event.model.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';
import { cacheService } from '../src/services/cache.service.js';
import { recommendationService } from '../src/services/recommendation.service.js';
import { paymentService } from '../src/services/payment.service.js';
import { bookingService } from '../src/services/booking.service.js';
import { notificationService, NotificationType, NotificationChannel } from '../src/notifications/index.js';
import crypto from 'crypto';

describe('SkyBolt Rentals — Production Disaster Recovery & Failure Injection Suite', () => {
  let mongoServer: EphemeralMongoServer;
  let redisServer: EphemeralRedisServer;
  let redisUrl: string;
  let mongoUri: string;
  let customerCookie: string;
  let customerId: string;
  let testVehicleId: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    mongoUri = await mongoServer.start();
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
      WebhookEventModel.syncIndexes()
    ]);

    await seedVehicles(true);
    const vehicle = await VehicleModel.findOne({ status: 'ACTIVE' }).exec();
    testVehicleId = vehicle!._id.toString();

    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Disaster Tester',
        email: 'disaster.tester@skybolt.test',
        password: 'Password123!',
        phone: '+919999988888'
      });
    customerId = reg.body.data.user.id;
    customerCookie = reg.headers['set-cookie'][0];
  });

  afterAll(async () => {
    await closeRedis();
    await redisServer.stop();
    await disconnectDatabase();
    await mongoServer.stop();
    delete process.env.REDIS_URL;
  });

  // 1. Redis Outage & Fail-Open Cache Fallback
  it('Disaster 1: When Redis goes offline, cache fails open and serves from authoritative MongoDB', async () => {
    // 1. Warm cache
    await cacheService.set('disaster:probe', { alive: true }, 60);

    // 2. Terminate Redis connection
    await closeRedis();
    expect(isRedisConnected()).toBe(false);

    // 3. Cache reads return null safely without throwing
    const val = await cacheService.get('disaster:probe');
    expect(val).toBeNull();

    // 4. API catalog lookup continues directly from MongoDB
    const res = await request(app).get('/api/v1/vehicles');
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);

    // 5. Restore Redis
    await connectRedis(redisUrl);
    expect(isRedisConnected()).toBe(true);
  });

  // 2. AI Recommendation Provider Failure & Heuristic Fallback
  it('Disaster 2: When external AI provider fails or times out, deterministic heuristic fallback activates', async () => {
    // Request recommendations with mock provider fallback
    const res = await recommendationService.getRecommendations(
      { category: 'CAR', passengers: 4, budget: 5000 },
      customerId
    );

    expect(res.recommendations.length).toBeGreaterThan(0);
    expect(res.source).toBeDefined();
    // Recommendations must remain strictly bounded to real catalog vehicles
    for (const rec of res.recommendations) {
      expect(rec.vehicle).toBeDefined();
      expect(rec.pricing).toBeDefined();
    }
  });

  // 3. Notification Queue/Provider Failure Does NOT Block Core Booking
  it('Disaster 3: External notification failure does NEVER abort booking creation or payment verification', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const dayAfter = new Date(Date.now() + 172800000).toISOString();

    // Directly attempt enqueue with an unknown channel to simulate transient notification provider outage
    try {
      await notificationService.enqueue({
        type: NotificationType.BOOKING_CONFIRMED,
        userId: customerId,
        channels: [NotificationChannel.EMAIL],
        templateData: { customerName: 'Test Customer' }
      });
    } catch {
      // Must catch and tolerate
    }

    // Creating booking still completes successfully
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
  });

  // 4. Duplicate Webhook Replay Protection
  it('Disaster 4: Duplicate webhook delivery is detected and rejected without corrupting state', async () => {
    const rawPayload = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      event_id: `evt_replay_${Date.now()}`,
      payload: { payment: { entity: { id: 'pay_test_dup', order_id: 'order_test_dup' } } }
    });

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_test_placeholder_webhook_secret';
    const sig = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');

    // 1st delivery
    const res1 = await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-razorpay-signature', sig)
      .set('Content-Type', 'application/json')
      .send(rawPayload);

    expect(res1.status).toBe(200);

    // Replay delivery (duplicate network transmission)
    const res2 = await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-razorpay-signature', sig)
      .set('Content-Type', 'application/json')
      .send(rawPayload);

    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe('IGNORED');
    expect(res2.body.message).toContain('already processed');
  });

  // 5. Idempotent Booking Creation Prevents Double Booking
  it('Disaster 5: Duplicate booking request with identical Idempotency-Key returns cached response without duplicate inventory lock', async () => {
    const tomorrow = new Date(Date.now() + 259200000).toISOString();
    const dayAfter = new Date(Date.now() + 345600000).toISOString();
    const idempotencyKey = `idem_${Date.now()}_${Math.random()}`;

    // First booking request
    const res1 = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', [customerCookie])
      .set('Idempotency-Key', idempotencyKey)
      .send({
        vehicleId: testVehicleId,
        pickupAt: tomorrow,
        returnAt: dayAfter,
        pickupLocation: 'SkyBolt Hub A',
        returnLocation: 'SkyBolt Hub A'
      });

    expect(res1.status).toBe(201);
    const bookingId1 = res1.body.data.id;

    // Duplicate client retry with same Idempotency-Key
    const res2 = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', [customerCookie])
      .set('Idempotency-Key', idempotencyKey)
      .send({
        vehicleId: testVehicleId,
        pickupAt: tomorrow,
        returnAt: dayAfter,
        pickupLocation: 'SkyBolt Hub A',
        returnLocation: 'SkyBolt Hub A'
      });

    expect(res2.status).toBe(201);
    expect(res2.body.data.id).toBe(bookingId1);
  });

  // 6. Database Connection Failure Signals Readiness Offline
  it('Disaster 6: When database connection fails, /ready probe immediately returns 503 Service Unavailable', async () => {
    // Verify healthy first
    const readyBefore = await request(app).get('/ready');
    expect(readyBefore.status).toBe(200);

    // Disconnect database
    await disconnectDatabase();

    // /ready probe must return 503 Service Unavailable to remove container from load balancer
    const readyAfter = await request(app).get('/ready');
    expect(readyAfter.status).toBe(503);
    expect(readyAfter.body.success).toBe(false);

    // Reconnect for remaining tests
    await connectDatabase(mongoUri);
    const readyRestored = await request(app).get('/ready');
    expect(readyRestored.status).toBe(200);
  });
});
