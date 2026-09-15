import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { BookingModel } from '../src/models/booking.model.js';
import { PaymentModel } from '../src/models/payment.model.js';
import { ReservationModel } from '../src/models/reservation.model.js';
import { WebhookEventModel } from '../src/models/webhook-event.model.js';
import { CouponModel } from '../src/models/coupon.model.js';
import { UserModel } from '../src/models/user.model.js';
import { razorpayClient } from '../src/services/razorpay.client.js';
import { bookingService, calculateCancellationRefund } from '../src/services/booking.service.js';
import { paymentService } from '../src/services/payment.service.js';
import { authService } from '../src/services/auth.service.js';
import { config } from '../src/config/env.config.js';
import { AuthenticatedUser } from '../src/types/auth.types.js';

describe('Production Payment Lifecycle, Refund, Webhook, Coupon & Security Suite', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let userCookie: string;
  let userId: string;
  let testVehicleId: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    await VehicleModel.syncIndexes();
    await ReservationModel.syncIndexes();
    await BookingModel.syncIndexes();
    await PaymentModel.syncIndexes();
    await WebhookEventModel.syncIndexes();
    await CouponModel.syncIndexes();
    await UserModel.syncIndexes();

    // Create test customer
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Refund Test Customer',
        email: 'refund.test@skybolt.io',
        password: 'Password123!',
        phone: '+91 9999988888'
      });
    userCookie = regRes.headers['set-cookie'][0];
    userId = regRes.body.data.user.id;

    // Create test vehicle
    const vehicle = await VehicleModel.create({
      vehicleCode: 'SKY-REFUND-001',
      name: 'SkyBolt Cruiser GT',
      brand: 'SkyBolt',
      model: 'Cruiser',
      year: 2024,
      category: 'SEDAN',
      status: 'ACTIVE',
      fleetStatus: 'AVAILABLE',
      rental: {
        baseRate: 2000,
        currency: 'INR',
        minDays: 1,
        maxDays: 30
      },
      specifications: {
        seats: 5,
        doors: 4,
        transmission: 'AUTOMATIC',
        fuelType: 'PETROL'
      },
      features: ['Air Conditioning', 'GPS Navigation'],
      images: [{ url: 'assets/images/car-tour.webp', isPrimary: true }],
      location: {
        city: 'Mumbai',
        name: 'Mumbai Airport Hub'
      },
      activeReservations: [],
      isDeleted: false
    });
    testVehicleId = vehicle._id.toString();
  });

  afterAll(async () => {
    razorpayClient.setMockRefundCreator(null);
    razorpayClient.setMockOrderCreator(null);
    await disconnectDatabase();
    await mongoServer.stop();
  });

  beforeEach(() => {
    razorpayClient.setMockRefundCreator(null);
  });

  // ==========================================================================
  // SECTION A: RAZORPAY REFUND LIFECYCLE & BOOKING CANCELLATION
  // ==========================================================================
  describe('A. Razorpay Refunds & Booking Cancellation', () => {
    it('should calculate 100% rental refund + 100% deposit refund for cancellations > 24 hours prior', async () => {
      const pickupAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h in future
      const returnAt = new Date(Date.now() + 96 * 60 * 60 * 1000);

      const booking = await BookingModel.create({
        bookingReference: 'SKY-TEST-REFUND100',
        userId: new Types.ObjectId(userId),
        vehicleId: new Types.ObjectId(testVehicleId),
        pickupAt,
        returnAt,
        pickupLocation: { name: 'Mumbai Hub' },
        returnLocation: { name: 'Mumbai Hub' },
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        pricingSnapshot: {
          baseAmount: 2000,
          subtotal: 2000,
          tax: 360,
          discount: 0,
          fees: 1000,
          total: 3360,
          currency: 'INR',
          pricingVersion: 'v2'
        },
        vehicleSnapshot: { brand: 'SkyBolt', model: 'Cruiser', name: 'SkyBolt Cruiser GT', image: 'car.webp' },
        isDeleted: false
      });

      const refundCalc = calculateCancellationRefund(booking, new Date());
      expect(refundCalc.depositRefund).toBe(1000);
      expect(refundCalc.rentalRefund).toBe(2360); // 3360 - 1000
      expect(refundCalc.refundAmount).toBe(3360);
    });

    it('should calculate 50% rental refund + 100% deposit refund for cancellations within 24 hours of pickup', async () => {
      const pickupAt = new Date(Date.now() + 10 * 60 * 60 * 1000); // 10h in future
      const returnAt = new Date(Date.now() + 34 * 60 * 60 * 1000);

      const booking = await BookingModel.create({
        bookingReference: 'SKY-TEST-REFUND50',
        userId: new Types.ObjectId(userId),
        vehicleId: new Types.ObjectId(testVehicleId),
        pickupAt,
        returnAt,
        pickupLocation: { name: 'Mumbai Hub' },
        returnLocation: { name: 'Mumbai Hub' },
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        pricingSnapshot: {
          baseAmount: 2000,
          subtotal: 2000,
          tax: 360,
          discount: 0,
          fees: 1000,
          total: 3360,
          currency: 'INR',
          pricingVersion: 'v2'
        },
        vehicleSnapshot: { brand: 'SkyBolt', model: 'Cruiser', name: 'SkyBolt Cruiser GT', image: 'car.webp' },
        isDeleted: false
      });

      const refundCalc = calculateCancellationRefund(booking, new Date());
      expect(refundCalc.depositRefund).toBe(1000);
      expect(refundCalc.rentalRefund).toBe(1180); // 50% of 2360
      expect(refundCalc.refundAmount).toBe(2180);
    });

    it('should calculate 0% rental refund + 100% deposit refund once pickup time has arrived', async () => {
      const pickupAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h in past
      const returnAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const booking = await BookingModel.create({
        bookingReference: 'SKY-TEST-REFUND0',
        userId: new Types.ObjectId(userId),
        vehicleId: new Types.ObjectId(testVehicleId),
        pickupAt,
        returnAt,
        pickupLocation: { name: 'Mumbai Hub' },
        returnLocation: { name: 'Mumbai Hub' },
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        pricingSnapshot: {
          baseAmount: 2000,
          subtotal: 2000,
          tax: 360,
          discount: 0,
          fees: 1000,
          total: 3360,
          currency: 'INR',
          pricingVersion: 'v2'
        },
        vehicleSnapshot: { brand: 'SkyBolt', model: 'Cruiser', name: 'SkyBolt Cruiser GT', image: 'car.webp' },
        isDeleted: false
      });

      const refundCalc = calculateCancellationRefund(booking, new Date());
      expect(refundCalc.depositRefund).toBe(1000);
      expect(refundCalc.rentalRefund).toBe(0);
      expect(refundCalc.refundAmount).toBe(1000);
    });

    it('should successfully execute Razorpay refund API and update payment and booking states to REFUNDED', async () => {
      const pickupAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const returnAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

      // Create confirmed booking
      const booking = await BookingModel.create({
        bookingReference: 'SKY-20260907-CANCEX',
        userId: new Types.ObjectId(userId),
        vehicleId: new Types.ObjectId(testVehicleId),
        pickupAt,
        returnAt,
        pickupLocation: { name: 'Mumbai Hub' },
        returnLocation: { name: 'Mumbai Hub' },
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        pricingSnapshot: {
          baseAmount: 2000,
          subtotal: 2000,
          tax: 360,
          discount: 0,
          fees: 1000,
          total: 3360,
          currency: 'INR',
          pricingVersion: 'v2'
        },
        vehicleSnapshot: { brand: 'SkyBolt', model: 'Cruiser', name: 'SkyBolt Cruiser GT', image: 'car.webp' },
        isDeleted: false
      });

      // Create captured payment for this booking
      const payment = await PaymentModel.create({
        paymentReference: 'PAY-TEST-CANC-EXEC',
        bookingId: booking._id,
        userId: new Types.ObjectId(userId),
        provider: 'RAZORPAY',
        providerOrderId: 'order_test_canc_exec',
        providerPaymentId: 'pay_test_canc_exec',
        amount: 3360,
        amountPaise: 336000,
        currency: 'INR',
        status: 'CAPTURED',
        signatureVerified: true,
        webhookVerified: true
      });

      let mockCalled = false;
      razorpayClient.setMockRefundCreator(async (params) => {
        mockCalled = true;
        expect(params.paymentId).toBe('pay_test_canc_exec');
        expect(params.amountPaise).toBe(336000);
        return {
          id: 'rfnd_mock_success_123',
          entity: 'refund',
          amount: 336000,
          currency: 'INR',
          payment_id: 'pay_test_canc_exec',
          status: 'processed',
          created_at: Math.floor(Date.now() / 1000)
        };
      });

      // Cancel booking via API
      const cancelRes = await request(app)
        .post(`/api/v1/bookings/${booking.bookingReference}/cancel`)
        .set('Cookie', userCookie)
        .send({ reason: 'CUSTOMER_REQUEST', notes: 'Plans changed' });

      expect(cancelRes.status).toBe(200);
      expect(mockCalled).toBe(true);
      expect(cancelRes.body.data.status).toBe('CANCELLED');
      expect(cancelRes.body.data.paymentStatus).toBe('REFUNDED');
      expect(cancelRes.body.data.cancellation.refundAmount).toBe(3360);
      expect(cancelRes.body.data.cancellation.refundStatus).toBe('PROCESSED');
      expect(cancelRes.body.data.cancellation.refundId).toBe('rfnd_mock_success_123');

      // Verify payment document in DB
      const updatedPayment = await PaymentModel.findById(payment._id).lean();
      expect(updatedPayment?.status).toBe('REFUNDED');
      expect(updatedPayment?.providerRefundId).toBe('rfnd_mock_success_123');
      expect(updatedPayment?.amountRefunded).toBe(3360);
      expect(updatedPayment?.refundStatus).toBe('PROCESSED');
      expect(updatedPayment?.refunds?.length).toBe(1);
    });

    it('should NEVER mark payment as REFUNDED if Razorpay refund operation fails', async () => {
      const pickupAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const returnAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

      const booking = await BookingModel.create({
        bookingReference: 'SKY-20260907-CANCFL',
        userId: new Types.ObjectId(userId),
        vehicleId: new Types.ObjectId(testVehicleId),
        pickupAt,
        returnAt,
        pickupLocation: { name: 'Mumbai Hub' },
        returnLocation: { name: 'Mumbai Hub' },
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        pricingSnapshot: {
          baseAmount: 2000,
          subtotal: 2000,
          tax: 360,
          discount: 0,
          fees: 1000,
          total: 3360,
          currency: 'INR',
          pricingVersion: 'v2'
        },
        vehicleSnapshot: { brand: 'SkyBolt', model: 'Cruiser', name: 'SkyBolt Cruiser GT', image: 'car.webp' },
        isDeleted: false
      });

      const payment = await PaymentModel.create({
        paymentReference: 'PAY-TEST-FAIL-REFUND',
        bookingId: booking._id,
        userId: new Types.ObjectId(userId),
        provider: 'RAZORPAY',
        providerOrderId: 'order_test_fail_refund',
        providerPaymentId: 'pay_test_fail_refund',
        amount: 3360,
        amountPaise: 336000,
        currency: 'INR',
        status: 'CAPTURED',
        signatureVerified: true
      });

      // Simulate gateway outage or error
      razorpayClient.setMockRefundCreator(async () => {
        throw new Error('Razorpay Refund Gateway Timeout');
      });

      const cancelRes = await request(app)
        .post(`/api/v1/bookings/${booking.bookingReference}/cancel`)
        .set('Cookie', userCookie)
        .send({ reason: 'CUSTOMER_REQUEST', notes: 'Cancel with failing gateway' });

      expect(cancelRes.status).toBe(200);
      // Payment status MUST NOT be REFUNDED
      expect(cancelRes.body.data.cancellation.refundStatus).toBe('FAILED');
      expect(cancelRes.body.data.paymentStatus).toBe('PAID');

      const dbPayment = await PaymentModel.findById(payment._id).lean();
      expect(dbPayment?.status).toBe('CAPTURED'); // Remained CAPTURED!
      expect(dbPayment?.refundStatus).toBe('FAILED');
      expect(dbPayment?.failureReason).toContain('Razorpay Refund Gateway Timeout');
    });

    it('should enforce idempotency and not issue duplicate refunds when cancellation is retried', async () => {
      const pickupAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const returnAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

      const booking = await BookingModel.create({
        bookingReference: 'SKY-TEST-IDEM-REFUND',
        userId: new Types.ObjectId(userId),
        vehicleId: new Types.ObjectId(testVehicleId),
        pickupAt,
        returnAt,
        pickupLocation: { name: 'Mumbai Hub' },
        returnLocation: { name: 'Mumbai Hub' },
        status: 'CANCELLED',
        paymentStatus: 'REFUNDED',
        pricingSnapshot: {
          baseAmount: 2000,
          subtotal: 2000,
          tax: 360,
          discount: 0,
          fees: 1000,
          total: 3360,
          currency: 'INR',
          pricingVersion: 'v2'
        },
        vehicleSnapshot: { brand: 'SkyBolt', model: 'Cruiser', name: 'SkyBolt Cruiser GT', image: 'car.webp' },
        cancellation: {
          reason: 'CUSTOMER_REQUEST',
          notes: 'Already cancelled',
          cancelledAt: new Date(),
          cancelledBy: userId,
          refundAmount: 3360,
          refundStatus: 'PROCESSED',
          refundId: 'rfnd_existing_123'
        },
        isDeleted: false
      });

      const payment = await PaymentModel.create({
        paymentReference: 'PAY-TEST-IDEM-REFUND',
        bookingId: booking._id,
        userId: new Types.ObjectId(userId),
        provider: 'RAZORPAY',
        providerOrderId: 'order_test_idem_refund',
        providerPaymentId: 'pay_test_idem_refund',
        providerRefundId: 'rfnd_existing_123',
        amount: 3360,
        amountPaise: 336000,
        amountRefunded: 3360,
        currency: 'INR',
        status: 'REFUNDED',
        refundStatus: 'PROCESSED',
        signatureVerified: true
      });

      let apiCalled = false;
      razorpayClient.setMockRefundCreator(async () => {
        apiCalled = true;
        throw new Error('Should NOT be called for already refunded booking');
      });

      // Calling refundBookingPayment directly
      const result = await paymentService.refundBookingPayment(
        booking,
        {
          id: userId,
          name: 'Refund Test Customer',
          email: 'refund.test@skybolt.io',
          role: 'CUSTOMER',
          status: 'ACTIVE',
          emailVerified: true,
          phoneVerified: true
        },
        3360,
        'Retry attempt'
      );

      expect(apiCalled).toBe(false);
      expect(result.status).toBe('PROCESSED');
      expect(result.refundId).toBe('rfnd_existing_123');
      expect(result.amount).toBe(3360);
    });
  });

  // ==========================================================================
  // SECTION B: WEBHOOK IDEMPOTENCY & ATOMIC DEDUPLICATION
  // ==========================================================================
  describe('B. Webhook Idempotency & Simultaneous Duplicate Delivery', () => {
    it('should atomically process exactly 1 webhook and ignore concurrent duplicate deliveries', async () => {
      const eventId = `evt_race_${Date.now()}`;
      const providerOrderId = `order_race_${Date.now()}`;
      const providerPaymentId = `pay_race_${Date.now()}`;

      // Create corresponding payment & booking
      const booking = await BookingModel.create({
        bookingReference: `SKY-RACE-${Date.now()}`,
        userId: new Types.ObjectId(userId),
        vehicleId: new Types.ObjectId(testVehicleId),
        pickupAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        returnAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        pickupLocation: { name: 'Mumbai Hub' },
        returnLocation: { name: 'Mumbai Hub' },
        status: 'PAYMENT_PENDING',
        paymentStatus: 'UNPAID',
        pricingSnapshot: {
          baseAmount: 1000,
          subtotal: 1000,
          tax: 180,
          discount: 0,
          fees: 1000,
          total: 2180,
          currency: 'INR',
          pricingVersion: 'v2'
        },
        vehicleSnapshot: { brand: 'SkyBolt', model: 'Cruiser', name: 'Cruiser', image: 'car.webp' },
        isDeleted: false
      });

      await PaymentModel.create({
        paymentReference: `PAY-RACE-${Date.now()}`,
        bookingId: booking._id,
        userId: new Types.ObjectId(userId),
        provider: 'RAZORPAY',
        providerOrderId,
        amount: 2180,
        amountPaise: 218000,
        currency: 'INR',
        status: 'ORDER_CREATED'
      });

      const payload = {
        event_id: eventId,
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: providerPaymentId,
              order_id: providerOrderId,
              method: 'upi'
            }
          }
        }
      };

      const rawBody = JSON.stringify(payload);
      const signature = razorpayClient.generateTestWebhookSignature(rawBody);

      // Fire 5 simultaneous duplicate webhook requests
      const concurrentPromises = Array.from({ length: 5 }, () => {
        return paymentService.processWebhook(rawBody, signature, payload);
      });

      const results = await Promise.all(concurrentPromises);

      const processed = results.filter((r) => r.status === 'PROCESSED');
      const ignored = results.filter((r) => r.status === 'IGNORED');

      expect(processed.length).toBe(1);
      expect(ignored.length).toBe(4);

      // Verify only 1 webhook event record exists in DB
      const eventRecords = await WebhookEventModel.find({ eventId }).lean();
      expect(eventRecords.length).toBe(1);
      expect(eventRecords[0].status).toBe('PROCESSED');

      // Verify booking was confirmed exactly once
      const updatedBooking = await BookingModel.findById(booking._id).lean();
      expect(updatedBooking?.status).toBe('CONFIRMED');
      expect(updatedBooking?.paymentStatus).toBe('PAID');
    });

    it('should idempotently handle refund.processed webhook event', async () => {
      const providerPaymentId = `pay_rfnd_hook_${Date.now()}`;
      const providerRefundId = `rfnd_hook_${Date.now()}`;

      const booking = await BookingModel.create({
        bookingReference: `SKY-RFND-HOOK-${Date.now()}`,
        userId: new Types.ObjectId(userId),
        vehicleId: new Types.ObjectId(testVehicleId),
        pickupAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        returnAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        pickupLocation: { name: 'Mumbai Hub' },
        returnLocation: { name: 'Mumbai Hub' },
        status: 'CANCELLED',
        paymentStatus: 'PAID',
        pricingSnapshot: {
          baseAmount: 1000,
          subtotal: 1000,
          tax: 180,
          discount: 0,
          fees: 1000,
          total: 2180,
          currency: 'INR',
          pricingVersion: 'v2'
        },
        vehicleSnapshot: { brand: 'SkyBolt', model: 'Cruiser', name: 'Cruiser', image: 'car.webp' },
        cancellation: {
          reason: 'CUSTOMER_REQUEST',
          notes: 'Customer cancel',
          cancelledAt: new Date(),
          cancelledBy: userId,
          refundStatus: 'PENDING'
        },
        isDeleted: false
      });

      const payment = await PaymentModel.create({
        paymentReference: `PAY-RFND-HOOK-${Date.now()}`,
        bookingId: booking._id,
        userId: new Types.ObjectId(userId),
        provider: 'RAZORPAY',
        providerOrderId: `order_rfnd_hook_${Date.now()}`,
        providerPaymentId,
        amount: 2180,
        amountPaise: 218000,
        currency: 'INR',
        status: 'CAPTURED'
      });

      const payload = {
        event_id: `evt_rfnd_${Date.now()}`,
        event: 'refund.processed',
        payload: {
          refund: {
            entity: {
              id: providerRefundId,
              payment_id: providerPaymentId,
              amount: 218000
            }
          }
        }
      };

      const rawBody = JSON.stringify(payload);
      const signature = razorpayClient.generateTestWebhookSignature(rawBody);

      const result = await paymentService.processWebhook(rawBody, signature, payload);
      expect(result.status).toBe('PROCESSED');

      const updatedPayment = await PaymentModel.findById(payment._id).lean();
      expect(updatedPayment?.status).toBe('REFUNDED');
      expect(updatedPayment?.providerRefundId).toBe(providerRefundId);
      expect(updatedPayment?.refundStatus).toBe('PROCESSED');

      const updatedBooking = await BookingModel.findById(booking._id).lean();
      expect(updatedBooking?.paymentStatus).toBe('REFUNDED');
      expect(updatedBooking?.cancellation?.refundStatus).toBe('PROCESSED');
    });
  });

  // ==========================================================================
  // SECTION C: COUPON USAGE LIMIT & CONCURRENCY
  // ==========================================================================
  describe('C. Coupon Usage & Atomic Redemption Limits', () => {
    it('should strictly enforce coupon usageLimit under 10 concurrent requests (limit = 3)', async () => {
      const couponCode = `LIMITED${Date.now()}`;
      await CouponModel.create({
        code: couponCode,
        discountType: 'FIXED',
        discountValue: 500,
        minBookingAmount: 1000,
        startsAt: new Date(Date.now() - 60000),
        usageLimit: 3, // Exactly 3 uses allowed
        usageCount: 0,
        isActive: true
      });

      // Create 10 distinct customers to simulate 10 concurrent customers redeeming the same coupon
      const customerPromises = Array.from({ length: 10 }, async (_, i) => {
        const u = await UserModel.create({
          name: `Coupon User ${i}`,
          email: `coupon${i}_${Date.now()}@skybolt.test`,
          passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
          role: 'CUSTOMER',
          status: 'ACTIVE'
        });
        return u._id.toString();
      });
      const customerIds = await Promise.all(customerPromises);

      let successCount = 0;
      let limitReachedCount = 0;

      // 10 concurrent booking creation requests with different time intervals so vehicle availability passes
      const bookingAttempts = customerIds.map(async (cId, idx) => {
        const dayOffset = idx * 2 + 10;
        const pickupAt = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000);
        const returnAt = new Date(Date.now() + (dayOffset + 1) * 24 * 60 * 60 * 1000);

        try {
          await bookingService.createBooking(cId, {
            vehicleId: testVehicleId,
            pickupAt: pickupAt.toISOString(),
            returnAt: returnAt.toISOString(),
            couponCode
          });
          successCount++;
        } catch (err: any) {
          if (err.statusCode === 422 && err.code === 'COUPON_USAGE_LIMIT_REACHED') {
            limitReachedCount++;
          } else {
            throw err;
          }
        }
      });

      await Promise.all(bookingAttempts);

      // Exactly 3 must succeed, exactly 7 must be rejected
      expect(successCount).toBe(3);
      expect(limitReachedCount).toBe(7);

      // Verify coupon document usageCount in DB
      const dbCoupon = await CouponModel.findOne({ code: couponCode }).lean();
      expect(dbCoupon?.usageCount).toBe(3);
    });

    it('should roll back coupon usage count if a subsequent step in booking creation fails', async () => {
      const couponCode = `COMPENSATE${Date.now()}`;
      await CouponModel.create({
        code: couponCode,
        discountType: 'FIXED',
        discountValue: 200,
        minBookingAmount: 1000,
        startsAt: new Date(Date.now() - 60000),
        usageLimit: 5,
        usageCount: 0,
        isActive: true
      });

      // Mock bookingRepository.create to simulate failure
      const { bookingRepository } = await import('../src/repositories/booking.repository.js');
      const originalCreate = bookingRepository.create.bind(bookingRepository);

      bookingRepository.create = async () => {
        throw new Error('Simulated Database Failure after coupon claim');
      };

      const pickupAt = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
      const returnAt = new Date(Date.now() + 102 * 24 * 60 * 60 * 1000);

      await expect(
        bookingService.createBooking(userId, {
          vehicleId: testVehicleId,
          pickupAt: pickupAt.toISOString(),
          returnAt: returnAt.toISOString(),
          couponCode
        })
      ).rejects.toThrow('Simulated Database Failure after coupon claim');

      bookingRepository.create = originalCreate;

      // Coupon usageCount MUST remain 0 due to compensation rollback!
      const dbCoupon = await CouponModel.findOne({ code: couponCode }).lean();
      expect(dbCoupon?.usageCount).toBe(0);
    });
  });

  // ==========================================================================
  // SECTION D & F: ENVIRONMENT SECRETS & DEBUG TOKEN ISOLATION
  // ==========================================================================
  describe('D & F. Secret Security & Password Reset Token Isolation', () => {
    it('should NOT expose debugToken in forgotPassword response when config.isTest is false', async () => {
      // Temporarily override config.isTest to simulate development / staging
      const originalIsTest = config.isTest;
      (config as any).isTest = false;

      try {
        const res = await authService.forgotPassword('refund.test@skybolt.io');
        expect(res.debugToken).toBeUndefined();
        expect(res.message).toBe('If an account exists with that email, password reset instructions have been dispatched.');
      } finally {
        (config as any).isTest = originalIsTest;
      }
    });

    it('should expose debugToken ONLY when config.isTest is true', async () => {
      const res = await authService.forgotPassword('refund.test@skybolt.io');
      expect(res.debugToken).toBeDefined();
      expect(typeof res.debugToken).toBe('string');
    });
  });
});
