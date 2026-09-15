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
import { ReviewHelpfulVoteModel } from '../src/models/review-helpful-vote.model.js';
import { HubModel } from '../src/models/hub.model.js';

describe('TASK 14: Review Concurrency & Race Condition Protection Tests', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let customerCookie: string;
  let customerId: string;
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
    await ReviewHelpfulVoteModel.syncIndexes();

    // Register Customer
    const custRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Concurrent Customer',
        email: 'concurrent@skybolt.test',
        password: 'Password123!',
        phone: '+919999955555'
      });
    customerCookie = custRes.headers['set-cookie'][0];
    customerId = custRes.body.data.user.id;

    // Create Hub
    const hub = await HubModel.create({
      code: 'HUB-CONC-01',
      name: 'Central Hub',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400001',
      address: 'Marine Lines',
      capacity: 40,
      currentVehicleCount: 8,
      coordinates: { latitude: 18.9440, longitude: 72.8238 },
      operationalStatus: 'ACTIVE'
    });
    testHubId = hub._id.toString();

    // Create Vehicle
    const vehicle = await VehicleModel.create({
      vehicleCode: 'SKY-VHC-CONC',
      name: 'Porsche Taycan 4S',
      brand: 'Porsche',
      model: 'Taycan',
      year: 2024,
      category: 'EV',
      registrationNumber: 'MH-01-EQ-7777',
      status: 'ACTIVE',
      hubId: hub._id,
      specifications: {
        seats: 4,
        transmission: 'AUTOMATIC',
        fuelType: 'ELECTRIC'
      },
      rental: {
        baseRate: 12000,
        currency: 'INR'
      },
      location: {
        name: 'Central Hub',
        city: 'Mumbai'
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
    await ReviewHelpfulVoteModel.deleteMany({});
  });

  async function createCompletedBooking() {
    const ref = 'SKY-CONC-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
    return await BookingModel.create({
      bookingReference: ref,
      userId: new Types.ObjectId(customerId),
      vehicleId: new Types.ObjectId(testVehicleId),
      pickupAt: new Date(Date.now() - 3 * 86400000),
      returnAt: new Date(Date.now() - 1 * 86400000),
      pickupLocation: { locationId: testHubId, name: 'Central Hub', address: 'Marine Lines' },
      returnLocation: { locationId: testHubId, name: 'Central Hub', address: 'Marine Lines' },
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      pricingSnapshot: {
        baseRate: 12000,
        baseAmount: 24000,
        durationDays: 2,
        durationHours: 48,
        subtotal: 24000,
        discount: 0,
        taxes: { gst: 4320 },
        securityDeposit: 20000,
        total: 48320,
        currency: 'INR'
      },
      vehicleSnapshot: {
        brand: 'Porsche',
        model: 'Taycan',
        name: 'Porsche Taycan 4S',
        registrationNumber: 'MH-01-EQ-7777',
        image: 'assets/images/car-tour.webp'
      },
      statusHistory: [
        { from: 'ACTIVE', to: 'COMPLETED', changedAt: new Date(Date.now() - 1 * 86400000), changedBy: customerId, reason: 'Trip completed' }
      ]
    });
  }

  it('should enforce database unique constraint when multiple simultaneous review creations occur', async () => {
    const booking = await createCompletedBooking();
    const concurrentRequests = 5;

    // Dispatch 5 concurrent submissions for the exact same completed booking
    const promises = Array.from({ length: concurrentRequests }).map((_, i) =>
      request(app)
        .post(`/api/v1/bookings/${booking._id}/review`)
        .set('Cookie', [customerCookie])
        .send({
          rating: 5,
          title: `Concurrent Attempt #${i + 1}`,
          comment: `Testing atomic single review guarantee under parallel execution #${i + 1}.`
        })
    );

    const responses = await Promise.all(promises);

    // Exactly one must succeed (201)
    const successResponses = responses.filter(r => r.status === 201);
    const conflictResponses = responses.filter(r => r.status === 409);

    expect(successResponses.length).toBe(1);
    expect(conflictResponses.length).toBe(concurrentRequests - 1);

    for (const conf of conflictResponses) {
      expect(conf.body.error.code).toBe('REVIEW_ALREADY_EXISTS');
    }

    // Direct database validation: exactly 1 review exists for this booking
    const countInDb = await ReviewModel.countDocuments({
      bookingId: booking._id,
      isDeleted: false
    });
    expect(countInDb).toBe(1);
  });

  it('should prevent race condition duplicates when multiple simultaneous helpful votes are cast by the same user', async () => {
    const booking = await createCompletedBooking();

    // Create a review
    const revRes = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customerCookie])
      .send({
        rating: 5,
        title: 'Outstanding Machine',
        comment: 'The handling and instant electric torque are unmatched.'
      });
    const reviewId = revRes.body.data.id;

    // User dispatches 6 simultaneous helpful vote toggles
    const toggleRequests = 6;
    const votePromises = Array.from({ length: toggleRequests }).map(() =>
      request(app)
        .post(`/api/v1/reviews/${reviewId}/helpful`)
        .set('Cookie', [customerCookie])
        .send({})
    );

    const voteResponses = await Promise.all(votePromises);

    // All should return HTTP 200 without 500 crashes
    for (const res of voteResponses) {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }

    // Direct database validation: unique index prevents duplicate vote documents
    const totalVotesInDb = await ReviewHelpfulVoteModel.countDocuments({
      reviewId: new Types.ObjectId(reviewId),
      userId: new Types.ObjectId(customerId)
    });
    expect(totalVotesInDb).toBeLessThanOrEqual(1);

    // Verify Review document helpfulCount is either 0 or 1, matching the database record
    const updatedReview = await ReviewModel.findById(reviewId).exec();
    expect(updatedReview!.helpfulCount).toBe(totalVotesInDb);
  });
});
