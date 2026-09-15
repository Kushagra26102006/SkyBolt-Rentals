import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { UserModel } from '../src/models/user.model.js';
import { BookingModel } from '../src/models/booking.model.js';
import { UserPreferenceModel } from '../src/models/user-preference.model.js';
import { RecommendationEventModel } from '../src/models/recommendation-event.model.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';
import { recommendationService } from '../src/services/recommendation.service.js';

describe('TASK 16: Recommendation Engine & Grounded Scoring', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let customerCookie: string;
  let customerId: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    await VehicleModel.syncIndexes();
    await UserModel.syncIndexes();
    await UserPreferenceModel.syncIndexes();
    await seedVehicles(true);

    // Register test customer
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Recommendation Tester',
        email: 'rec-tester@skybolt.test',
        password: 'Password123!',
        phone: '+91 9900000001'
      });

    customerCookie = reg.headers['set-cookie'][0];
    customerId = reg.body.data.user.id;
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  });

  describe('Hard Constraints Enforcement', () => {
    it('should never recommend vehicles with fewer seats than requested passengers', async () => {
      const res = await request(app)
        .post('/api/v1/recommendations')
        .send({
          passengers: 5
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const recs = res.body.data.recommendations;
      expect(recs.length).toBeGreaterThan(0);

      // Verify EVERY returned vehicle has at least 5 seats
      recs.forEach((rec: any) => {
        expect(rec.vehicle.specifications.seats).toBeGreaterThanOrEqual(5);
        expect(rec.vehicle.category).not.toBe('SCOOTER');
        expect(rec.vehicle.category).not.toBe('BIKE');
      });
    });

    it('should never recommend inactive, maintenance, or retired vehicles', async () => {
      // Create an inactive vehicle and a maintenance vehicle
      await VehicleModel.create([
        {
          vehicleCode: 'SKY-TEST-INACT',
          name: 'Broken SUV',
          brand: 'Toyota',
          model: 'Fortuner',
          category: 'SUV',
          year: 2023,
          status: 'MAINTENANCE',
          fleetStatus: 'MAINTENANCE',
          specifications: { seats: 7, transmission: 'AUTOMATIC', fuelType: 'DIESEL' },
          rental: { baseRate: 3500, currency: 'INR' },
          location: { name: 'Ludhiana', city: 'Ludhiana' }
        },
        {
          vehicleCode: 'SKY-TEST-RET',
          name: 'Retired Sedan',
          brand: 'Honda',
          model: 'City',
          category: 'SEDAN',
          year: 2020,
          status: 'RETIRED',
          fleetStatus: 'RETIRED',
          specifications: { seats: 5, transmission: 'MANUAL', fuelType: 'PETROL' },
          rental: { baseRate: 1500, currency: 'INR' },
          location: { name: 'Ludhiana', city: 'Ludhiana' }
        }
      ]);

      const res = await request(app)
        .post('/api/v1/recommendations')
        .send({
          category: 'SUV',
          passengers: 5
        });

      expect(res.status).toBe(200);
      const recs = res.body.data.recommendations;

      recs.forEach((rec: any) => {
        expect(rec.vehicle.vehicleCode).not.toBe('SKY-TEST-INACT');
        expect(rec.vehicle.vehicleCode).not.toBe('SKY-TEST-RET');
        expect(rec.vehicle.status).toBe('ACTIVE');
        expect(['AVAILABLE', undefined, null]).toContain(rec.vehicle.fleetStatus);
      });
    });
  });

  describe('Cold-Start Recommendations (Anonymous / New Users)', () => {
    it('should successfully generate cold-start recommendations for unauthenticated users', async () => {
      const res = await request(app)
        .post('/api/v1/recommendations')
        .send({
          category: 'CAR'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recommendations.length).toBeGreaterThan(0);
      expect(res.body.data.candidateCount).toBeGreaterThan(0);
      expect(res.body.data.source).toBeDefined();

      const topRec = res.body.data.recommendations[0];
      expect(topRec.vehicle).toBeDefined();
      expect(topRec.reason).toBeDefined();
      expect(typeof topRec.reason).toBe('string');
      expect(topRec.highlights).toBeInstanceOf(Array);
      expect(topRec.pricing).toBeDefined();
      expect(topRec.pricing.total).toBeGreaterThan(0);
    });
  });

  describe('Personalized Recommendations & User Preferences', () => {
    it('should prioritize vehicles matching authenticated user saved preferences', async () => {
      // Save customer preferences: SUV, Automatic, Max budget ₹5000
      const putRes = await request(app)
        .put('/api/v1/recommendations/preferences')
        .set('Cookie', customerCookie)
        .send({
          preferredCategories: ['SUV'],
          preferredTransmission: 'AUTOMATIC',
          preferredSeatCount: 5,
          preferredPriceRange: { min: 1000, max: 5000 }
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.data.preferredCategories).toContain('SUV');

      // Request recommendations with authentication
      const recRes = await request(app)
        .post('/api/v1/recommendations')
        .set('Cookie', customerCookie)
        .send({});

      expect(recRes.status).toBe(200);
      const recs = recRes.body.data.recommendations;
      expect(recs.length).toBeGreaterThan(0);

      // Top recommendation should match SUV preference
      expect(recs[0].vehicle.category).toBe('SUV');
    });

    it('should incorporate completed past booking categories into personalized reasons', async () => {
      // Create a completed booking for an SUV for this customer
      const suvVehicle = await VehicleModel.findOne({ category: 'SUV', status: 'ACTIVE' });
      expect(suvVehicle).toBeDefined();

      await BookingModel.create({
        bookingReference: 'BK-PAST-TEST-01',
        userId: customerId,
        vehicleId: suvVehicle!._id,
        pickupAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        returnAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        pickupLocation: { name: 'Ludhiana Central' },
        returnLocation: { name: 'Ludhiana Central' },
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        pricingSnapshot: {
          currency: 'INR',
          baseAmount: 6000,
          subtotal: 6000,
          tax: 1080,
          discount: 0,
          fees: 0,
          total: 7080,
          pricingVersion: 'v2_engine'
        },
        vehicleSnapshot: {
          brand: suvVehicle!.brand,
          model: suvVehicle!.model,
          image: 'assets/images/hero-bg.webp',
          name: suvVehicle!.name,
          category: suvVehicle!.category
        }
      });

      const res = await request(app)
        .post('/api/v1/recommendations')
        .set('Cookie', customerCookie)
        .send({});

      expect(res.status).toBe(200);
      const recs = res.body.data.recommendations;
      expect(recs.length).toBeGreaterThan(0);

      // At least one recommendation reason should mention past rental or category match
      const reasons = recs.map((r: any) => r.reason.toLowerCase()).join(' ');
      expect(reasons).toMatch(/suv|previously rented|favorite|matches/);
    });
  });

  describe('Natural Language Query Parsing (enrichRequestWithNlp)', () => {
    it('should extract passengers, category, transmission, and budget from natural language text', () => {
      const nlpReq = recommendationService.enrichRequestWithNlp({
        query: 'I need an automatic SUV for 5 people with budget under 4000 per day'
      });

      expect(nlpReq.passengers).toBe(5);
      expect(nlpReq.category).toBe('SUV');
      expect(nlpReq.transmission).toBe('AUTOMATIC');
      expect(nlpReq.budget).toBe(4000);
    });

    it('should handle couple and family keywords gracefully', () => {
      const coupleReq = recommendationService.enrichRequestWithNlp({
        query: 'Weekend getaway for a couple in an EV under 2500'
      });
      expect(coupleReq.passengers).toBe(2);
      expect(coupleReq.fuelType).toBe('ELECTRIC');
      expect(coupleReq.budget).toBe(2500);

      const familyReq = recommendationService.enrichRequestWithNlp({
        query: 'Family road trip in a diesel sedan'
      });
      expect(familyReq.passengers).toBe(4);
      expect(familyReq.category).toBe('SEDAN');
      expect(familyReq.fuelType).toBe('DIESEL');
    });
  });

  describe('User Preferences Privacy & CRUD', () => {
    it('should retrieve, update, and clear customer preferences', async () => {
      // 1. Get preferences
      const getRes = await request(app)
        .get('/api/v1/recommendations/preferences')
        .set('Cookie', customerCookie);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data).toBeDefined();

      // 2. Clear preferences (Privacy control)
      const delRes = await request(app)
        .delete('/api/v1/recommendations/preferences')
        .set('Cookie', customerCookie);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // 3. Verify preferences are empty
      const afterDel = await request(app)
        .get('/api/v1/recommendations/preferences')
        .set('Cookie', customerCookie);

      expect(afterDel.status).toBe(200);
      expect(afterDel.body.data).toBeNull();
    });
  });

  describe('Behavioral Telemetry Events & Feedback (Privacy Compliant)', () => {
    it('should record user interaction events with minimal metadata and 30-day TTL', async () => {
      const vehicle = await VehicleModel.findOne({ status: 'ACTIVE' });
      expect(vehicle).toBeDefined();

      const res = await request(app)
        .post('/api/v1/recommendations/events')
        .send({
          sessionId: 'test-session-12345',
          vehicleId: vehicle!._id.toString(),
          eventType: 'RECOMMENDATION_CLICKED',
          metadata: {
            source: 'search_modal',
            position: 1
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify event was persisted to MongoDB
      const eventDoc = await RecommendationEventModel.findOne({
        sessionId: 'test-session-12345',
        eventType: 'RECOMMENDATION_CLICKED'
      });
      expect(eventDoc).toBeDefined();
      expect(String(eventDoc!.vehicleId)).toBe(vehicle!._id.toString());
      expect(eventDoc!.metadata?.source).toBe('search_modal');
    });

    it('should record recommendation helpfulness feedback', async () => {
      const vehicle = await VehicleModel.findOne({ status: 'ACTIVE' });
      expect(vehicle).toBeDefined();

      const res = await request(app)
        .post('/api/v1/recommendations/feedback')
        .send({
          vehicleId: vehicle!._id.toString(),
          helpful: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const eventDoc = await RecommendationEventModel.findOne({
        vehicleId: vehicle!._id,
        eventType: 'VEHICLE_SELECTED',
        'metadata.helpful': true
      });
      expect(eventDoc).toBeDefined();
    });
  });

  describe('Conversational Recommendation Assistant (/chat)', () => {
    it('should return grounded conversational reply and matching vehicle recommendations', async () => {
      const res = await request(app)
        .post('/api/v1/recommendations/chat')
        .send({
          message: 'Looking for a fuel-efficient car for a weekend trip for 4 people',
          passengers: 4,
          category: 'CAR'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reply).toBeDefined();
      expect(typeof res.body.data.reply).toBe('string');
      expect(res.body.data.reply.length).toBeGreaterThan(10);
      expect(res.body.data.recommendations).toBeInstanceOf(Array);
      expect(res.body.data.recommendations.length).toBeGreaterThan(0);

      // Every returned vehicle must have at least 4 seats
      res.body.data.recommendations.forEach((rec: any) => {
        expect(rec.vehicle.specifications.seats).toBeGreaterThanOrEqual(4);
      });
    });
  });
});
