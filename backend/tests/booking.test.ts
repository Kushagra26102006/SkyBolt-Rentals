import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { UserModel } from '../src/models/user.model.js';
import { ReservationModel } from '../src/models/reservation.model.js';
import { BookingModel } from '../src/models/booking.model.js';
import { IdempotencyModel } from '../src/models/idempotency.model.js';
import { BookingStateMachine } from '../src/services/booking-state-machine.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';

describe('TASK 08: Production Booking State Machine & Reservations API', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let userOneCookie: string;
  let userOneId: string;
  let userTwoCookie: string;
  let userTwoId: string;

  let testVehicleId: string;
  let testVehicleCode: string;
  let maintenanceVehicleId: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    await VehicleModel.syncIndexes();
    await ReservationModel.syncIndexes();
    await BookingModel.syncIndexes();
    await IdempotencyModel.syncIndexes();
    await seedVehicles(true);

    // Register Customer One (Alice)
    const reg1 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Alice Customer',
        email: 'alice.customer@skybolt.test',
        password: 'Password123!',
        phone: '+91 9800001111'
      });
    userOneCookie = reg1.headers['set-cookie'][0];
    userOneId = reg1.body.data.user.id;

    // Register Customer Two (Bob)
    const reg2 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Bob Customer',
        email: 'bob.customer@skybolt.test',
        password: 'Password123!',
        phone: '+91 9800002222'
      });
    userTwoCookie = reg2.headers['set-cookie'][0];
    userTwoId = reg2.body.data.user.id;

    // Active test vehicle
    const activeVehicle = await VehicleModel.findOne({ vehicleCode: 'SKY-VHC-001' });
    testVehicleId = activeVehicle!._id.toString();
    testVehicleCode = activeVehicle!.vehicleCode;

    // Maintenance vehicle
    const maintVehicle = await VehicleModel.create({
      vehicleCode: 'SKY-MAINT-999',
      brand: 'Tata',
      model: 'Nexon EV',
      name: 'Tata Nexon EV',
      year: 2024,
      category: 'EV',
      status: 'MAINTENANCE',
      specifications: {
        seats: 5,
        transmission: 'AUTOMATIC',
        fuelType: 'ELECTRIC'
      },
      rental: {
        baseRate: 2200,
        currency: 'INR'
      },
      location: {
        name: 'Indiranagar Hub',
        city: 'Bengaluru'
      },
      images: [{ url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341', isPrimary: true }],
      isDeleted: false
    });
    maintenanceVehicleId = maintVehicle._id.toString();
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  describe('1. Booking Model & State Machine Unit Tests', () => {
    it('should allow all valid state transitions in the state machine', () => {
      // Linear happy path
      expect(BookingStateMachine.canTransition('DRAFT', 'PENDING')).toBe(true);
      expect(BookingStateMachine.canTransition('PENDING', 'PAYMENT_PENDING')).toBe(true);
      expect(BookingStateMachine.canTransition('PAYMENT_PENDING', 'CONFIRMED')).toBe(true);
      expect(BookingStateMachine.canTransition('CONFIRMED', 'ACTIVE')).toBe(true);
      expect(BookingStateMachine.canTransition('ACTIVE', 'COMPLETED')).toBe(true);

      // Cancellations
      expect(BookingStateMachine.canTransition('PENDING', 'CANCELLED')).toBe(true);
      expect(BookingStateMachine.canTransition('PAYMENT_PENDING', 'CANCELLED')).toBe(true);
      expect(BookingStateMachine.canTransition('CONFIRMED', 'CANCELLED')).toBe(true);

      // Expirations
      expect(BookingStateMachine.canTransition('PENDING', 'EXPIRED')).toBe(true);
      expect(BookingStateMachine.canTransition('PAYMENT_PENDING', 'EXPIRED')).toBe(true);
    });

    it('should reject all invalid state transitions', () => {
      // Reversing completed
      expect(BookingStateMachine.canTransition('COMPLETED', 'CONFIRMED')).toBe(false);
      expect(BookingStateMachine.canTransition('COMPLETED', 'PENDING')).toBe(false);

      // Resurrecting cancelled
      expect(BookingStateMachine.canTransition('CANCELLED', 'ACTIVE')).toBe(false);
      expect(BookingStateMachine.canTransition('CANCELLED', 'CONFIRMED')).toBe(false);

      // Resurrecting expired
      expect(BookingStateMachine.canTransition('EXPIRED', 'CONFIRMED')).toBe(false);

      // Illegal skip
      expect(BookingStateMachine.canTransition('DRAFT', 'COMPLETED')).toBe(false);
      expect(BookingStateMachine.canTransition('PENDING', 'ACTIVE')).toBe(false);

      expect(() => BookingStateMachine.assertTransition('COMPLETED', 'ACTIVE')).toThrow();
    });

    it('should enforce database-level unique index on bookingReference', async () => {
      const ref = 'SKY-20260904-TEST01';
      const pDate = new Date(Date.now() + 86400000);
      const rDate = new Date(Date.now() + 86400000 * 3);

      await BookingModel.create({
        bookingReference: ref,
        userId: new Types.ObjectId(userOneId),
        vehicleId: new Types.ObjectId(testVehicleId),
        pickupAt: pDate,
        returnAt: rDate,
        pickupLocation: { name: 'Main Hub' },
        returnLocation: { name: 'Main Hub' },
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        pricingSnapshot: {
          currency: 'INR',
          baseAmount: 1500,
          subtotal: 3000,
          tax: 540,
          discount: 0,
          fees: 1000,
          total: 4540,
          pricingVersion: 'v1_base'
        },
        vehicleSnapshot: {
          brand: 'Hyundai',
          model: 'Creta',
          image: 'https://example.com/creta.jpg',
          name: 'Hyundai Creta'
        }
      });

      // Attempt duplicate bookingReference
      await expect(
        BookingModel.create({
          bookingReference: ref,
          userId: new Types.ObjectId(userTwoId),
          vehicleId: new Types.ObjectId(testVehicleId),
          pickupAt: pDate,
          returnAt: rDate,
          pickupLocation: { name: 'Main Hub' },
          returnLocation: { name: 'Main Hub' },
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          pricingSnapshot: {
            currency: 'INR',
            baseAmount: 1500,
            subtotal: 3000,
            tax: 540,
            discount: 0,
            fees: 1000,
            total: 4540,
            pricingVersion: 'v1_base'
          },
          vehicleSnapshot: {
            brand: 'Hyundai',
            model: 'Creta',
            image: 'https://example.com/creta.jpg',
            name: 'Hyundai Creta'
          }
        })
      ).rejects.toThrow();
    });
  });

  describe('2. POST /api/v1/bookings (Booking Creation & Concurrency)', () => {
    it('should reject unauthenticated booking creation with 401', async () => {
      const p = new Date(Date.now() + 86400000 * 5).toISOString();
      const r = new Date(Date.now() + 86400000 * 7).toISOString();

      const res = await request(app)
        .post('/api/v1/bookings')
        .send({
          vehicleId: testVehicleId,
          pickupAt: p,
          returnAt: r
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject booking on a vehicle in MAINTENANCE status with 409', async () => {
      const p = new Date(Date.now() + 86400000 * 5).toISOString();
      const r = new Date(Date.now() + 86400000 * 7).toISOString();

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userOneCookie)
        .send({
          vehicleId: maintenanceVehicleId,
          pickupAt: p,
          returnAt: r
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('VEHICLE_NOT_RENTABLE');
    });

    it('should successfully create a booking, register reservation, and calculate baseline price', async () => {
      const p = new Date(Date.now() + 86400000 * 10);
      const r = new Date(Date.now() + 86400000 * 13); // 3 days

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userOneCookie)
        .send({
          vehicleId: testVehicleId,
          pickupAt: p.toISOString(),
          returnAt: r.toISOString(),
          pickupLocation: 'Indiranagar Hub',
          notes: 'Customer requested GPS navigation'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bookingReference).toMatch(/^SKY-\d{8}-[A-Z0-9]{6}$/);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.paymentStatus).toBe('UNPAID');
      expect(res.body.data.vehicle.brand).toBeDefined();

      // Check authoritative price calculation (3 days with 5% duration discount)
      const v = await VehicleModel.findById(testVehicleId);
      const grossBase = v!.rental.baseRate * 3;
      const expectedDiscount = Math.round(grossBase * 0.05); // 5% extended rental discount
      const expectedSubtotal = grossBase - expectedDiscount;
      const expectedTax = Math.round((expectedSubtotal * 0.18 + Number.EPSILON) * 100) / 100; // 153.90
      const expectedTotal = Math.round((expectedSubtotal + expectedTax + 1000 + Number.EPSILON) * 100) / 100; // 2008.90

      expect(res.body.data.pricing.baseAmount).toBe(grossBase);
      expect(res.body.data.pricing.discount).toBe(expectedDiscount);
      expect(res.body.data.pricing.subtotal).toBe(expectedSubtotal);
      expect(res.body.data.pricing.tax).toBe(expectedTax);
      expect(res.body.data.pricing.total).toBe(expectedTotal);
      expect(res.body.data.pricing.pricingVersion).toBe('v2_engine');

      // Verify underlying ReservationModel record was created to block inventory
      const reservation = await ReservationModel.findOne({
        vehicleId: new Types.ObjectId(testVehicleId),
        status: 'CONFIRMED'
      });
      expect(reservation).not.toBeNull();
      expect(reservation!.status).toBe('CONFIRMED');
    });

    it('should reject double-booking when overlapping dates are requested', async () => {
      // Overlap with the booking created in previous test (days 10 to 13)
      const pOverlap = new Date(Date.now() + 86400000 * 11).toISOString();
      const rOverlap = new Date(Date.now() + 86400000 * 14).toISOString();

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userTwoCookie)
        .send({
          vehicleId: testVehicleId,
          pickupAt: pOverlap,
          returnAt: rOverlap
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('VEHICLE_UNAVAILABLE');
    });

    it('MANDATORY CONCURRENCY: should prevent double-booking under concurrent simultaneous requests', async () => {
      // Two users concurrently attempt to book days 20 to 23 on testVehicleId
      const p = new Date(Date.now() + 86400000 * 20).toISOString();
      const r = new Date(Date.now() + 86400000 * 23).toISOString();

      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/bookings')
          .set('Cookie', userOneCookie)
          .send({
            vehicleId: testVehicleId,
            pickupAt: p,
            returnAt: r
          }),
        request(app)
          .post('/api/v1/bookings')
          .set('Cookie', userTwoCookie)
          .send({
            vehicleId: testVehicleId,
            pickupAt: p,
            returnAt: r
          })
      ]);

      const statuses = [res1.status, res2.status];
      // Exactly 1 must succeed with 201; exactly 1 must conflict with 409
      expect(statuses).toContain(201);
      expect(statuses).toContain(409);

      const successRes = res1.status === 201 ? res1 : res2;
      const failRes = res1.status === 409 ? res1 : res2;

      expect(successRes.body.data.status).toBe('PENDING');
      expect(failRes.body.error.code).toBe('VEHICLE_UNAVAILABLE');
    });

    it('MANDATORY 50 CONCURRENT BOOKINGS: 50 simultaneous booking attempts for same vehicle and dates must result in exactly 1 success and 49 safe rejections', async () => {
      const p = new Date(Date.now() + 86400000 * 45).toISOString();
      const r = new Date(Date.now() + 86400000 * 48).toISOString();

      // Launch 50 simultaneous booking requests across userOne and userTwo sessions
      const bookingAttempts = Array.from({ length: 50 }).map((_, idx) =>
        request(app)
          .post('/api/v1/bookings')
          .set('Cookie', idx % 2 === 0 ? userOneCookie : userTwoCookie)
          .send({
            vehicleId: testVehicleId,
            pickupAt: p,
            returnAt: r
          })
      );

      const responses = await Promise.all(bookingAttempts);

      const successfulBookings = responses.filter((res) => res.status === 201);
      const rejectedBookings = responses.filter((res) => res.status === 409);

      expect(successfulBookings.length).toBe(1);
      expect(rejectedBookings.length).toBe(49);
      expect(responses.length).toBe(50);

      // Verify successful booking is in PENDING state
      expect(successfulBookings[0].body.data.status).toBe('PENDING');

      // Verify all 49 rejected requests return safe VEHICLE_UNAVAILABLE error
      rejectedBookings.forEach((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('VEHICLE_UNAVAILABLE');
      });
    });
  });

  describe('3. Idempotency Protection', () => {
    it('should return identical cached booking on repeated requests with same Idempotency-Key', async () => {
      const idempotencyKey = `idemp_${Date.now()}_abc`;
      const p = new Date(Date.now() + 86400000 * 30).toISOString();
      const r = new Date(Date.now() + 86400000 * 32).toISOString();

      // First call
      const res1 = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userOneCookie)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          vehicleId: testVehicleId,
          pickupAt: p,
          returnAt: r
        });

      expect(res1.status).toBe(201);
      const bookingRef1 = res1.body.data.bookingReference;

      // Repeated call with same key
      const res2 = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userOneCookie)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          vehicleId: testVehicleId,
          pickupAt: p,
          returnAt: r
        });

      expect(res2.status).toBe(201);
      expect(res2.body.data.bookingReference).toBe(bookingRef1);
      expect(res2.body.message).toContain('idempotent');

      // Verify no duplicate booking was created in DB
      const count = await BookingModel.countDocuments({
        bookingReference: bookingRef1
      });
      expect(count).toBe(1);
    });

    it('should reject if Idempotency-Key is reused with different parameters', async () => {
      const idempotencyKey = `idemp_conflict_${Date.now()}`;
      const p1 = new Date(Date.now() + 86400000 * 35).toISOString();
      const r1 = new Date(Date.now() + 86400000 * 37).toISOString();

      const res1 = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userOneCookie)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          vehicleId: testVehicleId,
          pickupAt: p1,
          returnAt: r1
        });

      expect(res1.status).toBe(201);

      // Reused with different dates
      const p2 = new Date(Date.now() + 86400000 * 40).toISOString();
      const r2 = new Date(Date.now() + 86400000 * 42).toISOString();

      const res2 = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userOneCookie)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          vehicleId: testVehicleId,
          pickupAt: p2,
          returnAt: r2
        });

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  describe('4. Anti-Mass-Assignment & Price Protection', () => {
    it('should ignore client attempts to manipulate userId, status, paymentStatus, and total', async () => {
      const p = new Date(Date.now() + 86400000 * 45).toISOString();
      const r = new Date(Date.now() + 86400000 * 47).toISOString();

      // Malicious payload attempting privilege escalation and free rental
      const maliciousPayload = {
        vehicleId: testVehicleId,
        pickupAt: p,
        returnAt: r,
        userId: userTwoId, // Trying to charge Bob
        status: 'CONFIRMED', // Trying to skip payment
        paymentStatus: 'PAID', // Trying to mark paid
        pricingSnapshot: { total: 1 }, // Trying to pay ₹1
        pricing: { total: 1 }
      };

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userOneCookie)
        .send(maliciousPayload);

      // Strict schema rejects unknown fields or ignores them
      if (res.status === 201) {
        expect(res.body.data.userId).toBe(userOneId);
        expect(res.body.data.status).toBe('PENDING');
        expect(res.body.data.paymentStatus).toBe('UNPAID');
        expect(res.body.data.pricing.total).toBeGreaterThan(1000);
      } else {
        // Zod strict rejection
        expect(res.status).toBe(422);
      }
    });
  });

  describe('5. Customer Booking History & Isolation', () => {
    it('should list only bookings belonging to the authenticated customer', async () => {
      const res = await request(app)
        .get('/api/v1/bookings')
        .set('Cookie', userOneCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      // All returned bookings must strictly belong to userOne
      for (const b of res.body.data) {
        expect(b.userId).toBe(userOneId);
      }
    });

    it('should support pagination and allowlisted sorting', async () => {
      const res = await request(app)
        .get('/api/v1/bookings?limit=1&page=1&sort=newest')
        .set('Cookie', userOneCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(1);
      expect(res.body.meta.total).toBeGreaterThan(0);
    });
  });

  describe('6. Booking Detail & Ownership Enforcement', () => {
    let aliceBookingId: string;

    beforeAll(async () => {
      const p = new Date(Date.now() + 86400000 * 50).toISOString();
      const r = new Date(Date.now() + 86400000 * 52).toISOString();

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userOneCookie)
        .send({
          vehicleId: testVehicleId,
          pickupAt: p,
          returnAt: r
        });
      aliceBookingId = res.body.data.id;
    });

    it('should allow Alice to view her own booking detail', async () => {
      const res = await request(app)
        .get(`/api/v1/bookings/${aliceBookingId}`)
        .set('Cookie', userOneCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(aliceBookingId);
      expect(res.body.data.userId).toBe(userOneId);
    });

    it('SECURITY: Bob attempting to view Alices booking must return 404 (zero data leakage)', async () => {
      const res = await request(app)
        .get(`/api/v1/bookings/${aliceBookingId}`)
        .set('Cookie', userTwoCookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  describe('7. Booking Cancellation & Inventory Release', () => {
    let cancelBookingId: string;
    const cancelPickup = new Date(Date.now() + 86400000 * 60);
    const cancelReturn = new Date(Date.now() + 86400000 * 63);

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userOneCookie)
        .send({
          vehicleId: testVehicleId,
          pickupAt: cancelPickup.toISOString(),
          returnAt: cancelReturn.toISOString()
        });
      cancelBookingId = res.body.data.id;
    });

    it('SECURITY: Bob cannot cancel Alices booking (returns 403 or 404)', async () => {
      const res = await request(app)
        .post(`/api/v1/bookings/${cancelBookingId}/cancel`)
        .set('Cookie', userTwoCookie)
        .send({
          reason: 'CUSTOMER_REQUEST',
          notes: 'Malicious attempt'
        });

      expect([403, 404]).toContain(res.status);
    });

    it('Alice can cancel her own booking, and the vehicle inventory is immediately released', async () => {
      // Step 1: Alice cancels her booking
      const res = await request(app)
        .post(`/api/v1/bookings/${cancelBookingId}/cancel`)
        .set('Cookie', userOneCookie)
        .send({
          reason: 'CUSTOMER_REQUEST',
          notes: 'Travel plans changed'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
      expect(res.body.data.cancellation.reason).toBe('CUSTOMER_REQUEST');
      expect(res.body.data.cancellation.notes).toBe('Travel plans changed');

      // Step 2: Verify inventory is released — Bob can now book the exact same dates!
      const bobRes = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userTwoCookie)
        .send({
          vehicleId: testVehicleId,
          pickupAt: cancelPickup.toISOString(),
          returnAt: cancelReturn.toISOString()
        });

      expect(bobRes.status).toBe(201);
      expect(bobRes.body.data.status).toBe('PENDING');
      expect(bobRes.body.data.userId).toBe(userTwoId);
    });

    it('should reject cancelling an already cancelled booking with 409', async () => {
      const res = await request(app)
        .post(`/api/v1/bookings/${cancelBookingId}/cancel`)
        .set('Cookie', userOneCookie)
        .send({
          reason: 'CUSTOMER_REQUEST'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });
  });
});
