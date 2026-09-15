import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';
import { seedHubs } from '../src/seeds/hub.seed.js';
import { CouponModel } from '../src/models/coupon.model.js';
import { vehicleSearchTool } from '../src/modules/chatbot/tools/vehicle-search.tool.js';
import { vehicleDetailsTool } from '../src/modules/chatbot/tools/vehicle-details.tool.js';
import { availabilityTool } from '../src/modules/chatbot/tools/availability.tool.js';
import { pricingTool } from '../src/modules/chatbot/tools/pricing.tool.js';
import { bookingStatusTool } from '../src/modules/chatbot/tools/booking-status.tool.js';
import { bookingCreateTool } from '../src/modules/chatbot/tools/booking-create.tool.js';
import { cancellationTool } from '../src/modules/chatbot/tools/cancellation.tool.js';
import { couponTool } from '../src/modules/chatbot/tools/coupon.tool.js';
import { locationTool } from '../src/modules/chatbot/tools/location.tool.js';
import { toolRegistry } from '../src/modules/chatbot/tools/tool-registry.js';
import { UserModel } from '../src/models/user.model.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { AuthenticatedUser } from '../src/types/auth.types.js';

describe('Chatbot Tools: Authoritative Business Logic & Guardrails', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  let sampleUser: AuthenticatedUser;
  let sampleVehicleId: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    await seedVehicles(true);
    await seedHubs(true);
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
      }
    ]);

    const user = await UserModel.create({
      name: 'Chatbot Tester',
      email: 'chatbottest@skybolt.com',
      passwordHash: 'hashed_password_placeholder_1234567890',
      phone: '+919876543210',
      role: 'CUSTOMER',
      isVerified: true
    });

    sampleUser = {
      id: user.id,
      email: user.email,
      role: 'CUSTOMER',
      name: user.name
    };

    const vehicle = await VehicleModel.findOne({ status: 'ACTIVE' });
    sampleVehicleId = vehicle!.id;
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  });

  it('Tool Registry: should register all 9 core rental tools', () => {
    const definitions = toolRegistry.getDefinitions();
    expect(definitions.length).toBe(9);
    const names = definitions.map((d) => d.function.name);
    expect(names).toContain('search_vehicles');
    expect(names).toContain('get_vehicle_details');
    expect(names).toContain('check_availability');
    expect(names).toContain('calculate_pricing');
    expect(names).toContain('get_booking_status');
    expect(names).toContain('create_booking');
    expect(names).toContain('cancellation_policy');
    expect(names).toContain('check_coupons');
    expect(names).toContain('get_locations');
  });

  describe('VehicleSearchTool', () => {
    it('should search vehicles by category and return formatted results', async () => {
      const result = await vehicleSearchTool.execute(
        { category: 'SUV' },
        { sessionId: 'sess_1', conversationId: 'conv_1' }
      );
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data.vehicles)).toBe(true);
      if (result.data.vehicles.length > 0) {
        expect(result.data.vehicles[0].category).toBe('SUV');
        expect(result.data.vehicles[0].baseRate).toBeGreaterThan(0);
      }
    });

    it('should search vehicles by text query', async () => {
      const result = await vehicleSearchTool.execute(
        { search: 'Mahindra' },
        { sessionId: 'sess_1', conversationId: 'conv_1' }
      );
      expect(result.success).toBe(true);
      expect(result.data.vehicles).toBeDefined();
    });
  });

  describe('VehicleDetailsTool', () => {
    it('should retrieve full vehicle specifications for valid vehicleId', async () => {
      const result = await vehicleDetailsTool.execute(
        { vehicleId: sampleVehicleId },
        { sessionId: 'sess_1', conversationId: 'conv_1' }
      );
      expect(result.success).toBe(true);
      expect(result.data.name).toBeDefined();
      expect(result.data.transmission).toBeDefined();
      expect(result.data.fuelType).toBeDefined();
      expect(result.data.seats).toBeGreaterThan(0);
    });

    it('should return error if vehicle does not exist', async () => {
      const result = await vehicleDetailsTool.execute(
        { vehicleId: '64e000000000000000000000' },
        { sessionId: 'sess_1', conversationId: 'conv_1' }
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('AvailabilityTool', () => {
    it('should check vehicle availability for valid upcoming dates', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 5);
      const dayAfter = new Date();
      dayAfter.setDate(dayAfter.getDate() + 7);

      const result = await availabilityTool.execute(
        {
          vehicleId: sampleVehicleId,
          startDate: tomorrow.toISOString(),
          endDate: dayAfter.toISOString()
        },
        { sessionId: 'sess_1', conversationId: 'conv_1' }
      );
      expect(result.success).toBe(true);
      expect(typeof result.data.isAvailable).toBe('boolean');
    });

    it('should reject invalid date sequence where return date precedes pickup date', async () => {
      const result = await availabilityTool.execute(
        {
          vehicleId: sampleVehicleId,
          startDate: '2026-10-10',
          endDate: '2026-10-08'
        },
        { sessionId: 'sess_1', conversationId: 'conv_1' }
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('strictly after');
    });
  });

  describe('PricingTool', () => {
    it('should calculate an authoritative quote matching backend pricingService', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);
      const returnDate = new Date();
      returnDate.setDate(returnDate.getDate() + 5);

      const result = await pricingTool.execute(
        {
          vehicleId: sampleVehicleId,
          startDate: tomorrow.toISOString(),
          endDate: returnDate.toISOString()
        },
        { sessionId: 'sess_1', conversationId: 'conv_1' }
      );

      expect(result.success).toBe(true);
      expect(result.data.finalTotal).toBeGreaterThan(0);
      expect(result.data.currency).toBe('INR');
      expect(result.data.durationDays).toBeGreaterThan(0);
    });

    it('should apply valid coupon discounts within quote', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 3);
      const returnDate = new Date();
      returnDate.setDate(returnDate.getDate() + 6);

      const result = await pricingTool.execute(
        {
          vehicleId: sampleVehicleId,
          startDate: tomorrow.toISOString(),
          endDate: returnDate.toISOString(),
          couponCode: 'SKYBOLT10'
        },
        { sessionId: 'sess_1', conversationId: 'conv_1' }
      );

      expect(result.success).toBe(true);
      expect(result.data.couponCode).toBe('SKYBOLT10');
      expect(result.data.discountAmount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('BookingStatusTool', () => {
    it('should reject unauthenticated booking inquiries', async () => {
      const result = await bookingStatusTool.execute(
        { bookingId: 'SKY-20260904-TEST01' },
        { sessionId: 'sess_guest', conversationId: 'conv_guest' }
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication required');
    });
  });

  describe('BookingCreateTool: Two-Phase Confirmation Guardrail', () => {
    it('Phase 1: should return confirmation prompt without persisting booking when unconfirmed', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 4);
      const returnDate = new Date();
      returnDate.setDate(returnDate.getDate() + 7);

      const result = await bookingCreateTool.execute(
        {
          vehicleId: sampleVehicleId,
          pickupAt: tomorrow.toISOString(),
          returnAt: returnDate.toISOString(),
          confirmed: false
        },
        { sessionId: 'sess_1', conversationId: 'conv_1', user: sampleUser }
      );

      expect(result.success).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.promptUser).toContain('reservation summary');
      expect(result.data.quote).toBeDefined();
    });

    it('Phase 2: should create booking when confirmed by authenticated customer', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 10);
      const returnDate = new Date();
      returnDate.setDate(returnDate.getDate() + 12);

      const result = await bookingCreateTool.execute(
        {
          vehicleId: sampleVehicleId,
          pickupAt: tomorrow.toISOString(),
          returnAt: returnDate.toISOString(),
          confirmed: true
        },
        { sessionId: 'sess_1', conversationId: 'conv_1', user: sampleUser }
      );

      expect(result.success).toBe(true);
      expect(result.data.bookingReference).toBeDefined();
      expect(result.data.bookingReference).toMatch(/^SKY-\d{8}-[A-Z0-9]+$/);
      expect(result.data.status).toBe('PENDING');
      expect(result.data.checkoutUrl).toContain('/booking.html?id=');
    });

    it('should reject confirmed booking attempt if user is not authenticated', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 14);
      const returnDate = new Date();
      returnDate.setDate(returnDate.getDate() + 16);

      const result = await bookingCreateTool.execute(
        {
          vehicleId: sampleVehicleId,
          pickupAt: tomorrow.toISOString(),
          returnAt: returnDate.toISOString(),
          confirmed: true
        },
        { sessionId: 'sess_guest', conversationId: 'conv_guest' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('You must be signed in');
    });
  });

  describe('CancellationTool', () => {
    it('should return company cancellation policy when no bookingId is provided', async () => {
      const result = await cancellationTool.execute({}, { sessionId: 'sess_1', conversationId: 'conv_1' });
      expect(result.success).toBe(true);
      expect(result.data.policy).toBeDefined();
      expect(result.data.policy.rules.length).toBeGreaterThan(0);
    });

    it('should request explicit confirmation when bookingId is provided but unconfirmed', async () => {
      const result = await cancellationTool.execute(
        { bookingId: 'SKY-20260904-TEST01', confirmed: false },
        { sessionId: 'sess_1', conversationId: 'conv_1', user: sampleUser }
      );
      expect(result.success).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.promptUser).toContain('Are you sure you want to cancel');
    });
  });

  describe('CouponTool', () => {
    it('should list active promotional coupons when no code is supplied', async () => {
      const result = await couponTool.execute({}, { sessionId: 'sess_1', conversationId: 'conv_1' });
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data.coupons)).toBe(true);
    });

    it('should validate a valid coupon code against minimum subtotal', async () => {
      const result = await couponTool.execute(
        { couponCode: 'SKYBOLT10', subtotal: 2000 },
        { sessionId: 'sess_1', conversationId: 'conv_1' }
      );
      expect(result.success).toBe(true);
      expect(result.data.isValid).toBe(true);
      expect(result.data.discountAmount).toBeGreaterThan(0);
    });

    it('should return error for nonexistent or invalid coupon code', async () => {
      const result = await couponTool.execute(
        { couponCode: 'NONEXISTENT999', subtotal: 2000 },
        { sessionId: 'sess_1', conversationId: 'conv_1' }
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid or inactive');
    });
  });

  describe('LocationTool', () => {
    it('should return all active rental hubs', async () => {
      const result = await locationTool.execute({}, { sessionId: 'sess_1', conversationId: 'conv_1' });
      expect(result.success).toBe(true);
      expect(result.data.hubs.length).toBeGreaterThan(0);
      expect(result.data.hubs[0].address).toBeDefined();
    });
  });
});
