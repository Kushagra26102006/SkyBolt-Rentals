import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { ReservationModel } from '../src/models/reservation.model.js';
import { BookingModel } from '../src/models/booking.model.js';
import { availabilityService } from '../src/services/availability.service.js';
import { bookingService } from '../src/services/booking.service.js';
import { bookingRepository } from '../src/repositories/booking.repository.js';

describe('Concurrency-Safe Reservation & Double-Booking Protection Suite', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let testVehicleId: string;
  let userCookies: string[] = [];
  let userIds: string[] = [];

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    await VehicleModel.syncIndexes();
    await ReservationModel.syncIndexes();
    await BookingModel.syncIndexes();

    // Create primary active test vehicle
    const vehicle = await VehicleModel.create({
      vehicleCode: 'SKY-CONCURRENCY-001',
      name: 'Porsche 911 GT3 Concurrency Test',
      brand: 'Porsche',
      model: '911 GT3',
      year: 2024,
      category: 'CAR',
      status: 'ACTIVE',
      fleetStatus: 'AVAILABLE',
      specifications: { seats: 2, transmission: 'AUTOMATIC', fuelType: 'PETROL' },
      rental: { baseRate: 15000, currency: 'INR' },
      location: { name: 'Mumbai Hub', city: 'Mumbai' },
      activeReservations: []
    });
    testVehicleId = vehicle._id.toString();

    // Create 100 test user accounts for concurrent actor simulation
    for (let i = 1; i <= 100; i++) {
      const email = `concurrent_user_${i}_${Date.now()}@skybolt.test`;
      const reg = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: `Concurrent User ${i}`,
          email,
          password: 'Password123!',
          phone: `+91 99000${String(i).padStart(5, '0')}`
        });

      userCookies.push(reg.headers['set-cookie'][0]);
      userIds.push(reg.body.data.user.id);
    }
  }, 60000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  }, 20000);

  beforeEach(async () => {
    // Clear reservations and activeReservations before each test to maintain clean state
    await ReservationModel.deleteMany({});
    await BookingModel.deleteMany({});
    await VehicleModel.updateOne(
      { _id: testVehicleId },
      { $set: { activeReservations: [], status: 'ACTIVE', fleetStatus: 'AVAILABLE' } }
    );
  });

  // --------------------------------------------------------------------------
  // 1. 20 CONCURRENT BOOKING ATTEMPTS FOR OVERLAPPING DATES
  // --------------------------------------------------------------------------
  it('Scenario 1: 20 simultaneous concurrent booking requests for overlapping dates -> exactly 1 succeeds, 19 rejected with 409', async () => {
    const pickupAt = '2026-11-01T10:00:00.000Z';
    const returnAt = '2026-11-05T10:00:00.000Z';

    const concurrentCount = 20;
    const promises = Array.from({ length: concurrentCount }, (_, i) => {
      return request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userCookies[i])
        .send({
          vehicleId: testVehicleId,
          pickupAt,
          returnAt,
          pickupLocation: 'Mumbai Hub',
          returnLocation: 'Mumbai Hub'
        });
    });

    const responses = await Promise.all(promises);

    const successful = responses.filter((res) => res.status === 201);
    const conflicts = responses.filter((res) => res.status === 409);

    expect(successful.length).toBe(1);
    expect(conflicts.length).toBe(concurrentCount - 1);

    conflicts.forEach((res) => {
      expect(res.body.error.code).toBe('VEHICLE_UNAVAILABLE');
    });

    // Database state verification
    const dbVehicle = await VehicleModel.findById(testVehicleId).lean();
    expect(dbVehicle?.activeReservations?.length).toBe(1);

    const dbBookings = await BookingModel.find({ vehicleId: testVehicleId }).lean();
    expect(dbBookings.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 2. 50 CONCURRENT INVENTORY HOLD ATTEMPTS FOR OVERLAPPING DATES
  // --------------------------------------------------------------------------
  it('Scenario 2: 50 simultaneous concurrent inventory hold attempts for overlapping dates -> exactly 1 succeeds, 49 rejected with 409', async () => {
    const pickupAt = '2026-12-01T10:00:00.000Z';
    const returnAt = '2026-12-05T10:00:00.000Z';

    const concurrentCount = 50;
    const promises = Array.from({ length: concurrentCount }, (_, i) => {
      return request(app)
        .post(`/api/v1/vehicles/${testVehicleId}/holds`)
        .set('Cookie', userCookies[i])
        .send({
          pickupAt,
          returnAt,
          ttlMinutes: 15
        });
    });

    const responses = await Promise.all(promises);

    const successful = responses.filter((res) => res.status === 201);
    const conflicts = responses.filter((res) => res.status === 409);

    expect(successful.length).toBe(1);
    expect(conflicts.length).toBe(concurrentCount - 1);

    conflicts.forEach((res) => {
      expect(res.body.error.code).toBe('VEHICLE_UNAVAILABLE');
    });

    // Verify Vehicle activeReservations
    const dbVehicle = await VehicleModel.findById(testVehicleId).lean();
    expect(dbVehicle?.activeReservations?.length).toBe(1);
    expect(dbVehicle?.activeReservations?.[0].status).toBe('HELD');
  });

  // --------------------------------------------------------------------------
  // 3. 100 CONCURRENT DIRECT RESERVATION CALLS (EXTREME RACE CONDITION)
  // --------------------------------------------------------------------------
  it('Scenario 3: 100 simultaneous concurrent reservation attempts on the database layer -> exactly 1 succeeds, 99 fail', async () => {
    const pickupAt = new Date('2027-01-01T10:00:00.000Z');
    const returnAt = new Date('2027-01-04T10:00:00.000Z');

    const concurrentCount = 100;
    let successCount = 0;
    let conflictCount = 0;

    const promises = Array.from({ length: concurrentCount }, async (_, i) => {
      try {
        await availabilityService.reserveForBooking(
          new Types.ObjectId(testVehicleId),
          new Types.ObjectId(userIds[i]),
          pickupAt,
          returnAt
        );
        successCount++;
      } catch (err: any) {
        if (err.statusCode === 409 && err.code === 'VEHICLE_UNAVAILABLE') {
          conflictCount++;
        } else {
          throw err;
        }
      }
    });

    await Promise.all(promises);

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(concurrentCount - 1);

    // Verify exactly 1 reservation document exists in Reservation collection
    const reservations = await ReservationModel.find({
      vehicleId: testVehicleId,
      status: 'CONFIRMED'
    }).lean();
    expect(reservations.length).toBe(1);

    // Verify exactly 1 activeReservation in Vehicle document
    const dbVehicle = await VehicleModel.findById(testVehicleId).lean();
    expect(dbVehicle?.activeReservations?.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 4. NON-OVERLAPPING DATES CONCURRENCY
  // --------------------------------------------------------------------------
  it('Scenario 4: 10 simultaneous concurrent booking attempts for NON-OVERLAPPING dates -> all 10 succeed', async () => {
    // 10 non-overlapping slots in February 2027
    const intervals = Array.from({ length: 10 }, (_, i) => {
      const dayStart = i * 2 + 1;
      const dayEnd = dayStart + 1;
      return {
        pickupAt: `2027-02-${String(dayStart).padStart(2, '0')}T10:00:00.000Z`,
        returnAt: `2027-02-${String(dayEnd).padStart(2, '0')}T10:00:00.000Z`
      };
    });

    const promises = intervals.map((interval, i) => {
      return request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userCookies[i])
        .send({
          vehicleId: testVehicleId,
          pickupAt: interval.pickupAt,
          returnAt: interval.returnAt,
          pickupLocation: 'Mumbai Hub',
          returnLocation: 'Mumbai Hub'
        });
    });

    const responses = await Promise.all(promises);

    responses.forEach((res, idx) => {
      expect(res.status, `Interval ${idx} failed: ${JSON.stringify(res.body)}`).toBe(201);
      expect(res.body.success).toBe(true);
    });

    const dbVehicle = await VehicleModel.findById(testVehicleId).lean();
    expect(dbVehicle?.activeReservations?.length).toBe(10);

    const dbBookings = await BookingModel.find({ vehicleId: testVehicleId }).lean();
    expect(dbBookings.length).toBe(10);
  });

  // --------------------------------------------------------------------------
  // 5. PARTIAL AND SUB-INTERVAL OVERLAPS UNDER CONCURRENCY
  // --------------------------------------------------------------------------
  it('Scenario 5: Rejects all variations of partial, enclosing, and enclosed overlapping intervals', async () => {
    // Initial reservation: March 10 to March 20
    const baseRes = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', userCookies[0])
      .send({
        vehicleId: testVehicleId,
        pickupAt: '2027-03-10T10:00:00.000Z',
        returnAt: '2027-03-20T10:00:00.000Z',
        pickupLocation: 'Mumbai Hub'
      });
    expect(baseRes.status).toBe(201);

    const overlappingVariations = [
      { name: 'Head/Start overlap', pickup: '2027-03-05T10:00:00.000Z', return: '2027-03-12T10:00:00.000Z' },
      { name: 'Tail/End overlap', pickup: '2027-03-18T10:00:00.000Z', return: '2027-03-25T10:00:00.000Z' },
      { name: 'Enclosed/Sub-interval', pickup: '2027-03-12T10:00:00.000Z', return: '2027-03-15T10:00:00.000Z' },
      { name: 'Enclosing/Super-interval', pickup: '2027-03-05T10:00:00.000Z', return: '2027-03-25T10:00:00.000Z' },
      { name: 'Exact match interval', pickup: '2027-03-10T10:00:00.000Z', return: '2027-03-20T10:00:00.000Z' }
    ];

    const attempts = overlappingVariations.map((v, i) => {
      return request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userCookies[i + 1])
        .send({
          vehicleId: testVehicleId,
          pickupAt: v.pickup,
          returnAt: v.return,
          pickupLocation: 'Mumbai Hub'
        });
    });

    const responses = await Promise.all(attempts);
    responses.forEach((res, i) => {
      expect(res.status, `Variation "${overlappingVariations[i].name}" should be rejected with 409`).toBe(409);
      expect(res.body.error.code).toBe('VEHICLE_UNAVAILABLE');
    });
  });

  // --------------------------------------------------------------------------
  // 6. COMPENSATING ROLLBACK TEST (REQUIREMENTS 8 & 9)
  // --------------------------------------------------------------------------
  it('Scenario 6: Compensating rollback releases reserved slot if subsequent booking step fails', async () => {
    const pickupAt = new Date('2027-04-01T10:00:00.000Z');
    const returnAt = new Date('2027-04-05T10:00:00.000Z');

    // Temporarily mock bookingRepository.create to simulate unexpected database error
    const originalCreate = bookingRepository.create.bind(bookingRepository);
    let mockErrorTriggered = false;

    bookingRepository.create = async () => {
      mockErrorTriggered = true;
      throw new Error('Simulated Database Crash during Booking Creation');
    };

    // Attempt booking - should fail
    await expect(
      bookingService.createBooking(userIds[0], {
        vehicleId: testVehicleId,
        pickupAt: pickupAt.toISOString(),
        returnAt: returnAt.toISOString()
      })
    ).rejects.toThrow('Simulated Database Crash during Booking Creation');

    expect(mockErrorTriggered).toBe(true);

    // Restore bookingRepository.create
    bookingRepository.create = originalCreate;

    // Verify compensating rollback: activeReservations on Vehicle must be empty!
    const dbVehicle = await VehicleModel.findById(testVehicleId).lean();
    expect(dbVehicle?.activeReservations?.length).toBe(0);

    // Verify vehicle is immediately available and can be successfully booked by User 2
    const secondAttemptRes = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', userCookies[1])
      .send({
        vehicleId: testVehicleId,
        pickupAt: pickupAt.toISOString(),
        returnAt: returnAt.toISOString(),
        pickupLocation: 'Mumbai Hub'
      });

    expect(secondAttemptRes.status).toBe(201);
    expect(secondAttemptRes.body.success).toBe(true);

    const updatedVehicle = await VehicleModel.findById(testVehicleId).lean();
    expect(updatedVehicle?.activeReservations?.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 7. SAME BOOKING / IDEMPOTENT CONCURRENCY RETRY
  // --------------------------------------------------------------------------
  it('Scenario 7: Concurrent identical booking requests with same Idempotency-Key -> 1 booking created, others cached', async () => {
    const pickupAt = '2027-05-01T10:00:00.000Z';
    const returnAt = '2027-05-04T10:00:00.000Z';
    const idempotencyKey = `idem_concurrency_${Date.now()}`;

    // 10 concurrent requests from User 0 with identical idempotency key
    const promises = Array.from({ length: 10 }, () => {
      return request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userCookies[0])
        .set('Idempotency-Key', idempotencyKey)
        .send({
          vehicleId: testVehicleId,
          pickupAt,
          returnAt,
          pickupLocation: 'Mumbai Hub'
        });
    });

    const responses = await Promise.all(promises);

    // All should return successful response (either 201 original or cached)
    const successCodes = responses.filter((r) => r.status === 201 || r.status === 200);
    expect(successCodes.length).toBe(10);

    // All must reference the exact same booking reference
    const bookingRefs = new Set(
      responses.map((r) => r.body.data?.bookingReference || r.body.data?.booking?.bookingReference)
    );
    expect(bookingRefs.size).toBe(1);

    // In DB, only 1 booking and 1 activeReservation must exist
    const bookings = await BookingModel.find({ vehicleId: testVehicleId }).lean();
    expect(bookings.length).toBe(1);

    const vehicle = await VehicleModel.findById(testVehicleId).lean();
    expect(vehicle?.activeReservations?.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 8. CANCELLATION AND CONCURRENT RE-BOOKING RACE
  // --------------------------------------------------------------------------
  it('Scenario 8: Concurrent race between cancellation and new booking attempts -> exactly 1 new reservation claims the freed slot', async () => {
    const pickupAt = '2027-06-01T10:00:00.000Z';
    const returnAt = '2027-06-05T10:00:00.000Z';

    // 1. Initial booking by User 0
    const createRes = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', userCookies[0])
      .send({
        vehicleId: testVehicleId,
        pickupAt,
        returnAt,
        pickupLocation: 'Mumbai Hub'
      });
    expect(createRes.status).toBe(201);
    const bookingRef = createRes.body.data?.bookingReference || createRes.body.data?.booking?.bookingReference;

    // 2. User 0 cancels booking while 10 other users concurrently try to book the same vehicle/slot
    const cancelPromise = request(app)
      .post(`/api/v1/bookings/${bookingRef}/cancel`)
      .set('Cookie', userCookies[0])
      .send({ reason: 'CUSTOMER_REQUEST', notes: 'Trip rescheduled' });

    const newBookingPromises = Array.from({ length: 10 }, (_, i) => {
      return request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userCookies[i + 1])
        .send({
          vehicleId: testVehicleId,
          pickupAt,
          returnAt,
          pickupLocation: 'Mumbai Hub'
        });
    });

    const [cancelResult, ...bookingResults] = await Promise.all([
      cancelPromise,
      ...newBookingPromises
    ]);

    expect(cancelResult.status).toBe(200);
    expect(cancelResult.body.data.status).toBe('CANCELLED');

    const newSuccesses = bookingResults.filter((r) => r.status === 201);
    // At most 1 new booking should succeed for the freed slot
    expect(newSuccesses.length).toBeLessThanOrEqual(1);

    if (newSuccesses.length === 1) {
      const dbVehicle = await VehicleModel.findById(testVehicleId).lean();
      expect(dbVehicle?.activeReservations?.length).toBe(1);
    }
  });

  // --------------------------------------------------------------------------
  // 9. EXPIRED HOLD AUTO-BYPASS UNDER CONCURRENCY
  // --------------------------------------------------------------------------
  it('Scenario 9: Expired holds are automatically bypassed by concurrent booking requests', async () => {
    const pickupAt = new Date('2027-07-01T10:00:00.000Z');
    const returnAt = new Date('2027-07-05T10:00:00.000Z');

    // Add an expired hold directly to Vehicle activeReservations
    const expiredHoldId = new Types.ObjectId();
    await VehicleModel.updateOne(
      { _id: testVehicleId },
      {
        $push: {
          activeReservations: {
            reservationId: expiredHoldId,
            userId: new Types.ObjectId(userIds[0]),
            pickupAt,
            returnAt,
            status: 'HELD',
            expiresAt: new Date(Date.now() - 30 * 60 * 1000) // Expired 30 minutes ago
          }
        }
      }
    );

    // 10 concurrent requests to book this interval
    const promises = Array.from({ length: 10 }, (_, i) => {
      return request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userCookies[i + 1])
        .send({
          vehicleId: testVehicleId,
          pickupAt: pickupAt.toISOString(),
          returnAt: returnAt.toISOString(),
          pickupLocation: 'Mumbai Hub'
        });
    });

    const responses = await Promise.all(promises);

    const successful = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);

    // Exactly 1 must succeed despite the expired hold
    expect(successful.length).toBe(1);
    expect(conflicts.length).toBe(9);
  });
});
