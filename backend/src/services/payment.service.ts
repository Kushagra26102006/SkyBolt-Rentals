import crypto from 'crypto';
import { Types } from 'mongoose';
import { PaymentModel, IPaymentDoc } from '../models/payment.model.js';
import { WebhookEventModel } from '../models/webhook-event.model.js';
import { BookingModel, IBookingDoc } from '../models/booking.model.js';
import { ReservationModel } from '../models/reservation.model.js';
import { BookingStateMachine } from './booking-state-machine.js';
import { PaymentStateMachine } from './payment-state-machine.js';
import { razorpayClient } from './razorpay.client.js';
import { ApiError } from '../utils/api-error.js';
import { AuthenticatedUser } from '../types/auth.types.js';
import {
  CheckoutOrderDTO,
  CreatePaymentOrderInput,
  PaymentDTO,
  PaymentListQuery,
  PaymentStatus,
  VerifyPaymentInput
} from '../types/payment.types.js';
import {
  notificationService,
  NotificationType,
  NotificationChannel
} from '../notifications/index.js';

export class PaymentService {
  /**
   * Generates a unique, cryptographically random payment reference
   * Format: PAY-YYYYMMDD-XXXXXX (e.g. PAY-20260904-9C1D4A)
   */
  public generatePaymentReference(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const datePart = `${year}${month}${day}`;
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();

    return `PAY-${datePart}-${randomPart}`;
  }

  /**
   * Creates or reuses a Razorpay order for an authenticated user's booking
   * Enforces zero-trust: amount and currency are derived strictly from authoritative pricing snapshot
   */
  public async createPaymentOrder(
    user: AuthenticatedUser,
    input: CreatePaymentOrderInput
  ): Promise<CheckoutOrderDTO> {
    const userObjectId = new Types.ObjectId(user.id);

    // 1. Fetch booking by ID or reference
    let booking: IBookingDoc | null = null;
    if (Types.ObjectId.isValid(input.bookingId)) {
      booking = await BookingModel.findById(input.bookingId).exec();
    } else {
      booking = await BookingModel.findOne({ bookingReference: input.bookingId }).exec();
    }

    if (!booking || booking.isDeleted) {
      throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }

    // 2. Strict Ownership Check: Customer can only pay for their own booking
    if (user.role === 'CUSTOMER' && booking.userId.toString() !== user.id) {
      throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }

    // 3. Verify Booking State: Must be payable
    if (booking.status === 'CONFIRMED' || booking.paymentStatus === 'PAID') {
      throw new ApiError(409, 'PAYMENT_ALREADY_PROCESSED', 'Booking has already been paid and confirmed.');
    }

    if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(booking.status)) {
      throw new ApiError(
        409,
        'BOOKING_NOT_PAYABLE',
        `Cannot initiate payment for booking in "${booking.status}" status.`
      );
    }

    // 4. Duplicate Order Protection & Reuse:
    // Check if an existing pending payment order already exists for this booking
    const existingPayment = await PaymentModel.findOne({
      bookingId: booking._id,
      userId: userObjectId,
      status: 'ORDER_CREATED'
    }).exec();

    const authoritativeTotal = booking.pricingSnapshot.total;
    const currency = booking.pricingSnapshot.currency || 'INR';
    const amountPaise = Math.round(authoritativeTotal * 100);

    if (existingPayment) {
      // If the existing order matches the authoritative amount and currency, reuse it
      if (existingPayment.amountPaise === amountPaise && existingPayment.currency === currency) {
        return {
          keyId: razorpayClient.getKeyId(),
          orderId: existingPayment.providerOrderId,
          amount: existingPayment.amountPaise,
          currency: existingPayment.currency,
          bookingId: booking._id.toString(),
          bookingReference: booking.bookingReference,
          paymentReference: existingPayment.paymentReference,
          customerName: user.name,
          customerEmail: user.email,
          customerContact: user.phone
        };
      }
    }

    // 5. Generate human-readable unique payment reference
    let paymentReference = this.generatePaymentReference();
    let collision = await PaymentModel.findOne({ paymentReference }).exec();
    while (collision) {
      paymentReference = this.generatePaymentReference();
      collision = await PaymentModel.findOne({ paymentReference }).exec();
    }

    // 6. Create Razorpay order via API / client
    const rzpOrder = await razorpayClient.createOrder({
      amountPaise,
      currency,
      receipt: paymentReference,
      notes: {
        bookingId: booking._id.toString(),
        bookingReference: booking.bookingReference,
        userId: user.id
      }
    });

    // 7. Persist Payment Record in ORDER_CREATED state
    const payment = await PaymentModel.create({
      paymentReference,
      bookingId: booking._id,
      userId: userObjectId,
      provider: 'RAZORPAY',
      providerOrderId: rzpOrder.id,
      amount: authoritativeTotal,
      amountPaise,
      currency,
      status: 'ORDER_CREATED',
      signatureVerified: false,
      webhookVerified: false,
      metadata: {
        razorpayOrderCreatedAt: rzpOrder.created_at
      }
    });

    // 8. Transition booking to PAYMENT_PENDING if currently PENDING
    if (booking.status === 'PENDING') {
      BookingStateMachine.assertTransition(booking.status, 'PAYMENT_PENDING');
      booking.status = 'PAYMENT_PENDING';
      booking.statusHistory.push({
        from: 'PENDING',
        to: 'PAYMENT_PENDING',
        changedAt: new Date(),
        changedBy: user.id,
        reason: 'Payment order initiated by customer'
      });
      await booking.save();
    }

    return {
      keyId: razorpayClient.getKeyId(),
      orderId: payment.providerOrderId,
      amount: payment.amountPaise,
      currency: payment.currency,
      bookingId: booking._id.toString(),
      bookingReference: booking.bookingReference,
      paymentReference: payment.paymentReference,
      customerName: user.name,
      customerEmail: user.email,
      customerContact: user.phone
    };
  }

  /**
   * Cryptographically verifies Razorpay payment callback and confirms booking atomically
   */
  public async verifyPayment(
    user: AuthenticatedUser,
    input: VerifyPaymentInput
  ): Promise<{ booking: any; payment: PaymentDTO }> {
    // 1. Validate Input
    if (!input.razorpay_order_id || !input.razorpay_payment_id || !input.razorpay_signature) {
      throw ApiError.badRequest('Missing Razorpay payment verification credentials.');
    }

    // 2. Cryptographically verify signature server-side using RAZORPAY_KEY_SECRET
    const isSignatureValid = razorpayClient.verifyPaymentSignature(
      input.razorpay_order_id,
      input.razorpay_payment_id,
      input.razorpay_signature
    );

    if (!isSignatureValid) {
      throw new ApiError(
        400,
        'PAYMENT_SIGNATURE_INVALID',
        'Cryptographic payment signature verification failed.'
      );
    }

    // 3. Locate payment record by providerOrderId
    const payment = await PaymentModel.findOne({
      providerOrderId: input.razorpay_order_id
    }).exec();

    if (!payment) {
      throw new ApiError(404, 'PAYMENT_NOT_FOUND', 'Payment order not found in database.');
    }

    // 4. Ownership verification: ensure payment belongs to authenticated user
    if (user.role === 'CUSTOMER' && payment.userId.toString() !== user.id) {
      throw new ApiError(403, 'PAYMENT_NOT_OWNED', 'You are not authorized to verify this payment.');
    }

    // 5. Locate booking and verify relationship
    const booking = await BookingModel.findById(payment.bookingId).exec();
    if (!booking || booking.isDeleted) {
      throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Associated booking not found.');
    }

    if (input.bookingId && booking._id.toString() !== input.bookingId && booking.bookingReference !== input.bookingId) {
      throw new ApiError(400, 'PAYMENT_BOOKING_MISMATCH', 'Payment does not match target booking.');
    }

    // 6. Verify Amount and Currency integrity against authoritative booking pricing
    const expectedPaise = Math.round(booking.pricingSnapshot.total * 100);
    if (payment.amountPaise !== expectedPaise) {
      throw new ApiError(
        400,
        'PAYMENT_AMOUNT_MISMATCH',
        `Payment amount (${payment.amountPaise} paise) does not match authoritative booking amount (${expectedPaise} paise).`
      );
    }

    if (payment.currency !== booking.pricingSnapshot.currency) {
      throw new ApiError(
        400,
        'PAYMENT_CURRENCY_MISMATCH',
        `Payment currency (${payment.currency}) does not match booking currency (${booking.pricingSnapshot.currency}).`
      );
    }

    // 7. Idempotency handling: If already captured and confirmed, return safe state
    if (payment.status === 'CAPTURED') {
      if (payment.providerPaymentId && payment.providerPaymentId !== input.razorpay_payment_id) {
        throw new ApiError(
          409,
          'PAYMENT_ID_MISMATCH',
          'This payment order has already been captured under a different payment ID.'
        );
      }
      if (booking.status !== 'CONFIRMED' && BookingStateMachine.canTransition(booking.status, 'CONFIRMED')) {
        const prevStatus = booking.status;
        booking.status = 'CONFIRMED';
        booking.paymentStatus = 'PAID';
        booking.statusHistory.push({
          from: prevStatus,
          to: 'CONFIRMED',
          changedAt: new Date(),
          changedBy: 'PAYMENT_GATEWAY',
          reason: `Payment re-verified via idempotent client callback (${payment.paymentReference})`
        });
        await booking.save();
        if (booking.reservationId) {
          await ReservationModel.findByIdAndUpdate(booking.reservationId, {
            status: 'CONFIRMED'
          }).exec();
        }
      }
      return {
        booking: booking.toDTO(),
        payment: payment.toDTO()
      };
    }

    // 8. Assert Payment State Machine Transition
    PaymentStateMachine.assertTransition(payment.status, 'CAPTURED');

    // 9. Atomic Status Updates
    payment.status = 'CAPTURED';
    payment.providerPaymentId = input.razorpay_payment_id;
    payment.signatureVerified = true;
    await payment.save();

    // 10. Update Booking State to CONFIRMED
    if (booking.status !== 'CONFIRMED') {
      const prevStatus = booking.status;
      if (!BookingStateMachine.canTransition(booking.status, 'CONFIRMED')) {
        throw new ApiError(
          409,
          'BOOKING_NOT_CONFIRMABLE',
          `Booking is in ${booking.status} state and cannot be confirmed.`
        );
      }
      booking.status = 'CONFIRMED';
      booking.paymentStatus = 'PAID';
      booking.statusHistory.push({
        from: prevStatus,
        to: 'CONFIRMED',
        changedAt: new Date(),
        changedBy: 'PAYMENT_GATEWAY',
        reason: `Payment verified successfully via client callback (${payment.paymentReference})`
      });
      await booking.save();
    }

    // 11. Update Underlying Inventory Reservation status to CONFIRMED
    if (booking.reservationId) {
      await ReservationModel.findByIdAndUpdate(booking.reservationId, {
        status: 'CONFIRMED'
      }).exec();
    }

    // 12. Enqueue transactional payment success and booking confirmed notifications
    try {
      const paymentAmountStr = `₹${(payment.amountPaise / 100).toLocaleString('en-IN')}`;

      // Enqueue Payment Success Notification
      await notificationService.enqueue({
        type: NotificationType.PAYMENT_SUCCESS,
        userId: user.id,
        bookingId: booking._id.toString(),
        paymentId: payment._id.toString(),
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
        templateData: {
          customerName: user.name,
          amount: paymentAmountStr,
          paymentReference: payment.paymentReference,
          bookingReference: booking.bookingReference,
          paymentMethod: payment.method || 'Online (Razorpay)'
        }
      });

      // Enqueue Booking Confirmed Notification
      await notificationService.enqueue({
        type: NotificationType.BOOKING_CONFIRMED,
        userId: user.id,
        bookingId: booking._id.toString(),
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
        templateData: {
          customerName: user.name,
          bookingReference: booking.bookingReference,
          vehicleName: booking.vehicleSnapshot?.name || 'Selected Vehicle',
          pickupLocation: booking.pickupLocation,
          pickupAt: new Date(booking.pickupAt).toLocaleString(),
          returnLocation: booking.returnLocation,
          returnAt: new Date(booking.returnAt).toLocaleString(),
          totalAmount: paymentAmountStr
        }
      });
    } catch (notifyErr) {
      console.warn('[SkyBolt Payment] Failed to enqueue payment/booking confirmation notifications:', notifyErr);
    }

    return {
      booking: booking.toDTO(),
      payment: payment.toDTO()
    };
  }

  /**
   * Processes Official Razorpay Webhooks
   * Cryptographically verifies signature via RAZORPAY_WEBHOOK_SECRET and enforces idempotency
   */
  public async processWebhook(
    rawBody: string | Buffer,
    signature: string,
    payload: any
  ): Promise<{ status: string; message: string }> {
    // 1. Cryptographic HMAC SHA-256 Webhook Signature Verification
    const isSignatureValid = razorpayClient.verifyWebhookSignature(rawBody, signature);
    if (!isSignatureValid) {
      throw new ApiError(400, 'WEBHOOK_SIGNATURE_INVALID', 'Invalid Razorpay webhook signature.');
    }

    const eventId =
      payload?.event_id ||
      payload?.id ||
      crypto.createHash('sha256').update(rawBody).digest('hex');

    const eventType = payload?.event || 'unknown';

    // 2. Atomic Event Claiming & Deduplication (prevents race conditions across backend cluster)
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const providerOrderId = payload?.payload?.payment?.entity?.order_id || payload?.payload?.order?.entity?.id;
    const providerPaymentId = payload?.payload?.payment?.entity?.id;

    try {
      await WebhookEventModel.create({
        eventId,
        eventType,
        providerOrderId,
        providerPaymentId,
        status: 'PROCESSING',
        payloadHash,
        receivedAt: new Date(),
        processedAt: new Date()
      });
    } catch (insertErr: any) {
      if (insertErr?.code === 11000 || insertErr?.message?.includes('duplicate key')) {
        return {
          status: 'IGNORED',
          message: 'Webhook event already processed previously.'
        };
      }
      throw insertErr;
    }

    // 3. Handle Supported Webhook Events
    try {
      if (eventType === 'payment.captured' || eventType === 'order.paid') {
        const paymentEntity = payload?.payload?.payment?.entity;
        const orderId = paymentEntity?.order_id || payload?.payload?.order?.entity?.id;
        const paymentId = paymentEntity?.id;
        const method = paymentEntity?.method;

        if (orderId) {
          const payment = await PaymentModel.findOne({ providerOrderId: orderId }).exec();
          if (payment) {
            payment.webhookVerified = true;
            if (paymentId) payment.providerPaymentId = paymentId;
            if (method) payment.method = method;

            if (payment.status !== 'CAPTURED' && PaymentStateMachine.canTransition(payment.status, 'CAPTURED')) {
              payment.status = 'CAPTURED';
            }
            await payment.save();

            // Confirm Booking
            const booking = await BookingModel.findById(payment.bookingId).exec();
            if (booking && booking.status !== 'CONFIRMED') {
              const prev = booking.status;
              if (BookingStateMachine.canTransition(booking.status, 'CONFIRMED')) {
                booking.status = 'CONFIRMED';
              }
              booking.paymentStatus = 'PAID';
              booking.statusHistory.push({
                from: prev,
                to: 'CONFIRMED',
                changedAt: new Date(),
                changedBy: 'WEBHOOK',
                reason: `Payment captured via Razorpay webhook event ${eventType}`
              });
              await booking.save();

              if (booking.reservationId) {
                await ReservationModel.findByIdAndUpdate(booking.reservationId, {
                  status: 'CONFIRMED'
                }).exec();
              }
            }
          }
        }
      } else if (eventType === 'payment.failed') {
        const paymentEntity = payload?.payload?.payment?.entity;
        const orderId = paymentEntity?.order_id;
        const paymentId = paymentEntity?.id;

        if (orderId) {
          const payment = await PaymentModel.findOne({ providerOrderId: orderId }).exec();
          if (payment) {
            if (payment.status !== 'CAPTURED' && PaymentStateMachine.canTransition(payment.status, 'FAILED')) {
              payment.status = 'FAILED';
              payment.failureCode = paymentEntity?.error_code || 'PAYMENT_FAILED';
              payment.failureReason = paymentEntity?.error_description || 'Payment failed on gateway';
              if (paymentId) payment.providerPaymentId = paymentId;
              await payment.save();

              // Enqueue payment failed notification
              try {
                await notificationService.enqueue({
                  type: NotificationType.PAYMENT_FAILED,
                  userId: payment.userId.toString(),
                  bookingId: payment.bookingId.toString(),
                  paymentId: payment._id.toString(),
                  channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
                  templateData: {
                    customerName: 'Valued Customer',
                    amount: `₹${(payment.amountPaise / 100).toLocaleString('en-IN')}`,
                    bookingReference: payment.paymentReference,
                    failureReason: payment.failureReason || 'Transaction declined by bank or gateway'
                  }
                });
              } catch (notifyErr) {
                console.warn('[SkyBolt Webhook] Failed to enqueue payment failure notification:', notifyErr);
              }
            }
          }
        }
      } else if (eventType === 'refund.processed' || eventType === 'refund.created') {
        const refundEntity = payload?.payload?.refund?.entity;
        const paymentId = refundEntity?.payment_id;
        const refundId = refundEntity?.id;
        const refundAmountPaise = refundEntity?.amount;

        if (paymentId) {
          const payment = await PaymentModel.findOne({ providerPaymentId: paymentId }).exec();
          if (payment) {
            payment.providerRefundId = refundId;
            payment.refundStatus = 'PROCESSED';
            payment.refundedAt = new Date();
            if (refundAmountPaise) {
              payment.amountRefunded = refundAmountPaise / 100;
            }
            const isFull = (payment.amountRefunded || 0) >= payment.amount;
            const targetStatus: PaymentStatus = isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
            if (PaymentStateMachine.canTransition(payment.status, targetStatus)) {
              payment.status = targetStatus;
            }
            await payment.save();

            const booking = await BookingModel.findById(payment.bookingId).exec();
            if (booking) {
              booking.paymentStatus = isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
              if (booking.cancellation) {
                booking.cancellation.refundStatus = 'PROCESSED';
                booking.cancellation.refundId = refundId;
                booking.cancellation.refundAmount = payment.amountRefunded;
                booking.cancellation.refundProcessedAt = new Date();
              }
              await booking.save();
            }
          }
        }
      }

      // Mark webhook execution as PROCESSED
      await WebhookEventModel.updateOne(
        { eventId },
        {
          $set: {
            status: 'PROCESSED',
            processedAt: new Date()
          }
        }
      );

      return {
        status: 'PROCESSED',
        message: `Webhook event "${eventType}" processed successfully.`
      };
    } catch (err: any) {
      await WebhookEventModel.updateOne(
        { eventId },
        {
          $set: {
            status: 'FAILED',
            processedAt: new Date(),
            error: err?.message || 'Processing failure'
          }
        }
      );
      throw err;
    }
  }

  /**
   * Retrieves single payment record with strict customer ownership restrictions
   */
  public async getPaymentById(paymentIdOrRef: string, user: AuthenticatedUser): Promise<PaymentDTO> {
    let payment: IPaymentDoc | null = null;
    if (Types.ObjectId.isValid(paymentIdOrRef)) {
      payment = await PaymentModel.findById(paymentIdOrRef).exec();
    } else {
      payment = await PaymentModel.findOne({
        $or: [{ paymentReference: paymentIdOrRef }, { providerOrderId: paymentIdOrRef }]
      }).exec();
    }

    if (!payment) {
      throw new ApiError(404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
    }

    if (user.role === 'CUSTOMER' && payment.userId.toString() !== user.id) {
      throw new ApiError(404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
    }

    return payment.toDTO();
  }

  /**
   * Retrieves customer payment history with pagination and status filters
   */
  public async getUserPayments(
    userId: string,
    query: PaymentListQuery
  ): Promise<{
    data: PaymentDTO[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = { userId: new Types.ObjectId(userId) };
    if (query.status) {
      filter.status = query.status;
    }
    if (query.bookingId) {
      filter.bookingId = Types.ObjectId.isValid(query.bookingId)
        ? new Types.ObjectId(query.bookingId)
        : query.bookingId;
    }

    const [payments, total] = await Promise.all([
      PaymentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      PaymentModel.countDocuments(filter).exec()
    ]);

    return {
      data: payments.map((p) => p.toDTO()),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Authoritative Razorpay Refund Execution for Cancelled Bookings
   * Enforces financial idempotency, records refund IDs and tracks refund state.
   */
  public async refundBookingPayment(
    booking: IBookingDoc,
    user: AuthenticatedUser,
    refundAmount: number,
    reason: string
  ): Promise<{
    refundId: string | null;
    status: 'NOT_APPLICABLE' | 'PENDING' | 'PROCESSED' | 'FAILED';
    amount: number;
    failureReason?: string;
  }> {
    if (refundAmount <= 0) {
      return {
        refundId: null,
        status: 'NOT_APPLICABLE',
        amount: 0
      };
    }

    // 1. Locate captured payment associated with this booking
    const payment = await PaymentModel.findOne({
      bookingId: booking._id,
      status: { $in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] }
    }).exec();

    if (!payment || !payment.providerPaymentId) {
      return {
        refundId: null,
        status: 'NOT_APPLICABLE',
        amount: 0
      };
    }

    // 2. Idempotency Guard: Check if this booking was already refunded
    if (payment.status === 'REFUNDED' && payment.providerRefundId) {
      return {
        refundId: payment.providerRefundId,
        status: 'PROCESSED',
        amount: payment.amountRefunded || refundAmount
      };
    }

    // 3. Compute exact refund delta and paise
    const alreadyRefunded = payment.amountRefunded || 0;
    const maxRefundable = Math.max(0, payment.amount - alreadyRefunded);
    const finalRefundAmount = Math.min(refundAmount, maxRefundable);

    if (finalRefundAmount <= 0) {
      return {
        refundId: payment.providerRefundId || null,
        status: 'PROCESSED',
        amount: alreadyRefunded
      };
    }

    const refundAmountPaise = Math.round(finalRefundAmount * 100);
    const receipt = `RFND-${booking.bookingReference}-${Date.now()}`;

    // 4. Invoke Razorpay Refund API
    try {
      const rzpRefund = await razorpayClient.createRefund({
        paymentId: payment.providerPaymentId,
        amountPaise: refundAmountPaise,
        receipt,
        notes: {
          bookingId: booking._id.toString(),
          bookingReference: booking.bookingReference,
          userId: user.id,
          reason
        }
      });

      const isProcessed = rzpRefund.status === 'processed';
      const isPending = rzpRefund.status === 'pending';

      payment.providerRefundId = rzpRefund.id;
      payment.amountRefunded = (payment.amountRefunded || 0) + finalRefundAmount;
      payment.refundStatus = isProcessed ? 'PROCESSED' : (isPending ? 'PENDING' : 'FAILED');
      payment.refundedAt = new Date();
      payment.refunds = payment.refunds || [];
      payment.refunds.push({
        refundId: rzpRefund.id,
        amount: finalRefundAmount,
        status: rzpRefund.status,
        receipt,
        createdAt: new Date()
      });

      // Update payment state ONLY when refund is processed
      if (isProcessed) {
        const isFullRefund = payment.amountRefunded >= payment.amount;
        const targetStatus: PaymentStatus = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        if (PaymentStateMachine.canTransition(payment.status, targetStatus)) {
          payment.status = targetStatus;
        }
      }
      await payment.save();

      // Enqueue notification if processed or pending
      if (isProcessed || isPending) {
        try {
          await notificationService.enqueue({
            type: NotificationType.PAYMENT_REFUNDED,
            userId: user.id,
            bookingId: booking._id.toString(),
            paymentId: payment._id.toString(),
            channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
            templateData: {
              customerName: user.name || 'Valued Customer',
              amount: finalRefundAmount.toLocaleString('en-IN'),
              bookingReference: booking.bookingReference,
              refundReference: rzpRefund.id,
              paymentReference: payment.paymentReference
            }
          });
        } catch (notifyErr) {
          console.warn('[SkyBolt Payment] Failed to enqueue refund notification:', notifyErr);
        }
      }

      return {
        refundId: rzpRefund.id,
        status: isProcessed ? 'PROCESSED' : (isPending ? 'PENDING' : 'FAILED'),
        amount: finalRefundAmount
      };
    } catch (err: any) {
      console.error('[SkyBolt Payment] Gateway refund exception:', err?.message || err);
      // NEVER mark payment as REFUNDED on failure
      payment.refundStatus = 'FAILED';
      payment.failureReason = err?.message || 'Gateway refund call failed';
      await payment.save();

      return {
        refundId: null,
        status: 'FAILED',
        amount: 0,
        failureReason: err?.message || 'Payment gateway refund failed'
      };
    }
  }
}

export const paymentService = new PaymentService();
export default paymentService;
