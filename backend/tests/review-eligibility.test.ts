import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { UserModel } from '../src/models/user.model.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { BookingModel } from '../src/models/booking.model.js';
import { ReviewModel } from '../src/models/review.model.js';
import { HubModel } from '../src/models/hub.model.js';

describe('TASK 14: Review Eligibility & Booking Verification Tests', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let customer1Cookie: string;
  let customer1Id: string;
  let customer2Cookie: string;
  let customer2Id: string;

  let testVehicleId: string;
  let testHubId: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    await UserModel.syncIndexes();
    await VehicleModel.syncIndexes();
    await HubModel.syncIndexes();
    await BookingModel.syncIndexes();
    await ReviewModel.syncIndexes();

    // Register Customer 1
    const cust1Res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Alice Customer',
        email: 'alice.cust@skybolt.test',
        password: 'Password123!',
        phone: '+919999911111'
      });
    customer1Cookie = cust1Res.headers['set-cookie'][0];
    customer1Id = cust1Res.body.data.user.id;

    // Register Customer 2
    const cust2Res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Bob Other',
        email: 'bob.other@skybolt.test',
        password: 'Password123!',
        phone: '+919999922222'
      });
    customer2Cookie = cust2Res.headers['set-cookie'][0];
    customer2Id = cust2Res.body.data.user.id;

    // Create Hub
    const hub = await HubModel.create({
      code: 'HUB-BLR-01',
      name: 'Bangalore Hub',
      city: 'Bangalore',
      state: 'Karnataka',
      postalCode: '560066',
      address: '100 Tech Park, Whitefield',
      capacity: 50,
      currentVehicleCount: 10,
      coordinates: { latitude: 12.9716, longitude: 77.5946 },
      operationalStatus: 'ACTIVE'
    });
    testHubId = hub._id.toString();

    // Create Vehicle
    const vehicle = await VehicleModel.create({
      vehicleCode: 'SKY-REV-01',
      name: 'Tesla Model 3 Performance',
      brand: 'Tesla',
      model: 'Model 3',
      year: 2024,
      category: 'EV',
      registrationNumber: 'KA-01-EQ-9999',
      status: 'ACTIVE',
      hubId: hub._id,
      specifications: {
        seats: 5,
        transmission: 'AUTOMATIC',
        fuelType: 'ELECTRIC'
      },
      rental: {
        baseRate: 4500,
        currency: 'INR'
      },
      location: {
        name: 'Bangalore Hub',
        city: 'Bangalore'
      },
      images: [
        { url: 'https://images.unsplash.com/test.jpg', isPrimary: true }
      ],
      rating: {
        average: 0,
        count: 0
      }
    });
    testVehicleId = vehicle._id.toString();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await BookingModel.deleteMany({});
    await ReviewModel.deleteMany({});
  });

  async function createTestBooking(overrides: Record<string, any> = {}) {
    const ref = 'SKY-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    return await BookingModel.create({
      bookingReference: ref,
      userId: new Types.ObjectId(customer1Id),
      vehicleId: new Types.ObjectId(testVehicleId),
      pickupAt: new Date(Date.now() - 4 * 86400000),
      returnAt: new Date(Date.now() - 1 * 86400000),
      pickupLocation: { locationId: testHubId, name: 'Bangalore Hub', address: 'MG Road' },
      returnLocation: { locationId: testHubId, name: 'Bangalore Hub', address: 'MG Road' },
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      pricingSnapshot: {
        baseRate: 2000,
        baseAmount: 4000,
        durationDays: 2,
        durationHours: 48,
        subtotal: 4000,
        discount: 0,
        taxes: { gst: 720 },
        securityDeposit: 3000,
        total: 7720,
        currency: 'INR'
      },
      vehicleSnapshot: {
        brand: 'Tesla',
        model: 'Model 3',
        name: 'Tesla Model 3 Performance',
        registrationNumber: 'KA-01-EQ-9999',
        image: 'assets/images/hero-bg.webp'
      },
      statusHistory: [
        { from: 'ACTIVE', to: 'COMPLETED', changedAt: new Date(Date.now() - 1 * 86400000), changedBy: customer1Id, reason: 'Trip completed' }
      ],
      ...overrides
    });
  }

  it('should reject review submission when unauthenticated', async () => {
    const fakeBookingId = new Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/v1/bookings/${fakeBookingId}/review`)
      .send({
        rating: 5,
        title: 'Great car',
        comment: 'Really enjoyed the ride!'
      });

    expect(res.status).toBe(401);
  });

  it('should reject review submission for non-existent booking', async () => {
    const fakeBookingId = new Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/v1/bookings/${fakeBookingId}/review`)
      .set('Cookie', [customer1Cookie])
      .send({
        rating: 5,
        title: 'Great car',
        comment: 'Really enjoyed the ride!'
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
  });

  it('should reject review submission if user does NOT own the booking', async () => {
    const booking = await createTestBooking();

    // Customer 2 attempts to review Customer 1's booking
    const res = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customer2Cookie])
      .send({
        rating: 5,
        title: 'Stolen Booking Review',
        comment: 'I am reviewing someone else trip.'
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BOOKING_NOT_OWNED');
  });

  it('should reject review submission if booking is NOT COMPLETED (e.g. CONFIRMED, ACTIVE, PAYMENT_PENDING)', async () => {
    const statuses = ['CONFIRMED', 'ACTIVE', 'PAYMENT_PENDING', 'CANCELLED'];

    for (const status of statuses) {
      const booking = await createTestBooking({
        status,
        statusHistory: []
      });

      const res = await request(app)
        .post(`/api/v1/bookings/${booking._id}/review`)
        .set('Cookie', [customer1Cookie])
        .send({
          rating: 4,
          title: 'Premature review',
          comment: 'Rental is not completed yet!'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('BOOKING_NOT_COMPLETED');
    }
  });

  it('should reject review submission if review window (>30 days) has expired', async () => {
    const completedLongAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000); // 35 days ago

    const booking = await createTestBooking({
      returnAt: completedLongAgo,
      statusHistory: [
        { from: 'ACTIVE', to: 'COMPLETED', changedAt: completedLongAgo, changedBy: customer1Id, reason: 'Completed' }
      ]
    });

    const res = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customer1Cookie])
      .send({
        rating: 5,
        title: 'Too late',
        comment: 'Submitting review after 35 days.'
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REVIEW_WINDOW_EXPIRED');
  });

  it('should allow review submission for eligible completed booking within 30 days', async () => {
    const completedRecently = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const booking = await createTestBooking({
      returnAt: completedRecently,
      statusHistory: [
        { from: 'ACTIVE', to: 'COMPLETED', changedAt: completedRecently, changedBy: customer1Id, reason: 'Completed' }
      ]
    });

    // Check eligibility endpoint first
    const eligRes = await request(app)
      .get(`/api/v1/bookings/${booking._id}/review-eligibility`)
      .set('Cookie', [customer1Cookie]);

    expect(eligRes.status).toBe(200);
    expect(eligRes.body.success).toBe(true);
    expect(eligRes.body.data.eligible).toBe(true);
    expect(eligRes.body.data.bookingId).toBe(booking._id.toString());

    // Submit review
    const revRes = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customer1Cookie])
      .send({
        rating: 5,
        title: 'Flawless Tesla Rental Experience',
        comment: 'The vehicle was charged, impeccably clean, and the acceleration was phenomenal!'
      });

    expect(revRes.status).toBe(201);
    expect(revRes.body.success).toBe(true);
    expect(revRes.body.data.rating).toBe(5);
    expect(revRes.body.data.title).toBe('Flawless Tesla Rental Experience');
    expect(revRes.body.data.verificationStatus).toBe('VERIFIED');
    expect(revRes.body.data.status).toBe('PUBLISHED');
    expect(revRes.body.data.vehicleId).toBe(testVehicleId);
  });

  it('should reject duplicate review for an already reviewed booking', async () => {
    const booking = await createTestBooking();

    // First review succeeds
    const firstRes = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customer1Cookie])
      .send({
        rating: 4,
        title: 'Initial Review',
        comment: 'Smooth journey, very happy with service.'
      });
    expect(firstRes.status).toBe(201);

    // Second review on the same booking must be rejected with 409 Conflict
    const secondRes = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customer1Cookie])
      .send({
        rating: 3,
        title: 'Duplicate Attempt',
        comment: 'Trying to submit a second review for the same rental.'
      });

    expect(secondRes.status).toBe(409);
    expect(secondRes.body.error.code).toBe('REVIEW_ALREADY_EXISTS');

    // Eligibility check also returns eligible: false
    const eligRes = await request(app)
      .get(`/api/v1/bookings/${booking._id}/review-eligibility`)
      .set('Cookie', [customer1Cookie]);
    expect(eligRes.status).toBe(200);
    expect(eligRes.body.data.eligible).toBe(false);
    expect(eligRes.body.data.code).toBe('REVIEW_ALREADY_EXISTS');
  });

  it('should reject forbidden fields (userId, vehicleId, verificationStatus) via strict schema validation', async () => {
    const forgedVehicleId = new Types.ObjectId().toString();
    const forgedUserId = new Types.ObjectId().toString();

    const booking = await createTestBooking();

    // Client attempts to inject forbidden keys -> rejected by strict validator (422)
    const res = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customer1Cookie])
      .send({
        vehicleId: forgedVehicleId,
        userId: forgedUserId,
        verificationStatus: 'UNVERIFIED',
        rating: 5,
        title: 'Injection Attempt',
        comment: 'Client trying to inject unauthorized fields.'
      });

    expect(res.status).toBe(422);

    // Valid payload: server authoritatively binds vehicleId from booking and userId from auth session
    const validRes = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customer1Cookie])
      .send({
        rating: 5,
        title: 'Authentic trip feedback',
        comment: 'Everything was derived authoritatively by backend.'
      });

    expect(validRes.status).toBe(201);
    expect(validRes.body.data.vehicleId).toBe(testVehicleId);
    expect(validRes.body.data.verificationStatus).toBe('VERIFIED');
  });
});
