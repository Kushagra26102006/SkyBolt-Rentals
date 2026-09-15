import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { BookingModel } from '../src/models/booking.model.js';
import { PaymentModel } from '../src/models/payment.model.js';
import { ReservationModel } from '../src/models/reservation.model.js';
import { WebhookEventModel } from '../src/models/webhook-event.model.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';
import { razorpayClient } from '../src/services/razorpay.client.js';
import { PaymentStateMachine } from '../src/services/payment-state-machine.js';
import { paymentReconciliationService } from '../src/services/payment-reconciliation.service.js';
import { config } from '../src/config/env.config.js';

describe('TASK 10: Production Razorpay Payment Integration, Webhooks & Reconciliation', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let userAliceCookie: string;
  let userAliceId: string;
  let userBobCookie: string;
  let userBobId: string;
  let staffCookie: string;

  let testVehicleId: string;
  let testVehicleCode: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    await VehicleModel.syncIndexes();
    await ReservationModel.syncIndexes();
    await BookingModel.syncIndexes();
    await PaymentModel.syncIndexes();
    await WebhookEventModel.syncIndexes();
    await seedVehicles(true);

    // Register Customer Alice
    const regAlice = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Alice Customer',
        email: 'alice.payment@skybolt.test',
        password: 'Password123!',
        phone: '+91 9811111111'
      });
    userAliceCookie = regAlice.headers['set-cookie'][0];
    userAliceId = regAlice.body.data.user.id;

    // Register Customer Bob
    const regBob = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Bob Customer',
        email: 'bob.payment@skybolt.test',
        password: 'Password123!',
        phone: '+91 9822222222'
      });
    userBobCookie = regBob.headers['set-cookie'][0];
    userBobId = regBob.body.data.user.id;

    // Register Staff Member
    const regStaff = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Staff Member',
        email: 'staff.payment@skybolt.test',
        password: 'Password123!',
        phone: '+91 9833333333'
      });
    staffCookie = regStaff.headers['set-cookie'][0];
    // Elevate role to STAFF
    await request(app);
    const { UserModel } = await import('../src/models/user.model.js');
    await UserModel.findByIdAndUpdate(regStaff.body.data.user.id, { role: 'STAFF' });

    // Active test vehicle
    const activeVehicle = await VehicleModel.findOne({ vehicleCode: 'SKY-VHC-001' });
    testVehicleId = activeVehicle!._id.toString();
    testVehicleCode = activeVehicle!.vehicleCode;
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  });

  // Helper: Create a fresh booking for Alice
  async function createTestBookingForAlice(daysFromNow = 1, durationDays = 3) {
    const pickupDate = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    const returnDate = new Date(pickupDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', userAliceCookie)
      .send({
        vehicleId: testVehicleId,
        pickupAt: pickupDate.toISOString(),
        returnAt: returnDate.toISOString(),
        pickupLocation: 'Delhi Hub',
        returnLocation: 'Delhi Hub'
      });

    return res.body.data;
  }

  // --------------------------------------------------------------------------
  // 1. ORDER CREATION & PRICING INTEGRITY
  // --------------------------------------------------------------------------
  describe('Order Creation & Authoritative Pricing', () => {
    it('should create Razorpay order with authoritative pricing snapshot converted to integer paise', async () => {
      const booking = await createTestBookingForAlice(10, 3);
      expect(booking.status).toBe('PENDING');
      expect(booking.pricing.total).toBeGreaterThan(0);

      const res = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const order = res.body.data;
      expect(order.orderId).toMatch(/^order_/);
      expect(order.currency).toBe('INR');
      expect(order.amount).toBe(Math.round(booking.pricing.total * 100)); // Minor units paise
      expect(Number.isInteger(order.amount)).toBe(true);
      expect(order.bookingId).toBe(booking.id);
      expect(order.paymentReference).toMatch(/^PAY-\d{8}-[A-F0-9]{6}$/);

      // Verify payment persisted in DB
      const paymentDoc = await PaymentModel.findOne({ providerOrderId: order.orderId });
      expect(paymentDoc).toBeDefined();
      expect(paymentDoc?.status).toBe('ORDER_CREATED');
      expect(paymentDoc?.amountPaise).toBe(order.amount);
      expect(paymentDoc?.amount).toBe(booking.pricing.total);

      // Verify booking status transitioned to PAYMENT_PENDING
      const updatedBooking = await BookingModel.findById(booking.id);
      expect(updatedBooking?.status).toBe('PAYMENT_PENDING');
    });

    it('should strictly reject or ignore client price tampering attempt', async () => {
      const booking = await createTestBookingForAlice(20, 2);

      // Client attempts to manipulate price by passing amount: 1 rupee (100 paise)
      const res = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({
          bookingId: booking.id,
          amount: 1,
          amountPaise: 100
        });

      expect(res.status).toBe(201);
      // The server MUST ignore the client-submitted amount and use authoritative snapshot
      const expectedPaise = Math.round(booking.pricing.total * 100);
      expect(res.body.data.amount).toBe(expectedPaise);
      expect(res.body.data.amount).not.toBe(1);
      expect(res.body.data.amount).not.toBe(100);
    });

    it('should strictly ignore client currency tampering attempt', async () => {
      const booking = await createTestBookingForAlice(30, 2);

      // Client attempts to manipulate currency to USD
      const res = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({
          bookingId: booking.id,
          currency: 'USD'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.currency).toBe('INR');
    });

    it('should protect against duplicate order creation and reuse existing valid order on retry', async () => {
      const booking = await createTestBookingForAlice(40, 3);

      const firstCall = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });

      expect(firstCall.status).toBe(201);

      // Rapid second click / retry
      const secondCall = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });

      expect(secondCall.status).toBe(201);
      // Order ID should be safely reused
      expect(secondCall.body.data.orderId).toBe(firstCall.body.data.orderId);
      expect(secondCall.body.data.paymentReference).toBe(firstCall.body.data.paymentReference);

      // Ensure no duplicate records created in MongoDB
      const count = await PaymentModel.countDocuments({ bookingId: booking.id });
      expect(count).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // 2. BOOKING OWNERSHIP & ACCESS CONTROL
  // --------------------------------------------------------------------------
  describe('Ownership Enforcement', () => {
    it('should prevent User Bob from creating payment order for Alice booking', async () => {
      const aliceBooking = await createTestBookingForAlice(50, 3);

      const res = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userBobCookie)
        .send({ bookingId: aliceBooking.id });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('should prevent User Bob from verifying payment for Alice booking', async () => {
      const aliceBooking = await createTestBookingForAlice(60, 3);

      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: aliceBooking.id });

      const fakePaymentId = 'pay_fake_bob_123';
      const signature = razorpayClient.generateTestPaymentSignature(
        orderRes.body.data.orderId,
        fakePaymentId
      );

      const res = await request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', userBobCookie)
        .send({
          bookingId: aliceBooking.id,
          razorpay_order_id: orderRes.body.data.orderId,
          razorpay_payment_id: fakePaymentId,
          razorpay_signature: signature
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PAYMENT_NOT_OWNED');
    });
  });

  // --------------------------------------------------------------------------
  // 3. CRYPTOGRAPHIC SIGNATURE VERIFICATION
  // --------------------------------------------------------------------------
  describe('Signature Verification', () => {
    it('should verify valid HMAC SHA-256 signature and confirm booking atomically', async () => {
      const booking = await createTestBookingForAlice(70, 3);

      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });

      const orderId = orderRes.body.data.orderId;
      const paymentId = `pay_${crypto.randomBytes(6).toString('hex')}`;
      const validSignature = razorpayClient.generateTestPaymentSignature(orderId, paymentId);

      const verifyRes = await request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', userAliceCookie)
        .send({
          bookingId: booking.id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: validSignature
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.payment.status).toBe('CAPTURED');
      expect(verifyRes.body.data.payment.signatureVerified).toBe(true);
      expect(verifyRes.body.data.booking.status).toBe('CONFIRMED');
      expect(verifyRes.body.data.booking.paymentStatus).toBe('PAID');

      // Check DB records
      const updatedBooking = await BookingModel.findById(booking.id);
      expect(updatedBooking?.status).toBe('CONFIRMED');
      expect(updatedBooking?.paymentStatus).toBe('PAID');

      const updatedPayment = await PaymentModel.findOne({ providerOrderId: orderId });
      expect(updatedPayment?.status).toBe('CAPTURED');
      expect(updatedPayment?.providerPaymentId).toBe(paymentId);

      const reservation = await ReservationModel.findById(updatedBooking?.reservationId);
      expect(reservation?.status).toBe('CONFIRMED');
    });

    it('should reject invalid or tampered payment signature with 400 and not confirm booking', async () => {
      const booking = await createTestBookingForAlice(80, 2);

      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });

      const orderId = orderRes.body.data.orderId;
      const paymentId = 'pay_real_attempt_123';
      const fakeSignature = 'tampered_invalid_signature_hex_digest';

      const verifyRes = await request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', userAliceCookie)
        .send({
          bookingId: booking.id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: fakeSignature
        });

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.error.code).toBe('PAYMENT_SIGNATURE_INVALID');

      // Verify booking was NOT confirmed
      const unconfirmedBooking = await BookingModel.findById(booking.id);
      expect(unconfirmedBooking?.status).toBe('PAYMENT_PENDING');
      expect(unconfirmedBooking?.paymentStatus).toBe('UNPAID');

      const payment = await PaymentModel.findOne({ providerOrderId: orderId });
      expect(payment?.status).toBe('ORDER_CREATED');
      expect(payment?.signatureVerified).toBe(false);
    });

    it('should handle idempotent verify call safely when already captured', async () => {
      const booking = await createTestBookingForAlice(90, 2);

      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });

      const orderId = orderRes.body.data.orderId;
      const paymentId = `pay_${crypto.randomBytes(6).toString('hex')}`;
      const validSignature = razorpayClient.generateTestPaymentSignature(orderId, paymentId);

      // First verification
      const verify1 = await request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', userAliceCookie)
        .send({
          bookingId: booking.id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: validSignature
        });
      expect(verify1.status).toBe(200);

      // Duplicate verification
      const verify2 = await request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', userAliceCookie)
        .send({
          bookingId: booking.id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: validSignature
        });
      expect(verify2.status).toBe(200);
      expect(verify2.body.data.payment.status).toBe('CAPTURED');
      expect(verify2.body.data.booking.status).toBe('CONFIRMED');
    });
  });

  // --------------------------------------------------------------------------
  // 4. WEBHOOK VERIFICATION & REPLAY IDEMPOTENCY
  // --------------------------------------------------------------------------
  describe('Official Webhooks & Replay Idempotency', () => {
    it('should verify webhook signature via raw body and transition payment/booking', async () => {
      const booking = await createTestBookingForAlice(100, 3);

      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });

      const orderId = orderRes.body.data.orderId;
      const paymentId = `pay_hook_${crypto.randomBytes(5).toString('hex')}`;

      const webhookPayload = {
        event_id: `evt_${Date.now()}_1`,
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: orderRes.body.data.amount,
              currency: 'INR',
              status: 'captured',
              method: 'upi'
            }
          }
        }
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = razorpayClient.generateTestWebhookSignature(rawBody);

      const hookRes = await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(hookRes.status).toBe(200);
      expect(hookRes.body.success).toBe(true);

      // Verify DB updates
      const updatedPayment = await PaymentModel.findOne({ providerOrderId: orderId });
      expect(updatedPayment?.status).toBe('CAPTURED');
      expect(updatedPayment?.webhookVerified).toBe(true);
      expect(updatedPayment?.method).toBe('upi');

      const updatedBooking = await BookingModel.findById(booking.id);
      expect(updatedBooking?.status).toBe('CONFIRMED');
      expect(updatedBooking?.paymentStatus).toBe('PAID');
    });

    it('should reject webhook with invalid signature with 400', async () => {
      const webhookPayload = {
        event_id: `evt_bad_sig_${Date.now()}`,
        event: 'payment.captured'
      };

      const rawBody = JSON.stringify(webhookPayload);

      const hookRes = await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-razorpay-signature', 'invalid_signature_hex')
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(hookRes.status).toBe(400);
      expect(hookRes.body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    });

    it('should guarantee replay protection when same webhook event is delivered 3 times', async () => {
      const booking = await createTestBookingForAlice(110, 2);

      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });

      const orderId = orderRes.body.data.orderId;
      const paymentId = `pay_hook_${crypto.randomBytes(5).toString('hex')}`;
      const eventId = `evt_replay_test_${Date.now()}`;

      const webhookPayload = {
        event_id: eventId,
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: orderRes.body.data.amount,
              currency: 'INR',
              status: 'captured',
              method: 'card'
            }
          }
        }
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = razorpayClient.generateTestWebhookSignature(rawBody);

      // Delivery #1: Processed
      const res1 = await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe('PROCESSED');

      // Delivery #2: Ignored safely
      const res2 = await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe('IGNORED');

      // Delivery #3: Ignored safely
      const res3 = await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res3.status).toBe(200);
      expect(res3.body.status).toBe('IGNORED');

      // Only one webhook event entry in DB
      const count = await WebhookEventModel.countDocuments({ eventId });
      expect(count).toBe(1);
    });

    it('should handle payment.failed webhook event safely without falsely confirming booking', async () => {
      const booking = await createTestBookingForAlice(120, 2);

      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });

      const orderId = orderRes.body.data.orderId;
      const paymentId = `pay_failed_${crypto.randomBytes(4).toString('hex')}`;

      const webhookPayload = {
        event_id: `evt_failed_${Date.now()}`,
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              error_code: 'BAD_REQUEST_ERROR',
              error_description: 'Payment was declined by bank'
            }
          }
        }
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = razorpayClient.generateTestWebhookSignature(rawBody);

      const hookRes = await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(hookRes.status).toBe(200);

      // Verify payment marked FAILED
      const payment = await PaymentModel.findOne({ providerOrderId: orderId });
      expect(payment?.status).toBe('FAILED');
      expect(payment?.failureCode).toBe('BAD_REQUEST_ERROR');

      // Verify booking was NOT confirmed
      const dbBooking = await BookingModel.findById(booking.id);
      expect(dbBooking?.status).toBe('PAYMENT_PENDING');
      expect(dbBooking?.paymentStatus).toBe('UNPAID');
    });
  });

  // --------------------------------------------------------------------------
  // 5. PAYMENT STATE MACHINE TRANSITIONS
  // --------------------------------------------------------------------------
  describe('Payment State Machine', () => {
    it('should permit valid transitions', () => {
      expect(PaymentStateMachine.canTransition('CREATED', 'ORDER_CREATED')).toBe(true);
      expect(PaymentStateMachine.canTransition('ORDER_CREATED', 'CAPTURED')).toBe(true);
      expect(PaymentStateMachine.canTransition('CAPTURED', 'REFUNDED')).toBe(true);
      expect(PaymentStateMachine.canTransition('CAPTURED', 'PARTIALLY_REFUNDED')).toBe(true);
      expect(PaymentStateMachine.canTransition('ORDER_CREATED', 'FAILED')).toBe(true);
    });

    it('should reject invalid transitions like FAILED -> CAPTURED or REFUNDED -> CAPTURED', () => {
      expect(PaymentStateMachine.canTransition('FAILED', 'CAPTURED')).toBe(false);
      expect(PaymentStateMachine.canTransition('REFUNDED', 'CAPTURED')).toBe(false);
      expect(PaymentStateMachine.canTransition('CANCELLED', 'CAPTURED')).toBe(false);

      expect(() => {
        PaymentStateMachine.assertTransition('FAILED', 'CAPTURED');
      }).toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // 6. CONCURRENCY & RACE CONDITIONS
  // --------------------------------------------------------------------------
  describe('Concurrency & Race Handling', () => {
    it('should handle concurrent client verification and webhook delivery cleanly', async () => {
      const booking = await createTestBookingForAlice(130, 2);

      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });

      const orderId = orderRes.body.data.orderId;
      const paymentId = `pay_race_${crypto.randomBytes(5).toString('hex')}`;

      // Prepare client verification request
      const clientSig = razorpayClient.generateTestPaymentSignature(orderId, paymentId);
      const clientPromise = request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', userAliceCookie)
        .send({
          bookingId: booking.id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: clientSig
        });

      // Prepare webhook delivery
      const webhookPayload = {
        event_id: `evt_race_${Date.now()}`,
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: orderRes.body.data.amount,
              currency: 'INR',
              status: 'captured',
              method: 'card'
            }
          }
        }
      };
      const rawBody = JSON.stringify(webhookPayload);
      const webhookSig = razorpayClient.generateTestWebhookSignature(rawBody);
      const webhookPromise = request(app)
        .post('/api/v1/payments/webhook')
        .set('x-razorpay-signature', webhookSig)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      const [clientRes, hookRes] = await Promise.all([clientPromise, webhookPromise]);

      expect([200, 409]).toContain(clientRes.status);
      expect(hookRes.status).toBe(200);

      // Check final state in MongoDB: exactly 1 payment record, status CAPTURED, booking CONFIRMED
      const payments = await PaymentModel.find({ providerOrderId: orderId });
      expect(payments.length).toBe(1);
      expect(payments[0].status).toBe('CAPTURED');

      const finalBooking = await BookingModel.findById(booking.id);
      expect(finalBooking?.status).toBe('CONFIRMED');
      expect(finalBooking?.paymentStatus).toBe('PAID');
    });
  });

  // --------------------------------------------------------------------------
  // 7. SECURITY & SECRET PROTECTION
  // --------------------------------------------------------------------------
  describe('Secret Protection', () => {
    it('should never expose key secret or webhook secret in API responses', async () => {
      const booking = await createTestBookingForAlice(140, 2);

      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });

      const responseString = JSON.stringify(orderRes.body);
      expect(responseString).not.toContain(config.razorpay.keySecret);
      expect(responseString).not.toContain(config.razorpay.webhookSecret);
      expect(responseString).not.toContain(config.database.uri);
      expect(responseString).not.toContain(config.auth.jwtSecret);
    });
  });

  // --------------------------------------------------------------------------
  // 8. HISTORICAL PRICING SNAPSHOT PRESERVATION
  // --------------------------------------------------------------------------
  describe('Historical Pricing Preservation', () => {
    it('should use frozen pricingSnapshot even if vehicle catalog price changes subsequently', async () => {
      const booking = await createTestBookingForAlice(150, 3);
      const frozenTotal = booking.pricing.total;

      // Update vehicle catalog base price
      await VehicleModel.findByIdAndUpdate(testVehicleId, {
        'pricing.basePriceDaily': 99999
      });

      // Now create order for the existing booking
      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });

      expect(orderRes.status).toBe(201);
      // Order amount must equal the historical frozen snapshot, NOT the modified catalog price!
      expect(orderRes.body.data.amount).toBe(Math.round(frozenTotal * 100));
    });
  });

  // --------------------------------------------------------------------------
  // 9. RECONCILIATION SERVICE FOUNDATION
  // --------------------------------------------------------------------------
  describe('Payment Reconciliation Service', () => {
    it('should detect anomalies such as captured payment with unconfirmed booking', async () => {
      // Create orphaned payment in CAPTURED state
      const badBooking = await createTestBookingForAlice(160, 2);
      await PaymentModel.create({
        paymentReference: 'PAY-DISCREPANCY-001',
        bookingId: badBooking.id,
        userId: userAliceId,
        provider: 'RAZORPAY',
        providerOrderId: 'order_discrepancy_1',
        amount: badBooking.pricing.total,
        amountPaise: Math.round(badBooking.pricing.total * 100),
        currency: 'INR',
        status: 'CAPTURED'
      });

      const discrepancies = await paymentReconciliationService.detectDiscrepancies();
      const match = discrepancies.find((d) => d.paymentReference === 'PAY-DISCREPANCY-001');

      expect(match).toBeDefined();
      expect(match?.type).toBe('CAPTURED_PAYMENT_UNCONFIRMED_BOOKING');
      expect(match?.severity).toBe('HIGH');
    });

    it('should allow staff to query reconciliation report endpoint', async () => {
      const res = await request(app)
        .get('/api/v1/payments/reconciliation/report')
        .set('Cookie', staffCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should deny customer access to reconciliation report', async () => {
      const res = await request(app)
        .get('/api/v1/payments/reconciliation/report')
        .set('Cookie', userAliceCookie);

      expect(res.status).toBe(403);
    });
  });

  // --------------------------------------------------------------------------
  // 10. CUSTOMER PAYMENT HISTORY
  // --------------------------------------------------------------------------
  describe('Customer Payment History API', () => {
    it('should return paginated payments for authenticated customer', async () => {
      const res = await request(app)
        .get('/api/v1/payments')
        .set('Cookie', userAliceCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // 11. BOOKING & PAYMENT FLOW HARDENING AND FAILURE MODES
  // --------------------------------------------------------------------------
  describe('Booking & Payment Flow Hardening and Failure Modes', () => {
    it('should fail when booking creation is attempted unauthenticated', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .send({
          vehicleId: testVehicleId,
          pickupAt: new Date(Date.now() + 200 * 24 * 3600 * 1000).toISOString(),
          returnAt: new Date(Date.now() + 203 * 24 * 3600 * 1000).toISOString(),
          pickupLocation: 'Delhi Hub',
          returnLocation: 'Delhi Hub'
        });

      expect(res.status).toBe(401);
    });

    it('should fail booking API with 422 when return date is before pickup date', async () => {
      const pickup = new Date(Date.now() + 210 * 24 * 3600 * 1000);
      const invalidReturn = new Date(pickup.getTime() - 24 * 3600 * 1000);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', userAliceCookie)
        .send({
          vehicleId: testVehicleId,
          pickupAt: pickup.toISOString(),
          returnAt: invalidReturn.toISOString(),
          pickupLocation: 'Delhi Hub',
          returnLocation: 'Delhi Hub'
        });

      expect(res.status).toBe(422);
    });

    it('should fail payment order creation with 404 for non-existent booking ID', async () => {
      const nonExistentBookingId = '662f1c8b9a1e4c001f987654';
      const res = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: nonExistentBookingId });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('should fail payment order creation with 409 when booking is already confirmed and paid', async () => {
      const booking = await createTestBookingForAlice(220, 2);

      // Create order & verify successfully
      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });
      const orderId = orderRes.body.data.orderId;
      const paymentId = `pay_first_${Date.now()}`;
      const sig = razorpayClient.generateTestPaymentSignature(orderId, paymentId);

      await request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', userAliceCookie)
        .send({
          bookingId: booking.id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: sig
        });

      // Attempt to create another payment order for the same booking
      const duplicateOrderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });

      expect(duplicateOrderRes.status).toBe(409);
      expect(duplicateOrderRes.body.error.code).toBe('PAYMENT_ALREADY_PROCESSED');
    });

    it('should reject payment verification with 404 when payment order does not exist', async () => {
      const booking = await createTestBookingForAlice(230, 2);

      const fakeOrderId = 'order_nonexistent_99999999';
      const fakePaymentId = 'pay_attempt_123';
      const sig = razorpayClient.generateTestPaymentSignature(fakeOrderId, fakePaymentId);

      const res = await request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', userAliceCookie)
        .send({
          bookingId: booking.id,
          razorpay_order_id: fakeOrderId,
          razorpay_payment_id: fakePaymentId,
          razorpay_signature: sig
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PAYMENT_NOT_FOUND');
    });

    it('should reject payment verification with 422 when payload is malformed or missing fields', async () => {
      const booking = await createTestBookingForAlice(240, 2);

      const res = await request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', userAliceCookie)
        .send({
          bookingId: booking.id,
          razorpay_order_id: 'order_123'
          // razorpay_payment_id and razorpay_signature intentionally missing
        });

      expect(res.status).toBe(422);
    });

    it('should reject payment verification with 400 when amount in payment record is mismatched from booking total', async () => {
      const booking = await createTestBookingForAlice(250, 2);

      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });
      const orderId = orderRes.body.data.orderId;

      // Tamper with the payment record amount in DB directly
      await PaymentModel.findOneAndUpdate(
        { providerOrderId: orderId },
        { amountPaise: 999999 } // Tampered amount
      );

      const paymentId = `pay_tamper_${Date.now()}`;
      const sig = razorpayClient.generateTestPaymentSignature(orderId, paymentId);

      const res = await request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', userAliceCookie)
        .send({
          bookingId: booking.id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: sig
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PAYMENT_AMOUNT_MISMATCH');

      // Booking must remain unconfirmed
      const bookingAfter = await BookingModel.findById(booking.id);
      expect(bookingAfter?.status).toBe('PAYMENT_PENDING');
      expect(bookingAfter?.paymentStatus).toBe('UNPAID');
    });

    it('should reject duplicate verification with 409 if payment ID differs from captured payment ID', async () => {
      const booking = await createTestBookingForAlice(260, 2);

      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });
      const orderId = orderRes.body.data.orderId;

      const paymentId1 = `pay_orig_${Date.now()}`;
      const sig1 = razorpayClient.generateTestPaymentSignature(orderId, paymentId1);

      // First verification succeeds
      const verifyRes1 = await request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', userAliceCookie)
        .send({
          bookingId: booking.id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId1,
          razorpay_signature: sig1
        });
      expect(verifyRes1.status).toBe(200);

      // Duplicate verification with DIFFERENT paymentId
      const paymentId2 = `pay_diff_${Date.now()}`;
      const sig2 = razorpayClient.generateTestPaymentSignature(orderId, paymentId2);

      const verifyRes2 = await request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', userAliceCookie)
        .send({
          bookingId: booking.id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId2,
          razorpay_signature: sig2
        });

      expect(verifyRes2.status).toBe(409);
      expect(verifyRes2.body.error.code).toBe('PAYMENT_ID_MISMATCH');
    });

    it('should reject payment verification with 409 when booking is in CANCELLED state', async () => {
      const booking = await createTestBookingForAlice(270, 2);

      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', userAliceCookie)
        .send({ bookingId: booking.id });
      const orderId = orderRes.body.data.orderId;

      // Cancel the booking in DB
      await BookingModel.findByIdAndUpdate(booking.id, {
        status: 'CANCELLED'
      });

      const paymentId = `pay_cancel_${Date.now()}`;
      const sig = razorpayClient.generateTestPaymentSignature(orderId, paymentId);

      const verifyRes = await request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', userAliceCookie)
        .send({
          bookingId: booking.id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: sig
        });

      expect(verifyRes.status).toBe(409);
      expect(verifyRes.body.error.code).toBe('BOOKING_NOT_CONFIRMABLE');
    });
  });
});
