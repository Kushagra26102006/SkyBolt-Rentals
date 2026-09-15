import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { UserModel } from '../src/models/user.model.js';
import { ReservationModel } from '../src/models/reservation.model.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';

describe('TASK 07: Production Availability Engine & Inventory Locking', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let userOneCookie: string;
  let userOneId: string;
  let userTwoCookie: string;
  let userTwoId: string;

  let testVehicleId: string;
  let maintenanceVehicleId: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    await VehicleModel.syncIndexes();
    await ReservationModel.syncIndexes();
    await seedVehicles(true);

    // Register User 1
    const reg1 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Alice User',
        email: 'alice@skybolt.test',
        password: 'Password123!',
        phone: '+91 9800000001'
      });
    userOneCookie = reg1.headers['set-cookie'][0];
    userOneId = reg1.body.data.user.id;

    // Register User 2
    const reg2 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Bob User',
        email: 'bob@skybolt.test',
        password: 'Password123!',
        phone: '+91 9800000002'
      });
    userTwoCookie = reg2.headers['set-cookie'][0];
    userTwoId = reg2.body.data.user.id;

    // Fetch active test vehicle
    const vehicle = await VehicleModel.findOne({ vehicleCode: 'SKY-VHC-001' });
    testVehicleId = vehicle!._id.toString();

    // Create a vehicle in MAINTENANCE status
    const mVehicle = await VehicleModel.create({
      vehicleCode: 'TEST-MAINT-001',
      name: 'Maintenance Ducati Panigale',
      brand: 'Ducati',
      model: 'Panigale V4',
      year: 2024,
      category: 'BIKE',
      status: 'MAINTENANCE',
      specifications: { seats: 1, transmission: 'MANUAL', fuelType: 'PETROL' },
      rental: { baseRate: 3500, currency: 'INR' },
      location: { name: 'Delhi Hub', city: 'Delhi' }
    });
    maintenanceVehicleId = mVehicle._id.toString();
  }, 25000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  }, 20000);

  // --------------------------------------------------------------------------
  // 1. DATE VALIDATION & BOUNDARY TESTS
  // --------------------------------------------------------------------------
  describe('Date Validation Semantics', () => {
    it('should reject inverted date range (pickupAt >= returnAt) with 422', async () => {
      const res = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({
          pickupAt: '2026-10-15T10:00:00.000Z',
          returnAt: '2026-10-10T10:00:00.000Z'
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details[0].message).toContain('returnAt must be strictly after pickupAt');
    });

    it('should reject pickupAt in the past with 422', async () => {
      const res = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({
          pickupAt: '2020-01-01T10:00:00.000Z',
          returnAt: '2020-01-05T10:00:00.000Z'
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details[0].message).toContain('pickupAt cannot be in the past');
    });

    it('should reject non-ISO date formats with 422', async () => {
      const res = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({
          pickupAt: 'tomorrow-morning',
          returnAt: 'next-week'
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should reject rental duration exceeding maximum window (90 days)', async () => {
      const res = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({
          pickupAt: '2026-10-01T10:00:00.000Z',
          returnAt: '2027-02-01T10:00:00.000Z' // 123 days
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details[0].message).toContain('Rental duration cannot exceed 90 days');
    });
  });

  // --------------------------------------------------------------------------
  // 2. INTERVAL OVERLAP & BOUNDARY CALCULATION
  // --------------------------------------------------------------------------
  describe('Interval Overlap Logic & Boundary Calculations', () => {
    const basePickup = new Date('2026-11-10T10:00:00.000Z');
    const baseReturn = new Date('2026-11-15T10:00:00.000Z');

    beforeAll(async () => {
      // Seed a confirmed reservation: 10 Nov 10:00 -> 15 Nov 10:00 UTC
      await ReservationModel.create({
        vehicleId: new mongoose.Types.ObjectId(testVehicleId),
        userId: new mongoose.Types.ObjectId(userOneId),
        pickupAt: basePickup,
        returnAt: baseReturn,
        status: 'CONFIRMED'
      });
    });

    it('should detect partial overlap (starts before, ends during base)', async () => {
      const res = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({
          pickupAt: '2026-11-08T10:00:00.000Z',
          returnAt: '2026-11-12T10:00:00.000Z'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(false);
      expect(res.body.data.reason).toBe('VEHICLE_UNAVAILABLE');
    });

    it('should detect partial overlap (starts during, ends after base)', async () => {
      const res = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({
          pickupAt: '2026-11-12T10:00:00.000Z',
          returnAt: '2026-11-18T10:00:00.000Z'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(false);
      expect(res.body.data.reason).toBe('VEHICLE_UNAVAILABLE');
    });

    it('should detect complete enclosure (requested interval is inside base)', async () => {
      const res = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({
          pickupAt: '2026-11-11T10:00:00.000Z',
          returnAt: '2026-11-14T10:00:00.000Z'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(false);
      expect(res.body.data.reason).toBe('VEHICLE_UNAVAILABLE');
    });

    it('should detect encompassing interval (requested interval encloses base)', async () => {
      const res = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({
          pickupAt: '2026-11-08T10:00:00.000Z',
          returnAt: '2026-11-18T10:00:00.000Z'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(false);
      expect(res.body.data.reason).toBe('VEHICLE_UNAVAILABLE');
    });

    it('should detect exact same range as unavailable', async () => {
      const res = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({
          pickupAt: '2026-11-10T10:00:00.000Z',
          returnAt: '2026-11-15T10:00:00.000Z'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(false);
      expect(res.body.data.reason).toBe('VEHICLE_UNAVAILABLE');
    });

    it('should allow adjacent interval before (ends exactly at base pickup: 5 Nov -> 10 Nov 10:00 UTC)', async () => {
      const res = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({
          pickupAt: '2026-11-05T10:00:00.000Z',
          returnAt: '2026-11-10T10:00:00.000Z'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(true);
    });

    it('should allow adjacent interval after (starts exactly at base return: 15 Nov 10:00 UTC -> 20 Nov)', async () => {
      const res = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({
          pickupAt: '2026-11-15T10:00:00.000Z',
          returnAt: '2026-11-20T10:00:00.000Z'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(true);
    });

    it('should allow completely disjoint interval outside base', async () => {
      const res = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({
          pickupAt: '2026-11-25T10:00:00.000Z',
          returnAt: '2026-11-30T10:00:00.000Z'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(true);
    });

    it('should ignore CANCELLED or COMPLETED reservations during availability check', async () => {
      // Create a cancelled reservation overlapping with Dec 1 -> Dec 5
      await ReservationModel.create({
        vehicleId: new mongoose.Types.ObjectId(testVehicleId),
        userId: new mongoose.Types.ObjectId(userOneId),
        pickupAt: new Date('2026-12-01T10:00:00.000Z'),
        returnAt: new Date('2026-12-05T10:00:00.000Z'),
        status: 'CANCELLED'
      });

      const res = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({
          pickupAt: '2026-12-01T10:00:00.000Z',
          returnAt: '2026-12-05T10:00:00.000Z'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 3. VEHICLE OPERATIONAL STATUS CHECKS
  // --------------------------------------------------------------------------
  describe('Operational Vehicle Status vs Availability', () => {
    it('should return available: false with VEHICLE_MAINTENANCE for vehicles in maintenance', async () => {
      const res = await request(app)
        .get(`/api/v1/vehicles/${maintenanceVehicleId}/availability`)
        .query({
          pickupAt: '2026-10-10T10:00:00.000Z',
          returnAt: '2026-10-15T10:00:00.000Z'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(false);
      expect(res.body.data.reason).toBe('VEHICLE_MAINTENANCE');
    });

    it('should return 404 VEHICLE_NOT_FOUND for nonexistent vehicle ID', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .get(`/api/v1/vehicles/${fakeId}/availability`)
        .query({
          pickupAt: '2026-10-10T10:00:00.000Z',
          returnAt: '2026-10-15T10:00:00.000Z'
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('VEHICLE_NOT_FOUND');
    });
  });

  // --------------------------------------------------------------------------
  // 4. INVENTORY HOLDS & CONCURRENCY LOCKING
  // --------------------------------------------------------------------------
  describe('Inventory Holds & Concurrency Race Condition Protection', () => {
    const holdPickup = '2026-12-10T10:00:00.000Z';
    const holdReturn = '2026-12-15T10:00:00.000Z';
    let activeHoldId: string;

    it('should reject unauthenticated hold creation with 401', async () => {
      const res = await request(app)
        .post(`/api/v1/vehicles/${testVehicleId}/holds`)
        .send({ pickupAt: holdPickup, returnAt: holdReturn });

      expect(res.status).toBe(401);
    });

    it('should allow authenticated user to acquire an inventory hold', async () => {
      const res = await request(app)
        .post(`/api/v1/vehicles/${testVehicleId}/holds`)
        .set('Cookie', userOneCookie)
        .send({ pickupAt: holdPickup, returnAt: holdReturn });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hold).toBeDefined();
      expect(res.body.data.hold.status).toBe('HELD');
      expect(res.body.data.hold.holdToken).toMatch(/^hold_/);
      expect(res.body.data.hold.expiresAt).toBeDefined();

      activeHoldId = res.body.data.hold.id;
    });

    it('should report vehicle as unavailable while an active hold exists', async () => {
      const res = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({ pickupAt: holdPickup, returnAt: holdReturn });

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(false);
      expect(res.body.data.reason).toBe('VEHICLE_UNAVAILABLE');
    });

    it('should reject overlapping hold request with 409 Conflict', async () => {
      const res = await request(app)
        .post(`/api/v1/vehicles/${testVehicleId}/holds`)
        .set('Cookie', userTwoCookie)
        .send({
          pickupAt: '2026-12-12T10:00:00.000Z',
          returnAt: '2026-12-17T10:00:00.000Z'
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VEHICLE_UNAVAILABLE');
    });

    it('CONCURRENCY TEST: simultaneous overlapping hold requests must result in exactly 1 success and N conflicts', async () => {
      // Pick a brand new date window
      const concurrentPickup = '2026-12-20T10:00:00.000Z';
      const concurrentReturn = '2026-12-25T10:00:00.000Z';

      // Launch 10 concurrent requests simultaneously
      const requests = Array.from({ length: 10 }).map((_, idx) =>
        request(app)
          .post(`/api/v1/vehicles/${testVehicleId}/holds`)
          .set('Cookie', idx % 2 === 0 ? userOneCookie : userTwoCookie)
          .send({ pickupAt: concurrentPickup, returnAt: concurrentReturn })
      );

      const responses = await Promise.all(requests);

      const successfulHolds = responses.filter((r) => r.status === 201);
      const conflictRejections = responses.filter((r) => r.status === 409);

      // In a collision-proof system, exactly 1 succeeds and the rest conflict
      expect(successfulHolds.length).toBe(1);
      expect(conflictRejections.length).toBe(9);

      conflictRejections.forEach((res) => {
        expect(res.body.error.code).toBe('VEHICLE_UNAVAILABLE');
      });
    });

    it('should reject unauthorized user attempting to release another user hold with 403', async () => {
      // User 2 tries to release User 1's hold
      const res = await request(app)
        .delete(`/api/v1/holds/${activeHoldId}`)
        .set('Cookie', userTwoCookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow hold owner to release inventory hold', async () => {
      const res = await request(app)
        .delete(`/api/v1/holds/${activeHoldId}`)
        .set('Cookie', userOneCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify vehicle is immediately available again
      const availRes = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({ pickupAt: holdPickup, returnAt: holdReturn });

      expect(availRes.status).toBe(200);
      expect(availRes.body.data.available).toBe(true);
    });

    it('should ignore expired holds during availability checks', async () => {
      // Create a hold that expired 10 minutes ago
      await ReservationModel.create({
        vehicleId: new mongoose.Types.ObjectId(testVehicleId),
        userId: new mongoose.Types.ObjectId(userOneId),
        pickupAt: new Date('2027-01-10T10:00:00.000Z'),
        returnAt: new Date('2027-01-15T10:00:00.000Z'),
        status: 'HELD',
        expiresAt: new Date(Date.now() - 10 * 60 * 1000) // Expired in the past
      });

      const res = await request(app)
        .get(`/api/v1/vehicles/${testVehicleId}/availability`)
        .query({
          pickupAt: '2027-01-10T10:00:00.000Z',
          returnAt: '2027-01-15T10:00:00.000Z'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 5. VEHICLE CATALOG AVAILABILITY FILTERING (N+1 PREVENTION)
  // --------------------------------------------------------------------------
  describe('Vehicle Catalog Date Availability Filtering', () => {
    it('should filter out booked vehicles from GET /api/v1/vehicles without N+1 queries', async () => {
      const bookedDates = {
        pickupAt: '2026-11-12T10:00:00.000Z',
        returnAt: '2026-11-14T10:00:00.000Z'
      };

      // testVehicleId (SKY-VHC-001) has a confirmed reservation covering these dates
      const res = await request(app)
        .get('/api/v1/vehicles')
        .query({
          pickupAt: bookedDates.pickupAt,
          returnAt: bookedDates.returnAt
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const returnedIds = res.body.data.items.map((i: any) => i.id);
      expect(returnedIds).not.toContain(testVehicleId);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });
  });
});
