import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { UserModel } from '../src/models/user.model.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { BookingModel, BookingStatus } from '../src/models/booking.model.js';
import { ReviewModel } from '../src/models/review.model.js';
import { ReviewReportModel } from '../src/models/review-report.model.js';
import { ReviewHelpfulVoteModel } from '../src/models/review-helpful-vote.model.js';
import { HubModel } from '../src/models/hub.model.js';

describe('TASK 14 — Security & Abuse Tests (All 18 Scenarios)', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let customerCookie: string;
  let customerId: string;

  let attackerCookie: string;
  let attackerId: string;

  let adminCookie: string;
  let adminId: string;

  let testVehicleId: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    await UserModel.syncIndexes();
    await VehicleModel.syncIndexes();
    await BookingModel.syncIndexes();
    await ReviewModel.syncIndexes();
    await ReviewReportModel.syncIndexes();
    await ReviewHelpfulVoteModel.syncIndexes();

    // 1. Create Customer
    const custRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Legit Customer',
        email: 'customer.sec@skybolt.test',
        password: 'Password123!',
        phone: '+919876543210'
      });
    customerCookie = custRes.headers['set-cookie'][0];
    customerId = custRes.body.data.user.id;

    // 2. Create Attacker
    const attRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Attacker User',
        email: 'attacker.sec@skybolt.test',
        password: 'Password123!',
        phone: '+919876543211'
      });
    attackerCookie = attRes.headers['set-cookie'][0];
    attackerId = attRes.body.data.user.id;

    // 3. Create Admin
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Security Admin',
        email: 'admin.sec@skybolt.test',
        password: 'Password123!',
        phone: '+919876543212'
      });
    const adminUser = await UserModel.findOneAndUpdate(
      { email: 'admin.sec@skybolt.test' },
      { role: 'ADMIN' },
      { new: true }
    );
    adminId = adminUser!._id.toString();

    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin.sec@skybolt.test',
        password: 'Password123!'
      });
    adminCookie = adminLoginRes.headers['set-cookie'][0];

    // 4. Create Hub & Vehicle
    const hub = await HubModel.create({
      code: 'HUB-SEC-01',
      name: 'Security Test Hub',
      city: 'Delhi',
      state: 'Delhi',
      postalCode: '110017',
      address: 'Saket District Centre',
      capacity: 35,
      currentVehicleCount: 12,
      coordinates: { latitude: 28.5244, longitude: 77.2167 },
      operationalStatus: 'ACTIVE'
    });

    const vehicle = await VehicleModel.create({
      vehicleCode: 'SKY-VHC-SEC',
      name: 'Tesla Model S Plaid',
      brand: 'Tesla',
      model: 'Model S',
      year: 2024,
      category: 'CAR',
      registrationNumber: 'DL-01-SEC-9999',
      status: 'ACTIVE',
      hubId: hub._id,
      specifications: {
        seats: 5,
        transmission: 'AUTOMATIC',
        fuelType: 'ELECTRIC'
      },
      rental: {
        baseRate: 7500,
        currency: 'INR'
      },
      location: {
        name: 'Security Test Hub',
        city: 'Delhi'
      },
      images: [
        { url: 'https://images.unsplash.com/test-tesla.jpg', isPrimary: true }
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
    await ReviewModel.deleteMany({});
    await ReviewReportModel.deleteMany({});
    await BookingModel.deleteMany({});
  });

  const createCompletedBooking = async (userId: string, vehicleId = testVehicleId) => {
    const ref = 'SKY-SEC-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
    return await BookingModel.create({
      bookingReference: ref,
      userId: new Types.ObjectId(userId),
      vehicleId: new Types.ObjectId(vehicleId),
      pickupAt: new Date(Date.now() - 4 * 86400000),
      returnAt: new Date(Date.now() - 1 * 86400000),
      pickupLocation: { locationId: new Types.ObjectId().toString(), name: 'Security Hub', address: 'Delhi' },
      returnLocation: { locationId: new Types.ObjectId().toString(), name: 'Security Hub', address: 'Delhi' },
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      pricingSnapshot: {
        baseRate: 7500,
        baseAmount: 15000,
        durationDays: 2,
        durationHours: 48,
        subtotal: 15000,
        discount: 0,
        taxes: { gst: 2700 },
        securityDeposit: 15000,
        total: 32700,
        currency: 'INR'
      },
      vehicleSnapshot: {
        brand: 'Tesla',
        model: 'Model S',
        name: 'Tesla Model S Plaid',
        registrationNumber: 'DL-01-SEC-9999',
        image: 'https://example.com/tesla.jpg'
      },
      statusHistory: [
        { from: 'ACTIVE', to: 'COMPLETED', changedAt: new Date(Date.now() - 1 * 86400000), changedBy: userId, reason: 'Completed' }
      ]
    });
  };

  // 1. Unauthenticated review submission
  it('1. should reject unauthenticated review submission with 401', async () => {
    const booking = await createCompletedBooking(customerId);
    const res = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .send({
        rating: 5,
        title: 'Great Ride',
        comment: 'Unauthenticated attempt.'
      });

    expect(res.status).toBe(401);
  });

  // 2. Customer reviews another user's booking
  it('2. should reject reviewing another user\'s booking with 403 BOOKING_NOT_OWNED', async () => {
    const customerBooking = await createCompletedBooking(customerId);

    const res = await request(app)
      .post(`/api/v1/bookings/${customerBooking._id}/review`)
      .set('Cookie', [attackerCookie])
      .send({
        rating: 1,
        title: 'Malicious Review',
        comment: 'I do not own this booking.'
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BOOKING_NOT_OWNED');
  });

  // 3. Customer changes/forges bookingId
  it('3. should reject nonexistent or forged bookingId with 404', async () => {
    const nonExistentBookingId = new Types.ObjectId().toString();

    const res = await request(app)
      .post(`/api/v1/bookings/${nonExistentBookingId}/review`)
      .set('Cookie', [customerCookie])
      .send({
        rating: 5,
        title: 'Fake Booking',
        comment: 'Testing invalid booking reference.'
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
  });

  // 4. Customer changes/injects vehicleId
  it('4. should reject client attempts to supply vehicleId (strict schema enforcement)', async () => {
    const booking = await createCompletedBooking(customerId);
    const fakeVehicleId = new Types.ObjectId().toString();

    const res = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customerCookie])
      .send({
        vehicleId: fakeVehicleId,
        rating: 5,
        title: 'Inject Vehicle',
        comment: 'Attempting to review a different vehicle.'
      });

    expect(res.status).toBe(422);
  });

  // 5. Customer changes/injects userId
  it('5. should reject client attempts to supply userId (strict schema enforcement)', async () => {
    const booking = await createCompletedBooking(customerId);

    const res = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customerCookie])
      .send({
        userId: attackerId,
        rating: 5,
        title: 'Inject User',
        comment: 'Attempting to forge author userId.'
      });

    expect(res.status).toBe(422);
  });

  // 6. Customer sets verified=true or verificationStatus
  it('6. should reject client attempts to set verificationStatus or verified flag', async () => {
    const booking = await createCompletedBooking(customerId);

    const res = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customerCookie])
      .send({
        verificationStatus: 'VERIFIED',
        rating: 5,
        title: 'Self-Verified',
        comment: 'Attempting to spoof verified status.'
      });

    expect(res.status).toBe(422);
  });

  // 7. Customer reviews incomplete booking
  it('7. should reject review of non-completed booking with 400 BOOKING_NOT_COMPLETED', async () => {
    const ref = 'SKY-SEC-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
    const activeBooking = await BookingModel.create({
      bookingReference: ref,
      userId: new Types.ObjectId(customerId),
      vehicleId: new Types.ObjectId(testVehicleId),
      pickupAt: new Date(),
      returnAt: new Date(Date.now() + 86400000),
      pickupLocation: { locationId: new Types.ObjectId().toString(), name: 'Security Hub', address: 'Delhi' },
      returnLocation: { locationId: new Types.ObjectId().toString(), name: 'Security Hub', address: 'Delhi' },
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      pricingSnapshot: {
        baseRate: 7500,
        baseAmount: 15000,
        durationDays: 2,
        durationHours: 48,
        subtotal: 15000,
        discount: 0,
        taxes: { gst: 2700 },
        securityDeposit: 15000,
        total: 32700,
        currency: 'INR'
      },
      vehicleSnapshot: {
        brand: 'Tesla',
        model: 'Model S',
        name: 'Tesla Model S Plaid',
        registrationNumber: 'DL-01-SEC-9999',
        image: 'https://example.com/tesla.jpg'
      }
    });

    const res = await request(app)
      .post(`/api/v1/bookings/${activeBooking._id}/review`)
      .set('Cookie', [customerCookie])
      .send({
        rating: 5,
        title: 'Early Review',
        comment: 'Booking is only confirmed, not completed yet.'
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_NOT_COMPLETED');
  });

  // 8. Duplicate review
  it('8. should reject duplicate review submission for the same booking with 409', async () => {
    const booking = await createCompletedBooking(customerId);

    const res1 = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customerCookie])
      .send({
        rating: 5,
        title: 'First Review',
        comment: 'Initial submission.'
      });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customerCookie])
      .send({
        rating: 5,
        title: 'Duplicate Review',
        comment: 'Second submission for same booking.'
      });
    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe('REVIEW_ALREADY_EXISTS');
  });

  // 9. Admin-only endpoint as customer
  it('9. should reject customer accessing admin moderation routes with 403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reviews')
      .set('Cookie', [customerCookie]);

    expect(res.status).toBe(403);
  });

  // 10 & 11. Malicious HTML & Script Injection
  it('10 & 11. should strip malicious HTML tags and script injection from review text', async () => {
    const booking = await createCompletedBooking(customerId);

    const res = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customerCookie])
      .send({
        rating: 5,
        title: 'Safe Title <script>alert("hack")</script>',
        comment: 'Safe comment <img src="x" onerror="alert(1)"> <b>bold text</b> <iframe src="evil.com"></iframe>'
      });

    expect(res.status).toBe(201);
    expect(res.body.data.title).not.toContain('<script>');
    expect(res.body.data.title).toBe('Safe Title');
    expect(res.body.data.comment).not.toContain('<img');
    expect(res.body.data.comment).not.toContain('<iframe>');
    expect(res.body.data.comment).toContain('Safe comment');
    expect(res.body.data.comment).toContain('bold text');
  });

  // 12. Invalid rating (0, 6, -1, 4.5, "5", null)
  it('12. should reject non-integer or out-of-bounds ratings with 422', async () => {
    const booking = await createCompletedBooking(customerId);

    for (const badRating of [0, 6, -1, 4.5, '5', null]) {
      const res = await request(app)
        .post(`/api/v1/bookings/${booking._id}/review`)
        .set('Cookie', [customerCookie])
        .send({
          rating: badRating,
          title: 'Testing Invalid Rating',
          comment: 'Should be rejected.'
        });

      expect(res.status).toBe(422);
    }
  });

  // 13. Invalid ObjectId
  it('13. should reject invalid ObjectId parameter with 422', async () => {
    const res = await request(app)
      .get('/api/v1/reviews/invalid-object-id-12345');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
  });

  // 14. Excessive comment length
  it('14. should reject comment exceeding maximum length (2000 characters)', async () => {
    const booking = await createCompletedBooking(customerId);
    const longComment = 'A'.repeat(2001);

    const res = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customerCookie])
      .send({
        rating: 5,
        title: 'Long Review',
        comment: longComment
      });

    expect(res.status).toBe(422);
  });

  // 15. Arbitrary sort injection
  it('15. should reject invalid or injection sort parameters with 422', async () => {
    const res = await request(app)
      .get(`/api/v1/vehicles/${testVehicleId}/reviews?sort={$gt:""}`);

    expect(res.status).toBe(422);
  });

  // 16. Excessive page size clamping
  it('16. should clamp excessive page size to maximum safe limit of 50', async () => {
    const res = await request(app)
      .get(`/api/v1/vehicles/${testVehicleId}/reviews?page=1&limit=5000`);

    expect(res.status).toBe(200);
    expect(res.body.meta.limit).toBe(50);
  });

  // 17. Report spam
  it('17. should reject duplicate abuse reports from the same user with 409', async () => {
    const booking = await createCompletedBooking(customerId);
    const revRes = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customerCookie])
      .send({
        rating: 5,
        title: 'Good Car',
        comment: 'Nice experience.'
      });
    const reviewId = revRes.body.data.id;

    // First report
    const rep1 = await request(app)
      .post(`/api/v1/reviews/${reviewId}/report`)
      .set('Cookie', [attackerCookie])
      .send({
        reason: 'SPAM',
        description: 'First abuse report.'
      });
    expect(rep1.status).toBe(201);

    // Second report from same user
    const rep2 = await request(app)
      .post(`/api/v1/reviews/${reviewId}/report`)
      .set('Cookie', [attackerCookie])
      .send({
        reason: 'SPAM',
        description: 'Duplicate abuse report.'
      });
    expect(rep2.status).toBe(409);
    expect(rep2.body.error.code).toBe('REVIEW_ALREADY_REPORTED');
  });

  // 18. Helpful vote spam / toggle
  it('18. should handle helpful votes idempotently with toggling and prevent count spam', async () => {
    const booking = await createCompletedBooking(customerId);
    const revRes = await request(app)
      .post(`/api/v1/bookings/${booking._id}/review`)
      .set('Cookie', [customerCookie])
      .send({
        rating: 5,
        title: 'Good Car',
        comment: 'Nice experience.'
      });
    const reviewId = revRes.body.data.id;

    // Vote once -> helpfulCount becomes 1
    const vote1 = await request(app)
      .post(`/api/v1/reviews/${reviewId}/helpful`)
      .set('Cookie', [attackerCookie]);
    expect(vote1.status).toBe(200);
    expect(vote1.body.data.helpfulCount).toBe(1);
    expect(vote1.body.data.voted).toBe(true);

    // Vote again -> toggles off, helpfulCount becomes 0
    const vote2 = await request(app)
      .post(`/api/v1/reviews/${reviewId}/helpful`)
      .set('Cookie', [attackerCookie]);
    expect(vote2.status).toBe(200);
    expect(vote2.body.data.helpfulCount).toBe(0);
    expect(vote2.body.data.voted).toBe(false);
  });
});
