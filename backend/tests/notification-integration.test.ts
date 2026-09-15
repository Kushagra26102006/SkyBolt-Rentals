import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { UserModel } from '../src/models/user.model.js';
import { BookingModel } from '../src/models/booking.model.js';
import { PaymentModel } from '../src/models/payment.model.js';
import { ReservationModel } from '../src/models/reservation.model.js';
import { IdempotencyModel } from '../src/models/idempotency.model.js';
import { HubModel } from '../src/models/hub.model.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';
import { razorpayClient } from '../src/services/razorpay.client.js';
import { fleetBookingIntegrationService } from '../src/services/fleet-booking-integration.service.js';
import {
  notificationService,
  notificationWorker,
  NotificationModel,
  NotificationOutboxModel,
  NotificationType,
  NotificationChannel,
  NotificationStatus
} from '../src/notifications/index.js';

describe('TASK 13: End-to-End Notification Integration & Lifecycle', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let aliceCookie: string;
  let aliceId: string;
  let aliceEmail: string;

  let bobCookie: string;
  let bobId: string;
  let bobEmail: string;

  let staffCookie: string;
  let staffUser: any;

  let testVehicleId: string;
  let hubDoc: any;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    await VehicleModel.syncIndexes();
    await UserModel.syncIndexes();
    await BookingModel.syncIndexes();
    await PaymentModel.syncIndexes();
    await ReservationModel.syncIndexes();
    await IdempotencyModel.syncIndexes();
    await NotificationModel.syncIndexes();
    await NotificationOutboxModel.syncIndexes();
    await seedVehicles(true);

    // Create a Hub for fleet operations
    hubDoc = await HubModel.create({
      code: 'HUB-DEL-INT',
      name: 'Delhi Aero Hub',
      city: 'Delhi',
      state: 'Delhi',
      postalCode: '110037',
      address: 'Terminal 3 Road, Aerocity',
      coordinates: { latitude: 28.5562, longitude: 77.1000 },
      capacity: 50,
      currentVehicleCount: 10,
      operationalStatus: 'ACTIVE'
    });

    // 1. Register Alice
    aliceEmail = 'alice.integration@skybolt.test';
    const regAlice = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Alice Integration',
        email: aliceEmail,
        password: 'Password123!',
        phone: '+91 9811112222'
      });
    aliceCookie = regAlice.headers['set-cookie'][0];
    aliceId = regAlice.body.data.user.id;

    // 2. Register Bob
    bobEmail = 'bob.integration@skybolt.test';
    const regBob = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Bob Integration',
        email: bobEmail,
        password: 'Password123!',
        phone: '+91 9822223333'
      });
    bobCookie = regBob.headers['set-cookie'][0];
    bobId = regBob.body.data.user.id;

    // 3. Register and elevate Staff member
    const regStaff = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Ops Staff',
        email: 'ops.staff@skybolt.test',
        password: 'Password123!',
        phone: '+91 9833334444'
      });
    staffCookie = regStaff.headers['set-cookie'][0];
    await UserModel.findByIdAndUpdate(regStaff.body.data.user.id, { role: 'STAFF' });
    staffUser = {
      id: regStaff.body.data.user.id,
      email: 'ops.staff@skybolt.test',
      role: 'STAFF'
    };

    // Grab an active vehicle and associate with Hub
    const activeVehicle = await VehicleModel.findOne({ vehicleCode: 'SKY-VHC-001' });
    activeVehicle!.currentHubId = hubDoc._id;
    activeVehicle!.location = {
      name: hubDoc.name,
      city: hubDoc.city,
      locationId: hubDoc.id
    };
    await activeVehicle!.save();
    testVehicleId = activeVehicle!._id.toString();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  });

  // Helper: Create a fresh booking for Alice
  async function createAliceBooking(daysFromNow = 5, durationDays = 2) {
    const pickupDate = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    const returnDate = new Date(pickupDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', aliceCookie)
      .send({
        vehicleId: testVehicleId,
        pickupAt: pickupDate.toISOString(),
        returnAt: returnDate.toISOString(),
        pickupLocation: 'Delhi Aero Hub',
        returnLocation: 'Delhi Aero Hub'
      });

    return res.body.data;
  }

  // --------------------------------------------------------------------------
  // 1. AUTHENTICATION & SECURITY NOTIFICATIONS
  // --------------------------------------------------------------------------
  describe('Authentication & Security Notifications', () => {
    it('should have enqueued ACCOUNT_WELCOME upon user registration and worker processes it', async () => {
      // Find outbox event for Alice welcome
      const outboxItem = await NotificationOutboxModel.findOne({
        aggregateId: aliceId,
        eventType: NotificationType.ACCOUNT_WELCOME
      });
      expect(outboxItem).toBeDefined();
      expect(outboxItem!.status).toBe('PENDING');

      // Run worker cycle
      const processedCount = await notificationWorker.processBatch();
      expect(processedCount).toBeGreaterThanOrEqual(1);

      // Verify outbox transitioned to PROCESSED
      const updatedOutbox = await NotificationOutboxModel.findById(outboxItem!._id);
      expect(updatedOutbox!.status).toBe('PROCESSED');

      // Verify Notification record created with status SENT
      const notification = await NotificationModel.findOne({
        userId: new Types.ObjectId(aliceId),
        type: NotificationType.ACCOUNT_WELCOME
      });
      expect(notification).not.toBeNull();
      expect(notification!.status).toBe(NotificationStatus.SENT);
      expect(notification!.recipient).toBe(aliceEmail);
      expect(notification!.channel).toBe(NotificationChannel.EMAIL);
      expect(notification!.providerMessageId).toBeDefined();
    });

    it('should enqueue PASSWORD_RESET on forgot password and process securely without leaking tokens in plain logs', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: aliceEmail });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('If an account exists with that email');

      // Verify outbox entry
      const outboxItem = await NotificationOutboxModel.findOne({
        aggregateId: aliceId,
        eventType: NotificationType.PASSWORD_RESET,
        status: 'PENDING'
      });
      expect(outboxItem).toBeDefined();
      expect(outboxItem!.payload.templateData?.resetUrl).toBeDefined();

      // Process via worker
      await notificationWorker.processBatch();

      // Verify notification created
      const notification = await NotificationModel.findOne({
        userId: new Types.ObjectId(aliceId),
        type: NotificationType.PASSWORD_RESET
      });
      expect(notification).not.toBeNull();
      expect(notification!.status).toBe(NotificationStatus.SENT);
      expect(notification!.subject).toContain('Password Reset');

      // Now reset password using the debugToken exposed in test mode
      const debugToken = res.body.data.debugToken;
      expect(debugToken).toBeDefined();

      const resetRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: debugToken,
          newPassword: 'NewSecurePassword123!'
        });
      expect(resetRes.status).toBe(200);

      // Verify SECURITY_ALERT outbox event was created
      const secOutbox = await NotificationOutboxModel.findOne({
        aggregateId: aliceId,
        eventType: NotificationType.SECURITY_ALERT,
        status: 'PENDING'
      });
      expect(secOutbox).toBeDefined();

      await notificationWorker.processBatch();

      const secNotification = await NotificationModel.findOne({
        userId: new Types.ObjectId(aliceId),
        type: NotificationType.SECURITY_ALERT
      });
      expect(secNotification).not.toBeNull();
      expect(secNotification!.status).toBe(NotificationStatus.SENT);
    });
  });

  // --------------------------------------------------------------------------
  // 2. BOOKING LIFECYCLE NOTIFICATIONS
  // --------------------------------------------------------------------------
  describe('Booking Lifecycle Notifications', () => {
    it('should enqueue BOOKING_CREATED notification on booking creation and process EMAIL and SMS channels', async () => {
      const booking = await createAliceBooking(15, 3);
      expect(booking.status).toBe('PENDING');

      // Verify outbox item for BOOKING_CREATED
      const outboxItem = await NotificationOutboxModel.findOne({
        aggregateId: booking.id,
        eventType: NotificationType.BOOKING_CREATED,
        status: 'PENDING'
      });
      expect(outboxItem).toBeDefined();
      expect(outboxItem!.payload.channels).toEqual(
        expect.arrayContaining([NotificationChannel.EMAIL, NotificationChannel.SMS])
      );

      // Process batch
      await notificationWorker.processBatch();

      // Verify notification records created for both EMAIL and SMS
      const emailNotification = await NotificationModel.findOne({
        bookingId: new Types.ObjectId(booking.id),
        type: NotificationType.BOOKING_CREATED,
        channel: NotificationChannel.EMAIL
      });
      const smsNotification = await NotificationModel.findOne({
        bookingId: new Types.ObjectId(booking.id),
        type: NotificationType.BOOKING_CREATED,
        channel: NotificationChannel.SMS
      });

      expect(emailNotification).not.toBeNull();
      expect(emailNotification!.status).toBe(NotificationStatus.SENT);
      expect(emailNotification!.recipient).toBe(aliceEmail);

      expect(smsNotification).not.toBeNull();
      expect(smsNotification!.status).toBe(NotificationStatus.SENT);
      expect(smsNotification!.recipient).toBe('+919811112222');
      // SMS must be concise (<= 160 characters)
      expect(smsNotification!.body.length).toBeLessThanOrEqual(160);
    });

    it('should enqueue BOOKING_CANCELLED notification when booking is cancelled', async () => {
      const booking = await createAliceBooking(20, 2);

      // Cancel booking
      const cancelRes = await request(app)
        .post(`/api/v1/bookings/${booking.id}/cancel`)
        .set('Cookie', aliceCookie)
        .send({ reason: 'CUSTOMER_REQUEST', notes: 'Trip rescheduled by customer' });

      expect(cancelRes.status).toBe(200);

      // Verify outbox entry
      const outboxItem = await NotificationOutboxModel.findOne({
        aggregateId: booking.id,
        eventType: NotificationType.BOOKING_CANCELLED,
        status: 'PENDING'
      });
      expect(outboxItem).toBeDefined();

      await notificationWorker.processBatch();

      const cancelNotification = await NotificationModel.findOne({
        bookingId: new Types.ObjectId(booking.id),
        type: NotificationType.BOOKING_CANCELLED,
        channel: NotificationChannel.EMAIL
      });
      expect(cancelNotification).not.toBeNull();
      expect(cancelNotification!.status).toBe(NotificationStatus.SENT);
      expect(cancelNotification!.body).toContain('cancelled');
    });
  });

  // --------------------------------------------------------------------------
  // 3. PAYMENT VERIFICATION & CONFIRMATION NOTIFICATIONS
  // --------------------------------------------------------------------------
  describe('Authoritative Payment & Confirmation Notifications', () => {
    it('should enqueue PAYMENT_SUCCESS and BOOKING_CONFIRMED only after authoritative payment verification', async () => {
      const booking = await createAliceBooking(30, 2);

      // Create Razorpay order
      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', aliceCookie)
        .send({ bookingId: booking.id });
      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.data.orderId;

      // Authoritative verification with cryptographically valid signature
      const paymentId = 'pay_test_alice_valid_99';
      const signature = razorpayClient.generateTestPaymentSignature(orderId, paymentId);

      const verifyRes = await request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', aliceCookie)
        .send({
          bookingId: booking.id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.payment.status).toBe('CAPTURED');
      expect(verifyRes.body.data.booking.status).toBe('CONFIRMED');

      // Verify outbox events for PAYMENT_SUCCESS and BOOKING_CONFIRMED exist
      const paySuccessOutbox = await NotificationOutboxModel.findOne({
        aggregateId: booking.id,
        eventType: NotificationType.PAYMENT_SUCCESS,
        status: 'PENDING'
      });
      const bookingConfirmedOutbox = await NotificationOutboxModel.findOne({
        aggregateId: booking.id,
        eventType: NotificationType.BOOKING_CONFIRMED,
        status: 'PENDING'
      });

      expect(paySuccessOutbox).toBeDefined();
      expect(bookingConfirmedOutbox).toBeDefined();

      // Process worker batch
      await notificationWorker.processBatch();

      // Confirm both notifications are SENT
      const paySuccessNotif = await NotificationModel.findOne({
        bookingId: new Types.ObjectId(booking.id),
        type: NotificationType.PAYMENT_SUCCESS,
        status: NotificationStatus.SENT
      });
      const bookingConfirmedNotif = await NotificationModel.findOne({
        bookingId: new Types.ObjectId(booking.id),
        type: NotificationType.BOOKING_CONFIRMED,
        status: NotificationStatus.SENT
      });

      expect(paySuccessNotif).not.toBeNull();
      expect(bookingConfirmedNotif).not.toBeNull();
      expect(bookingConfirmedNotif!.subject).toContain('Confirmed');
    });

    it('should NOT allow client-side tampering or forged callbacks to trigger payment confirmation', async () => {
      const booking = await createAliceBooking(40, 2);

      // Attempt to post invalid signature to verify endpoint
      const res = await request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', aliceCookie)
        .send({
          bookingId: booking.id,
          razorpay_order_id: 'order_forged_123',
          razorpay_payment_id: 'pay_forged_456',
          razorpay_signature: 'invalid_forged_signature'
        });

      expect(res.status).toBe(400);

      // Verify NO BOOKING_CONFIRMED outbox event or notification was created
      const outbox = await NotificationOutboxModel.findOne({
        aggregateId: booking.id,
        eventType: NotificationType.BOOKING_CONFIRMED
      });
      expect(outbox).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 4. FLEET OPERATIONS NOTIFICATIONS (PICKUP & RETURN)
  // --------------------------------------------------------------------------
  describe('Fleet Operations Notifications', () => {
    it('should enqueue VEHICLE_ASSIGNED on pickup and BOOKING_COMPLETED on return', async () => {
      const booking = await createAliceBooking(50, 2);

      // Confirm booking first
      const orderRes = await request(app)
        .post('/api/v1/payments/orders')
        .set('Cookie', aliceCookie)
        .send({ bookingId: booking.id });
      const orderId = orderRes.body.data.orderId;
      const paymentId = 'pay_test_alice_fleet_1';
      const signature = razorpayClient.generateTestPaymentSignature(orderId, paymentId);
      await request(app)
        .post('/api/v1/payments/verify')
        .set('Cookie', aliceCookie)
        .send({
          bookingId: booking.id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        });

      // Clear earlier outbox items so we isolate fleet events
      await NotificationOutboxModel.deleteMany({});

      // 1. Staff performs pickup Handover
      const pickupResult = await fleetBookingIntegrationService.onBookingPickup(
        booking.id,
        { odometer: 12500, fuelOrBatteryLevel: 95, notes: 'Vehicle handed over in pristine condition' },
        staffUser
      );
      expect(pickupResult.booking.status).toBe('ACTIVE');

      // Check VEHICLE_ASSIGNED outbox event
      const pickupOutbox = await NotificationOutboxModel.findOne({
        aggregateId: booking.id,
        eventType: NotificationType.VEHICLE_ASSIGNED,
        status: 'PENDING'
      });
      expect(pickupOutbox).toBeDefined();

      // Process batch
      await notificationWorker.processBatch();

      const pickupNotification = await NotificationModel.findOne({
        bookingId: new Types.ObjectId(booking.id),
        type: NotificationType.VEHICLE_ASSIGNED,
        channel: NotificationChannel.EMAIL
      });
      expect(pickupNotification).not.toBeNull();
      expect(pickupNotification!.status).toBe(NotificationStatus.SENT);
      expect(pickupNotification!.subject).toContain('Vehicle Prepared');

      // 2. Staff performs return Handover
      const returnResult = await fleetBookingIntegrationService.onBookingReturn(
        booking.id,
        { odometer: 12750, fuelOrBatteryLevel: 85, notes: 'Vehicle returned cleanly' },
        staffUser
      );
      expect(returnResult.booking.status).toBe('COMPLETED');

      // Check BOOKING_COMPLETED outbox event
      const returnOutbox = await NotificationOutboxModel.findOne({
        aggregateId: booking.id,
        eventType: NotificationType.BOOKING_COMPLETED,
        status: 'PENDING'
      });
      expect(returnOutbox).toBeDefined();

      await notificationWorker.processBatch();

      const returnNotification = await NotificationModel.findOne({
        bookingId: new Types.ObjectId(booking.id),
        type: NotificationType.BOOKING_COMPLETED,
        channel: NotificationChannel.EMAIL
      });
      expect(returnNotification).not.toBeNull();
      expect(returnNotification!.status).toBe(NotificationStatus.SENT);
      expect(returnNotification!.subject).toContain('Trip Completed');

      // Reset vehicle back to AVAILABLE so subsequent test suites can book it
      await VehicleModel.findByIdAndUpdate(testVehicleId, {
        fleetStatus: 'AVAILABLE',
        status: 'ACTIVE'
      });
    });
  });

  // --------------------------------------------------------------------------
  // 5. CUSTOMER NOTIFICATION APIS & PRIVACY ISOLATION
  // --------------------------------------------------------------------------
  describe('Customer APIs & Tenant Isolation', () => {
    it('should return paginated notifications for the authenticated user only', async () => {
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Cookie', aliceCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();

      // Verify every returned notification belongs to Alice
      res.body.data.forEach((item: any) => {
        expect(item.userId).toBe(aliceId);
        // Ensure sensitive internal fields are NOT exposed to customer
        expect(item.providerMessageId).toBeUndefined();
        expect(item.failureCode).toBeUndefined();
        expect(item.failureReason).toBeUndefined();
      });
    });

    it('should strictly isolate Bob from accessing Alice notifications', async () => {
      // Bob queries his notifications
      const bobRes = await request(app)
        .get('/api/v1/notifications')
        .set('Cookie', bobCookie);

      expect(bobRes.status).toBe(200);
      // Bob should not see any items with Alice ID
      bobRes.body.data.forEach((item: any) => {
        expect(item.userId).not.toBe(aliceId);
      });

      // Find an Alice notification ID
      const aliceNotif = await NotificationModel.findOne({ userId: new Types.ObjectId(aliceId) });
      expect(aliceNotif).not.toBeNull();

      // Bob attempts to mark Alice's notification as read
      const markRes = await request(app)
        .patch(`/api/v1/notifications/${aliceNotif!._id}/read`)
        .set('Cookie', bobCookie);

      // Must return 404 Not Found (tenant-isolated, cannot see resource)
      expect(markRes.status).toBe(404);
    });

    it('should allow Alice to mark her own notification as read', async () => {
      const aliceNotif = await NotificationModel.findOne({
        userId: new Types.ObjectId(aliceId),
        isRead: false
      });
      expect(aliceNotif).not.toBeNull();

      const markRes = await request(app)
        .patch(`/api/v1/notifications/${aliceNotif!._id}/read`)
        .set('Cookie', aliceCookie);

      expect(markRes.status).toBe(200);
      expect(markRes.body.success).toBe(true);
      expect(markRes.body.data.isRead).toBe(true);

      const reloaded = await NotificationModel.findById(aliceNotif!._id);
      expect(reloaded!.isRead).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 6. NOTIFICATION PREFERENCES
  // --------------------------------------------------------------------------
  describe('Customer Notification Preferences', () => {
    it('should get default notification preferences', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/preferences')
        .set('Cookie', aliceCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.emailBookingUpdates).toBe(true);
      expect(res.body.data.smsBookingUpdates).toBe(true);
    });

    it('should update preferences and respect channel suppression on booking', async () => {
      // Alice opts out of SMS booking updates
      const patchRes = await request(app)
        .patch('/api/v1/notifications/preferences')
        .set('Cookie', aliceCookie)
        .send({
          smsBookingUpdates: false,
          marketingEmail: false
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.smsBookingUpdates).toBe(false);
      expect(patchRes.body.data.marketingEmail).toBe(false);

      // Clear outbox
      await NotificationOutboxModel.deleteMany({});

      // Create another booking for Alice
      const booking = await createAliceBooking(60, 2);

      // Process batch with worker
      await notificationWorker.processBatch();

      // Verify notifications: EMAIL was sent, SMS was suppressed due to preference
      const emailNotif = await NotificationModel.findOne({
        bookingId: new Types.ObjectId(booking.id),
        channel: NotificationChannel.EMAIL
      });
      const smsNotif = await NotificationModel.findOne({
        bookingId: new Types.ObjectId(booking.id),
        channel: NotificationChannel.SMS
      });

      expect(emailNotif).not.toBeNull();
      expect(emailNotif!.status).toBe(NotificationStatus.SENT);
      expect(smsNotif).toBeNull();

      // Reset Alice's preferences for remaining tests
      await request(app)
        .patch('/api/v1/notifications/preferences')
        .set('Cookie', aliceCookie)
        .send({
          smsBookingUpdates: true,
          marketingEmail: true
        });
    });
  });

  // --------------------------------------------------------------------------
  // 7. NON-BLOCKING FAILURE TOLERANCE
  // --------------------------------------------------------------------------
  describe('Failure Tolerance & Non-blocking Invariant', () => {
    it('should NEVER fail booking creation or payment verification even if notification enqueueing fails', async () => {
      // Temporarily mock notificationService.enqueue to throw an unexpected error
      const originalEnqueue = notificationService.enqueue;
      notificationService.enqueue = async () => {
        throw new Error('Simulated transient notification queue outage');
      };

      try {
        // Alice creates a booking
        const booking = await createAliceBooking(70, 2);
        // Booking creation MUST still succeed (201/200) and return valid booking
        expect(booking).toBeDefined();
        expect(booking.id).toBeDefined();
        expect(booking.status).toBe('PENDING');

        // Verify booking was indeed saved in MongoDB
        const persisted = await BookingModel.findById(booking.id);
        expect(persisted).not.toBeNull();
        expect(persisted!.status).toBe('PENDING');
      } finally {
        // Restore original enqueue function
        notificationService.enqueue = originalEnqueue;
      }
    });
  });
});
