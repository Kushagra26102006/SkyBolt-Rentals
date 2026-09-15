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
import { ReviewReportModel } from '../src/models/review-report.model.js';
import { ReviewHelpfulVoteModel } from '../src/models/review-helpful-vote.model.js';
import { AuditLogModel } from '../src/models/audit-log.model.js';
import { HubModel } from '../src/models/hub.model.js';

describe('TASK 14: Review System End-to-End Integration & Moderation Workflow', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let customerCookie: string;
  let customerId: string;
  let reviewer2Cookie: string;
  let reviewer2Id: string;
  let adminCookie: string;
  let adminId: string;

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
    await ReviewReportModel.syncIndexes();
    await ReviewHelpfulVoteModel.syncIndexes();
    await AuditLogModel.syncIndexes();

    // 1. Register Customer 1
    const custRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Sarah Customer',
        email: 'sarah.cust@skybolt.test',
        password: 'Password123!',
        phone: '+919999966666'
      });
    customerCookie = custRes.headers['set-cookie'][0];
    customerId = custRes.body.data.user.id;

    // 2. Register Customer 2
    const cust2Res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'David Traveler',
        email: 'david.traveler@skybolt.test',
        password: 'Password123!',
        phone: '+919999977777'
      });
    reviewer2Cookie = cust2Res.headers['set-cookie'][0];
    reviewer2Id = cust2Res.body.data.user.id;

    // 3. Register Admin
    const adminRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Moderation Admin',
        email: 'mod.admin@skybolt.test',
        password: 'Password123!',
        phone: '+919999988888'
      });
    adminId = adminRes.body.data.user.id;
    await UserModel.findByIdAndUpdate(adminId, { $set: { role: 'ADMIN' } });

    // Log in as Admin to get admin cookie
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'mod.admin@skybolt.test',
        password: 'Password123!'
      });
    adminCookie = adminLoginRes.headers['set-cookie'][0];

    // Create Hub
    const hub = await HubModel.create({
      code: 'HUB-INT-01',
      name: 'South Delhi Hub',
      city: 'Delhi',
      state: 'Delhi',
      postalCode: '110017',
      address: 'Saket District Centre',
      capacity: 35,
      currentVehicleCount: 12,
      coordinates: { latitude: 28.5244, longitude: 77.2167 },
      operationalStatus: 'ACTIVE'
    });
    testHubId = hub._id.toString();

    // Create Vehicle
    const vehicle = await VehicleModel.create({
      vehicleCode: 'SKY-VHC-INT',
      name: 'Mercedes-Benz E-Class Luxury',
      brand: 'Mercedes-Benz',
      model: 'E-Class',
      year: 2024,
      category: 'CAR',
      registrationNumber: 'DL-01-EQ-1234',
      status: 'ACTIVE',
      hubId: hub._id,
      specifications: {
        seats: 5,
        transmission: 'AUTOMATIC',
        fuelType: 'PETROL'
      },
      rental: {
        baseRate: 7500,
        currency: 'INR'
      },
      location: {
        name: 'South Delhi Hub',
        city: 'Delhi'
      },
      images: [
        { url: 'https://images.unsplash.com/test-e-class.jpg', isPrimary: true }
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
    await ReviewReportModel.deleteMany({});
    await ReviewHelpfulVoteModel.deleteMany({});
    await AuditLogModel.deleteMany({});
  });

  async function createTestBooking(userId: string) {
    const ref = 'SKY-INT-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
    return await BookingModel.create({
      bookingReference: ref,
      userId: new Types.ObjectId(userId),
      vehicleId: new Types.ObjectId(testVehicleId),
      pickupAt: new Date(Date.now() - 4 * 86400000),
      returnAt: new Date(Date.now() - 1 * 86400000),
      pickupLocation: { locationId: testHubId, name: 'South Delhi Hub', address: 'Saket' },
      returnLocation: { locationId: testHubId, name: 'South Delhi Hub', address: 'Saket' },
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
        brand: 'Mercedes-Benz',
        model: 'E-Class',
        name: 'Mercedes-Benz E-Class Luxury',
        registrationNumber: 'DL-01-EQ-1234',
        image: 'assets/images/car-tour.webp'
      },
      statusHistory: [
        { from: 'ACTIVE', to: 'COMPLETED', changedAt: new Date(Date.now() - 1 * 86400000), changedBy: userId, reason: 'Completed' }
      ]
    });
  }

  it('should complete full lifecycle: booking -> review -> public rating sync -> helpful voting -> abuse reporting -> admin moderation', async () => {
    // Step 1: Sarah completes booking #1
    const booking1 = await createTestBooking(customerId);

    // Step 2: Sarah submits verified review (Rating: 5)
    const reviewRes = await request(app)
      .post(`/api/v1/bookings/${booking1._id}/review`)
      .set('Cookie', [customerCookie])
      .send({
        rating: 5,
        title: 'Executive Comfort & Spotless Vehicle',
        comment: 'The Mercedes was immaculate, quiet on the highway, and returned with zero hassle.'
      });

    expect(reviewRes.status).toBe(201);
    expect(reviewRes.body.success).toBe(true);
    const reviewId = reviewRes.body.data.id;
    expect(reviewRes.body.data.verificationStatus).toBe('VERIFIED');
    expect(reviewRes.body.data.status).toBe('PUBLISHED');

    // Step 3: Public endpoint displays the review with safe customer projection (no email/phone)
    const publicReviewsRes = await request(app)
      .get(`/api/v1/vehicles/${testVehicleId}/reviews?page=1&limit=10`);

    expect(publicReviewsRes.status).toBe(200);
    expect(publicReviewsRes.body.success).toBe(true);
    expect(publicReviewsRes.body.data.length).toBe(1);
    const pubRev = publicReviewsRes.body.data[0];
    expect(pubRev.id).toBe(reviewId);
    expect(pubRev.author.name).toBe('Sarah Customer');
    expect((pubRev.author as any).email).toBeUndefined();
    expect((pubRev.author as any).phone).toBeUndefined();
    expect(pubRev.verificationStatus).toBe('VERIFIED');

    // Step 4: Authoritative summary metrics
    const summaryRes = await request(app)
      .get(`/api/v1/vehicles/${testVehicleId}/reviews/summary`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.averageRating).toBe(5);
    expect(summaryRes.body.data.totalReviews).toBe(1);
    expect(summaryRes.body.data.ratingDistribution[5]).toBe(1);
    expect(summaryRes.body.data.ratingDistribution[1]).toBe(0);

    // Step 5: Vehicle model database document is atomically synchronized
    const vDoc = await VehicleModel.findById(testVehicleId).exec();
    expect(vDoc!.rating.average).toBe(5);
    expect(vDoc!.rating.count).toBe(1);

    // Step 6: Customer 2 visits and votes the review helpful
    const voteRes = await request(app)
      .post(`/api/v1/reviews/${reviewId}/helpful`)
      .set('Cookie', [reviewer2Cookie])
      .send({});

    expect(voteRes.status).toBe(200);
    expect(voteRes.body.data.voted).toBe(true);
    expect(voteRes.body.data.helpfulCount).toBe(1);

    // Verify review retrieval reflects updated helpful count
    const singleRevRes = await request(app)
      .get(`/api/v1/reviews/${reviewId}`)
      .set('Cookie', [reviewer2Cookie]);
    expect(singleRevRes.status).toBe(200);
    expect(singleRevRes.body.data.helpfulCount).toBe(1);
    expect(singleRevRes.body.data.userVotedHelpful).toBe(true);

    // Step 7: Customer 2 reports review
    const reportRes = await request(app)
      .post(`/api/v1/reviews/${reviewId}/report`)
      .set('Cookie', [reviewer2Cookie])
      .send({
        reason: 'SPAM',
        description: 'Testing abuse reporting pipeline.'
      });

    expect(reportRes.status).toBe(201);
    const reportId = reportRes.body.data.id;
    expect(reportRes.body.data.status).toBe('PENDING');

    // Duplicate report by same customer is rejected (409)
    const dupReportRes = await request(app)
      .post(`/api/v1/reviews/${reviewId}/report`)
      .set('Cookie', [reviewer2Cookie])
      .send({
        reason: 'SPAM',
        description: 'Duplicate report attempt.'
      });
    expect(dupReportRes.status).toBe(409);
    expect(dupReportRes.body.error.code).toBe('REVIEW_ALREADY_REPORTED');

    // Step 8: Admin inspects reviews on operational dashboard
    const adminReviewsRes = await request(app)
      .get('/api/v1/admin/reviews?status=PUBLISHED')
      .set('Cookie', [adminCookie]);

    expect(adminReviewsRes.status).toBe(200);
    expect(adminReviewsRes.body.data.length).toBe(1);
    expect(adminReviewsRes.body.data[0].reportedCount).toBe(1);

    // Step 9: Admin inspects reports
    const adminReportsRes = await request(app)
      .get('/api/v1/admin/reviews/reports?status=PENDING')
      .set('Cookie', [adminCookie]);

    expect(adminReportsRes.status).toBe(200);
    expect(adminReportsRes.body.data.length).toBe(1);
    expect(adminReportsRes.body.data[0].id).toBe(reportId);

    // Step 10: Admin resolves report with reviewAction: 'HIDE_REVIEW'
    const resolveRes = await request(app)
      .patch(`/api/v1/admin/reviews/reports/${reportId}`)
      .set('Cookie', [adminCookie])
      .send({
        status: 'RESOLVED',
        reviewAction: 'HIDE_REVIEW',
        resolutionNotes: 'Verified spam complaint, hid review from public catalog.'
      });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.status).toBe('RESOLVED');

    // Step 11: Review is now HIDDEN and does NOT appear in public catalog
    const publicAfterHideRes = await request(app)
      .get(`/api/v1/vehicles/${testVehicleId}/reviews`);
    expect(publicAfterHideRes.body.data.length).toBe(0);

    // Step 12: Vehicle aggregate updated to 0 reviews since review is hidden
    const vDocAfterHide = await VehicleModel.findById(testVehicleId).exec();
    expect(vDocAfterHide!.rating.count).toBe(0);
    expect(vDocAfterHide!.rating.average).toBe(0);

    // Step 13: Audit log inspection verifies operational audit trail
    const auditLogs = await AuditLogModel.find({
      entityType: { $in: ['REVIEW', 'REVIEW_REPORT'] }
    }).exec();

    expect(auditLogs.length).toBeGreaterThan(0);
  });

  describe('Security & RBAC Enforcement on Review Operations', () => {
    it('should reject non-admin from accessing admin moderation routes', async () => {
      const getRes = await request(app)
        .get('/api/v1/admin/reviews')
        .set('Cookie', [customerCookie]);
      expect(getRes.status).toBe(403);

      const fakeId = new Types.ObjectId().toString();
      const modRes = await request(app)
        .patch(`/api/v1/admin/reviews/${fakeId}/moderate`)
        .set('Cookie', [customerCookie])
        .send({ moderationStatus: 'HIDDEN' });
      expect(modRes.status).toBe(403);

      const repRes = await request(app)
        .get('/api/v1/admin/reviews/reports')
        .set('Cookie', [customerCookie]);
      expect(repRes.status).toBe(403);
    });

    it('should allow customer to view their own reviews via GET /api/v1/me/reviews', async () => {
      const booking = await createTestBooking(customerId);
      await request(app)
        .post(`/api/v1/bookings/${booking._id}/review`)
        .set('Cookie', [customerCookie])
        .send({
          rating: 4,
          title: 'My Trip',
          comment: 'Very pleasant rental.'
        });

      const res = await request(app)
        .get('/api/v1/me/reviews')
        .set('Cookie', [customerCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('My Trip');
    });

    it('should allow customer to soft-delete their own review and recalculate aggregates', async () => {
      const booking = await createTestBooking(customerId);
      const createRes = await request(app)
        .post(`/api/v1/bookings/${booking._id}/review`)
        .set('Cookie', [customerCookie])
        .send({
          rating: 5,
          title: 'Will delete this',
          comment: 'Test comment to be soft-deleted by customer.'
        });
      const reviewId = createRes.body.data.id;

      // Another user cannot delete
      const failDeleteRes = await request(app)
        .delete(`/api/v1/reviews/${reviewId}`)
        .set('Cookie', [reviewer2Cookie]);
      expect(failDeleteRes.status).toBe(403);

      // Owner deletes
      const deleteRes = await request(app)
        .delete(`/api/v1/reviews/${reviewId}`)
        .set('Cookie', [customerCookie]);
      expect(deleteRes.status).toBe(200);

      // Verify soft-deleted
      const dbReview = await ReviewModel.findById(reviewId).exec();
      expect(dbReview!.isDeleted).toBe(true);
      expect(dbReview!.status).toBe('DELETED');

      // Aggregate recalculated
      const vDoc = await VehicleModel.findById(testVehicleId).exec();
      expect(vDoc!.rating.count).toBe(0);
    });
  });
});
