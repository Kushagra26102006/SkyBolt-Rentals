import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { CouponModel } from '../src/models/coupon.model.js';
import { BookingModel } from '../src/models/booking.model.js';
import { calculateRentalDuration, roundMoney } from '../src/pricing/pricing.utils.js';
import { pricingService, CURRENT_PRICING_VERSION } from '../src/pricing/pricing.service.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';

describe('TASK 09: Production Authoritative Server Pricing Engine', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let userCookie: string;
  let testVehicleId: string;
  let maintenanceVehicleId: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    await VehicleModel.syncIndexes();
    await CouponModel.syncIndexes();
    await BookingModel.syncIndexes();
    await seedVehicles(true);

    // Register Customer
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Pricing Tester',
        email: 'pricing.tester@skybolt.test',
        password: 'Password123!',
        phone: '+91 9800003333'
      });
    userCookie = reg.headers['set-cookie'][0];

    // Active test vehicle (baseRate: 300)
    const activeVehicle = await VehicleModel.findOne({ vehicleCode: 'SKY-VHC-001' });
    testVehicleId = activeVehicle!._id.toString();

    // Maintenance vehicle
    const maintVehicle = await VehicleModel.create({
      vehicleCode: 'SKY-MAINT-888',
      brand: 'Mahindra',
      model: 'Thar',
      name: 'Mahindra Thar 4x4',
      year: 2024,
      category: 'SUV',
      status: 'MAINTENANCE',
      specifications: {
        seats: 4,
        transmission: 'MANUAL',
        fuelType: 'DIESEL'
      },
      rental: {
        baseRate: 3500,
        currency: 'INR'
      },
      location: {
        name: 'Indiranagar Hub',
        city: 'Bengaluru'
      },
      images: [{ url: 'https://example.com/thar.jpg', isPrimary: true }],
      isDeleted: false
    });
    maintenanceVehicleId = maintVehicle._id.toString();

    // Seed test coupons
    await CouponModel.create([
      {
        code: 'SKYBOLT10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        minBookingAmount: 0,
        maxDiscountAmount: 1000,
        startsAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000 * 30),
        usageLimit: 500,
        usageCount: 0,
        isActive: true,
        description: '10% off up to ₹1,000'
      },
      {
        code: 'FLAT500',
        discountType: 'FIXED',
        discountValue: 500,
        minBookingAmount: 2500,
        startsAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000 * 30),
        usageLimit: 200,
        usageCount: 0,
        isActive: true,
        description: 'Flat ₹500 off on rentals above ₹2,500'
      },
      {
        code: 'EXPIRED20',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        startsAt: new Date(Date.now() - 86400000 * 10),
        expiresAt: new Date(Date.now() - 86400000 * 2), // Expired 2 days ago
        isActive: true,
        description: 'Expired promo'
      },
      {
        code: 'INACTIVE50',
        discountType: 'PERCENTAGE',
        discountValue: 50,
        isActive: false,
        description: 'Inactive coupon'
      }
    ]);
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  describe('1. Rental Duration Policy & Timezone Consistency', () => {
    it('should evaluate exactly 24 hours as 1 rental day', () => {
      const pickup = new Date('2026-09-10T10:00:00.000Z');
      const returnAt = new Date('2026-09-11T10:00:00.000Z');

      const duration = calculateRentalDuration(pickup, returnAt);
      expect(duration.value).toBe(1);
      expect(duration.unit).toBe('DAY');
      expect(duration.hoursTotal).toBe(24);
    });

    it('should respect the 1-hour grace period tolerance on 24-hour cycles', () => {
      const pickup = new Date('2026-09-10T10:00:00.000Z');
      // 24 hours + 45 minutes (within 1-hour grace window)
      const returnWithinGrace = new Date('2026-09-11T10:45:00.000Z');
      const duration1 = calculateRentalDuration(pickup, returnWithinGrace);
      expect(duration1.value).toBe(1);

      // 25 hours + 15 minutes (exceeds 1-hour grace window -> billed as 2 days)
      const returnPastGrace = new Date('2026-09-11T11:15:00.000Z');
      const duration2 = calculateRentalDuration(pickup, returnPastGrace);
      expect(duration2.value).toBe(2);
    });

    it('should correctly calculate multi-day rental intervals', () => {
      const pickup = new Date('2026-09-10T10:00:00.000Z');
      const return3Days = new Date('2026-09-13T10:00:00.000Z');
      const return7Days = new Date('2026-09-17T10:00:00.000Z');

      expect(calculateRentalDuration(pickup, return3Days).value).toBe(3);
      expect(calculateRentalDuration(pickup, return7Days).value).toBe(7);
    });

    it('should reject invalid or inverted date ranges', () => {
      const pickup = new Date('2026-09-10T10:00:00.000Z');
      const invalidReturn = new Date('2026-09-09T10:00:00.000Z');

      expect(() => calculateRentalDuration(pickup, invalidReturn)).toThrow();
    });
  });

  describe('2. Financial Precision & Centralized Rounding', () => {
    it('should eliminate floating point arithmetic drift', () => {
      // Classic 0.1 + 0.2 problem in IEEE 754
      const naive = 0.1 + 0.2;
      expect(naive).not.toBe(0.3); // 0.30000000000000004

      const precise = roundMoney(0.1 + 0.2);
      expect(precise).toBe(0.3);
    });

    it('should round fractional paise deterministically', () => {
      expect(roundMoney(1250.554)).toBe(1250.55);
      expect(roundMoney(1250.556)).toBe(1250.56);
      expect(roundMoney(100.005)).toBe(100.01);
    });
  });

  describe('3. Authoritative Pricing Rules & Duration Discounts', () => {
    it('should apply 0% discount for short rentals (1 to 2 days)', async () => {
      const vehicle = await VehicleModel.findById(testVehicleId);
      const p = new Date('2026-09-10T10:00:00.000Z');
      const r = new Date('2026-09-12T10:00:00.000Z'); // 2 days

      const { quote } = await pricingService.calculatePrice(vehicle!, p, r);

      expect(quote.duration.value).toBe(2);
      expect(quote.baseAmount).toBe(vehicle!.rental.baseRate * 2);
      expect(quote.discountAmount).toBe(0);
      expect(quote.subtotal).toBe(quote.baseAmount);
      expect(quote.taxAmount).toBe(roundMoney(quote.subtotal * 0.18));
      expect(quote.total).toBe(roundMoney(quote.subtotal + quote.taxAmount + quote.feeAmount));
      expect(quote.pricingVersion).toBe(CURRENT_PRICING_VERSION);
    });

    it('should apply 5% duration discount for 3 to 6 days rentals', async () => {
      const vehicle = await VehicleModel.findById(testVehicleId);
      const p = new Date('2026-09-10T10:00:00.000Z');
      const r = new Date('2026-09-14T10:00:00.000Z'); // 4 days

      const { quote } = await pricingService.calculatePrice(vehicle!, p, r);

      const gross = vehicle!.rental.baseRate * 4;
      const expectedDiscount = roundMoney(gross * 0.05);

      expect(quote.duration.value).toBe(4);
      expect(quote.discountAmount).toBe(expectedDiscount);
      expect(quote.subtotal).toBe(roundMoney(gross - expectedDiscount));
      expect(quote.breakdown.discounts[0].name).toContain('Extended Rental Discount (5%)');
    });

    it('should apply 10% duration discount for weekly rentals (7 to 13 days)', async () => {
      const vehicle = await VehicleModel.findById(testVehicleId);
      const p = new Date('2026-09-10T10:00:00.000Z');
      const r = new Date('2026-09-17T10:00:00.000Z'); // 7 days

      const { quote } = await pricingService.calculatePrice(vehicle!, p, r);

      const gross = vehicle!.rental.baseRate * 7;
      const expectedDiscount = roundMoney(gross * 0.10);

      expect(quote.duration.value).toBe(7);
      expect(quote.discountAmount).toBe(expectedDiscount);
      expect(quote.subtotal).toBe(roundMoney(gross - expectedDiscount));
      expect(quote.breakdown.discounts[0].name).toContain('Weekly Rental Discount (10%)');
    });
  });

  describe('4. Coupon Validation & Anti-Abuse Protection', () => {
    it('should apply valid percentage coupon and respect maxDiscountAmount cap', async () => {
      const vehicle = await VehicleModel.findById(testVehicleId);
      const p = new Date('2026-09-10T10:00:00.000Z');
      const r = new Date('2026-09-12T10:00:00.000Z'); // 2 days

      const { quote } = await pricingService.calculatePrice(vehicle!, p, r, 'SKYBOLT10');

      const couponDiscount = quote.breakdown.discounts.find((d) => d.code === 'SKYBOLT10');
      expect(couponDiscount).toBeDefined();
      expect(couponDiscount!.amount).toBeGreaterThan(0);
      expect(couponDiscount!.amount).toBeLessThanOrEqual(1000); // capped at 1000
    });

    it('should reject coupon if minimum booking amount is not met', async () => {
      const vehicle = await VehicleModel.findById(testVehicleId);
      // 1 day on ₹300/day vehicle = ₹300 subtotal, but FLAT500 requires min ₹2,500
      const p = new Date('2026-09-10T10:00:00.000Z');
      const r = new Date('2026-09-11T10:00:00.000Z');

      await expect(
        pricingService.calculatePrice(vehicle!, p, r, 'FLAT500')
      ).rejects.toThrow(/minimum rental amount/i);
    });

    it('should reject expired coupon code', async () => {
      const vehicle = await VehicleModel.findById(testVehicleId);
      const p = new Date('2026-09-10T10:00:00.000Z');
      const r = new Date('2026-09-12T10:00:00.000Z');

      await expect(
        pricingService.calculatePrice(vehicle!, p, r, 'EXPIRED20')
      ).rejects.toThrow(/expired/i);
    });

    it('should reject inactive or non-existent coupon code', async () => {
      const vehicle = await VehicleModel.findById(testVehicleId);
      const p = new Date('2026-09-10T10:00:00.000Z');
      const r = new Date('2026-09-12T10:00:00.000Z');

      await expect(
        pricingService.calculatePrice(vehicle!, p, r, 'INACTIVE50')
      ).rejects.toThrow(/invalid or inactive/i);

      await expect(
        pricingService.calculatePrice(vehicle!, p, r, 'FAKECODE123')
      ).rejects.toThrow(/invalid or inactive/i);
    });
  });

  describe('5. POST /api/v1/pricing/quote (Price Quote API)', () => {
    it('should return a full transparent quote breakdown for valid request', async () => {
      const p = new Date(Date.now() + 86400000 * 2).toISOString();
      const r = new Date(Date.now() + 86400000 * 5).toISOString(); // 3 days

      const res = await request(app)
        .post('/api/v1/pricing/quote')
        .send({
          vehicleId: testVehicleId,
          pickupAt: p,
          returnAt: r
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.duration.value).toBe(3);
      expect(res.body.data.currency).toBe('INR');
      expect(res.body.data.baseRate).toBeGreaterThan(0);
      expect(res.body.data.feeAmount).toBe(1000); // refundable deposit
      expect(res.body.data.taxAmount).toBeGreaterThan(0);
      expect(res.body.data.total).toBe(
        roundMoney(res.body.data.subtotal + res.body.data.taxAmount + res.body.data.feeAmount)
      );
      expect(res.body.data.pricingVersion).toBe(CURRENT_PRICING_VERSION);
    });

    it('should reject quote request for maintenance vehicle with 409', async () => {
      const p = new Date(Date.now() + 86400000 * 2).toISOString();
      const r = new Date(Date.now() + 86400000 * 4).toISOString();

      const res = await request(app)
        .post('/api/v1/pricing/quote')
        .send({
          vehicleId: maintenanceVehicleId,
          pickupAt: p,
          returnAt: r
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('VEHICLE_NOT_RENTABLE');
    });

    it('should reject quote request with malformed or reversed dates with 422', async () => {
      const p = new Date(Date.now() + 86400000 * 5).toISOString();
      const rReversed = new Date(Date.now() + 86400000 * 2).toISOString();

      const res = await request(app)
        .post('/api/v1/pricing/quote')
        .send({
          vehicleId: testVehicleId,
          pickupAt: p,
          returnAt: rReversed
        });

      expect(res.status).toBe(422);
    });
  });

  describe('6. Price Tampering & Anti-Injection Protection', () => {
    it('CRITICAL SECURITY: client-submitted fake price parameters must be completely ignored', async () => {
      const p = new Date(Date.now() + 86400000 * 15).toISOString();
      const r = new Date(Date.now() + 86400000 * 18).toISOString(); // 3 days

      // Malicious client payload attempting ₹1 total, 0 tax, ₹99999 discount, and USD currency
      const tamperedPayload = {
        vehicleId: testVehicleId,
        pickupAt: p,
        returnAt: r,
        total: 1,
        subtotal: 1,
        tax: 0,
        discount: 99999,
        currency: 'USD',
        pricingSnapshot: {
          total: 1,
          currency: 'USD'
        }
      };

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userCookie)
        .send(tamperedPayload);

      // Either rejected by strict Zod schema or created with authoritative server price
      if (res.status === 201) {
        const booking = res.body.data;
        expect(booking.pricing.currency).toBe('INR'); // NOT USD
        expect(booking.pricing.total).toBeGreaterThan(1000); // NOT ₹1
        expect(booking.pricing.pricingVersion).toBe(CURRENT_PRICING_VERSION);
      } else {
        expect(res.status).toBe(422);
      }
    });
  });

  describe('7. Historical Snapshot Immutability', () => {
    it('should retain historical pricing snapshot even if vehicle base rate changes in catalog', async () => {
      const p = new Date(Date.now() + 86400000 * 25).toISOString();
      const r = new Date(Date.now() + 86400000 * 27).toISOString(); // 2 days

      // 1. Create booking with original base rate
      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userCookie)
        .send({
          vehicleId: testVehicleId,
          pickupAt: p,
          returnAt: r
        });

      expect(createRes.status).toBe(201);
      const bookingId = createRes.body.data.id;
      const originalTotal = createRes.body.data.pricing.total;
      const originalBaseAmount = createRes.body.data.pricing.baseAmount;

      // 2. Change vehicle rental base rate dramatically in catalog
      await VehicleModel.findByIdAndUpdate(testVehicleId, {
        $set: { 'rental.baseRate': 9999 }
      });

      // 3. Fetch the booking detail: historical pricing must remain UNCHANGED
      const detailRes = await request(app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Cookie', userCookie);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.pricing.total).toBe(originalTotal);
      expect(detailRes.body.data.pricing.baseAmount).toBe(originalBaseAmount);
      expect(detailRes.body.data.pricing.pricingVersion).toBe(CURRENT_PRICING_VERSION);
    });
  });
});
