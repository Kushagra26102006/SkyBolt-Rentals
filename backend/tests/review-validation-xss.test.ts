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

describe('TASK 14: Review Rating Validation, Content Sanitization & XSS Protection', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let customerCookie: string;
  let customerId: string;
  let otherCustomerCookie: string;
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

    // Register Customer
    const custRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Validator Customer',
        email: 'validator@skybolt.test',
        password: 'Password123!',
        phone: '+919999933333'
      });
    customerCookie = custRes.headers['set-cookie'][0];
    customerId = custRes.body.data.user.id;

    // Register Other Customer
    const otherRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Other Customer',
        email: 'other.validator@skybolt.test',
        password: 'Password123!',
        phone: '+919999944444'
      });
    otherCustomerCookie = otherRes.headers['set-cookie'][0];

    // Create Hub
    const hub = await HubModel.create({
      code: 'HUB-DEL-01',
      name: 'Delhi Aero Hub',
      city: 'Delhi',
      state: 'Delhi',
      postalCode: '110037',
      address: 'Terminal 3 Road, Aerocity',
      capacity: 50,
      currentVehicleCount: 10,
      coordinates: { latitude: 28.5562, longitude: 77.1000 },
      operationalStatus: 'ACTIVE'
    });
    testHubId = hub._id.toString();

    // Create Vehicle
    const vehicle = await VehicleModel.create({
      vehicleCode: 'SKY-VHC-VAL',
      name: 'BMW 3 Series M-Sport',
      brand: 'BMW',
      model: '3 Series',
      year: 2024,
      category: 'CAR',
      registrationNumber: 'DL-01-EQ-8888',
      status: 'ACTIVE',
      hubId: hub._id,
      specifications: {
        seats: 5,
        transmission: 'AUTOMATIC',
        fuelType: 'PETROL'
      },
      rental: {
        baseRate: 5500,
        currency: 'INR'
      },
      location: {
        name: 'Delhi Aero Hub',
        city: 'Delhi'
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

  async function createEligibleCompletedBooking(userId: string = customerId) {
    const ref = 'SKY-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
    return await BookingModel.create({
      bookingReference: ref,
      userId: new Types.ObjectId(userId),
      vehicleId: new Types.ObjectId(testVehicleId),
      pickupAt: new Date(Date.now() - 3 * 86400000),
      returnAt: new Date(Date.now() - 1 * 86400000),
      pickupLocation: { locationId: testHubId, name: 'Delhi Aero Hub', address: 'Terminal 3 Road' },
      returnLocation: { locationId: testHubId, name: 'Delhi Aero Hub', address: 'Terminal 3 Road' },
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      pricingSnapshot: {
        baseRate: 5500,
        baseAmount: 11000,
        durationDays: 2,
        durationHours: 48,
        subtotal: 11000,
        discount: 0,
        taxes: { gst: 1980 },
        securityDeposit: 5000,
        total: 17980,
        currency: 'INR'
      },
      vehicleSnapshot: {
        brand: 'BMW',
        model: '3 Series',
        name: 'BMW 3 Series M-Sport',
        registrationNumber: 'DL-01-EQ-8888',
        image: 'assets/images/car-tour.webp'
      },
      statusHistory: [
        { from: 'ACTIVE', to: 'COMPLETED', changedAt: new Date(Date.now() - 1 * 86400000), changedBy: userId, reason: 'Trip completed' }
      ]
    });
  }

  describe('Rating Validation (Integer 1..5)', () => {
    it('should reject invalid ratings: 0, 6, -1, 4.5, "5", null', async () => {
      const invalidRatings = [0, 6, -1, 4.5, '5', null, undefined];

      for (const invalidRating of invalidRatings) {
        const booking = await createEligibleCompletedBooking();

        const res = await request(app)
          .post(`/api/v1/bookings/${booking._id}/review`)
          .set('Cookie', [customerCookie])
          .send({
            rating: invalidRating,
            title: 'Valid Title Here',
            comment: 'This is a valid long review comment describing the ride.'
          });

        expect(res.status).toBe(422);
        expect(res.body.success).toBe(false);
      }
    });

    it('should accept valid integer ratings: 1, 2, 3, 4, 5', async () => {
      for (let star = 1; star <= 5; star++) {
        const booking = await createEligibleCompletedBooking();

        const res = await request(app)
          .post(`/api/v1/bookings/${booking._id}/review`)
          .set('Cookie', [customerCookie])
          .send({
            rating: star,
            title: `Rating ${star} Star Review`,
            comment: `This is a legitimate verified review with star rating ${star}.`
          });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.rating).toBe(star);
      }
    });
  });

  describe('Review Content & Length Validation', () => {
    it('should reject title shorter than 3 characters or longer than 100 characters', async () => {
      const booking1 = await createEligibleCompletedBooking();
      const shortRes = await request(app)
        .post(`/api/v1/bookings/${booking1._id}/review`)
        .set('Cookie', [customerCookie])
        .send({
          rating: 5,
          title: 'Hi',
          comment: 'Valid length comment describing the vehicle trip.'
        });
      expect(shortRes.status).toBe(422);

      const booking2 = await createEligibleCompletedBooking();
      const longRes = await request(app)
        .post(`/api/v1/bookings/${booking2._id}/review`)
        .set('Cookie', [customerCookie])
        .send({
          rating: 5,
          title: 'A'.repeat(101),
          comment: 'Valid length comment describing the vehicle trip.'
        });
      expect(longRes.status).toBe(422);
    });

    it('should reject whitespace-only title or comment', async () => {
      const booking = await createEligibleCompletedBooking();
      const res = await request(app)
        .post(`/api/v1/bookings/${booking._id}/review`)
        .set('Cookie', [customerCookie])
        .send({
          rating: 5,
          title: '       ',
          comment: '          '
        });
      expect(res.status).toBe(422);
    });

    it('should reject comment shorter than 10 characters or longer than 2000 characters', async () => {
      const booking1 = await createEligibleCompletedBooking();
      const shortRes = await request(app)
        .post(`/api/v1/bookings/${booking1._id}/review`)
        .set('Cookie', [customerCookie])
        .send({
          rating: 4,
          title: 'Valid Title',
          comment: 'Too short'
        });
      expect(shortRes.status).toBe(422);

      const booking2 = await createEligibleCompletedBooking();
      const longRes = await request(app)
        .post(`/api/v1/bookings/${booking2._id}/review`)
        .set('Cookie', [customerCookie])
        .send({
          rating: 4,
          title: 'Valid Title',
          comment: 'C'.repeat(2001)
        });
      expect(longRes.status).toBe(422);
    });
  });

  describe('XSS Protection & HTML Sanitization', () => {
    it('should sanitize executable script tags and dangerous HTML attributes from title and comment', async () => {
      const booking = await createEligibleCompletedBooking();

      const maliciousPayload = {
        rating: 5,
        title: 'Nice Car <script>alert("HACKED")</script>',
        comment: 'Great vehicle! <img src="x" onerror="alert(\'XSS\')" /> <a href="javascript:alert(1)">Click me</a> Please check out.'
      };

      const res = await request(app)
        .post(`/api/v1/bookings/${booking._id}/review`)
        .set('Cookie', [customerCookie])
        .send(maliciousPayload);

      expect(res.status).toBe(201);
      const createdReview = res.body.data;

      // Ensure script tag was completely sanitized/stripped
      expect(createdReview.title).not.toContain('<script>');
      expect(createdReview.title).not.toContain('alert("HACKED")');
      expect(createdReview.comment).not.toContain('<script>');
      expect(createdReview.comment).not.toContain('onerror=');
      expect(createdReview.comment).not.toContain('javascript:');

      // Verify database document directly
      const dbReview = await ReviewModel.findById(createdReview.id).exec();
      expect(dbReview).not.toBeNull();
      expect(dbReview!.title).not.toContain('<script>');
      expect(dbReview!.comment).not.toContain('onerror=');
      expect(dbReview!.comment).not.toContain('<img');
    });
  });

  describe('Abuse Report Validation', () => {
    it('should reject invalid report reasons and accept valid predefined reasons', async () => {
      const booking = await createEligibleCompletedBooking();
      const revRes = await request(app)
        .post(`/api/v1/bookings/${booking._id}/review`)
        .set('Cookie', [customerCookie])
        .send({
          rating: 4,
          title: 'Good rental',
          comment: 'Vehicle was in good driving condition.'
        });
      const reviewId = revRes.body.data.id;

      // Reject invalid reason
      const badRes = await request(app)
        .post(`/api/v1/reviews/${reviewId}/report`)
        .set('Cookie', [otherCustomerCookie])
        .send({
          reason: 'I_JUST_DISLIKE_THIS_PERSON',
          description: 'Personal grudge'
        });
      expect(badRes.status).toBe(422);

      // Accept valid reason: SPAM
      const goodRes = await request(app)
        .post(`/api/v1/reviews/${reviewId}/report`)
        .set('Cookie', [otherCustomerCookie])
        .send({
          reason: 'SPAM',
          description: 'This is advertising another service.'
        });
      expect(goodRes.status).toBe(201);
      expect(goodRes.body.success).toBe(true);
      expect(goodRes.body.data.reason).toBe('SPAM');
      expect(goodRes.body.data.status).toBe('PENDING');
    });

    it('should reject report description exceeding 1000 characters', async () => {
      const booking = await createEligibleCompletedBooking();
      const revRes = await request(app)
        .post(`/api/v1/bookings/${booking._id}/review`)
        .set('Cookie', [customerCookie])
        .send({
          rating: 4,
          title: 'Report Length Test',
          comment: 'Testing abuse report description length boundary.'
        });
      const reviewId = revRes.body.data.id;

      const res = await request(app)
        .post(`/api/v1/reviews/${reviewId}/report`)
        .set('Cookie', [otherCustomerCookie])
        .send({
          reason: 'FRAUDULENT',
          description: 'D'.repeat(1001)
        });
      expect(res.status).toBe(422);
    });
  });

  describe('Review Editing Validation', () => {
    it('should enforce rating and comment length bounds when customer updates review', async () => {
      const booking = await createEligibleCompletedBooking();
      const revRes = await request(app)
        .post(`/api/v1/bookings/${booking._id}/review`)
        .set('Cookie', [customerCookie])
        .send({
          rating: 3,
          title: 'Initial Title',
          comment: 'Initial comment describing the ride.'
        });
      const reviewId = revRes.body.data.id;

      // Reject invalid updated rating
      const badRatingRes = await request(app)
        .patch(`/api/v1/reviews/${reviewId}`)
        .set('Cookie', [customerCookie])
        .send({
          rating: 7
        });
      expect(badRatingRes.status).toBe(422);

      // Reject too short updated title
      const badTitleRes = await request(app)
        .patch(`/api/v1/reviews/${reviewId}`)
        .set('Cookie', [customerCookie])
        .send({
          title: 'No'
        });
      expect(badTitleRes.status).toBe(422);

      // Valid update
      const goodUpdateRes = await request(app)
        .patch(`/api/v1/reviews/${reviewId}`)
        .set('Cookie', [customerCookie])
        .send({
          rating: 5,
          title: 'Updated Excellent Experience',
          comment: 'Revised my rating because the support team handled the return refund promptly.'
        });
      expect(goodUpdateRes.status).toBe(200);
      expect(goodUpdateRes.body.data.rating).toBe(5);
      expect(goodUpdateRes.body.data.title).toBe('Updated Excellent Experience');
      expect(goodUpdateRes.body.data.editedAt).toBeDefined();
    });
  });
});
