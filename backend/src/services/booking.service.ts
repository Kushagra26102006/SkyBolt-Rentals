import crypto from 'crypto';
import { Types } from 'mongoose';
import { IBookingDoc } from '../models/booking.model.js';
import { IdempotencyModel } from '../models/idempotency.model.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { vehicleRepository } from '../repositories/vehicle.repository.js';
import { availabilityService } from './availability.service.js';
import { BookingStateMachine } from './booking-state-machine.js';
import { pricingService } from '../pricing/pricing.service.js';
import { ApiError } from '../utils/api-error.js';
import { AuthenticatedUser } from '../types/auth.types.js';
import {
  BookingDTO,
  CreateBookingInput,
  CancelBookingInput,
  BookingListQuery
} from '../types/booking.types.js';
import {
  notificationService,
  NotificationType,
  NotificationChannel
} from '../notifications/index.js';
import { CouponModel } from '../models/coupon.model.js';
import { paymentService } from './payment.service.js';
import { roundMoney } from '../pricing/pricing.utils.js';
import { runWithTransactionOrCompensate } from '../utils/transaction.helper.js';

/**
 * Authoritative Cancellation & Refund Policy Calculation
 * - > 24 hours prior to pickup: 100% rental refund + 100% deposit refund
 * - 0 to 24 hours prior to pickup: 50% rental refund + 100% deposit refund
 * - At or after pickup time: 0% rental refund + 100% deposit refund
 * - Unpaid bookings: ₹0 refundable
 */
export function calculateCancellationRefund(booking: IBookingDoc, cancellationTime: Date = new Date()): {
  refundAmount: number;
  rentalRefund: number;
  depositRefund: number;
  policyApplied: string;
} {
  if (booking.paymentStatus !== 'PAID') {
    return {
      refundAmount: 0,
      rentalRefund: 0,
      depositRefund: 0,
      policyApplied: 'Unpaid booking: ₹0 refundable.'
    };
  }

  const pickupTime = new Date(booking.pickupAt).getTime();
  const cancelTime = cancellationTime.getTime();
  const hoursUntilPickup = (pickupTime - cancelTime) / (1000 * 60 * 60);

  // Security deposit is 100% refundable on all cancellations regardless of timing
  const depositRefund = booking.pricingSnapshot?.fees || 1000;
  const rentalGross = Math.max(0, (booking.pricingSnapshot?.total || 0) - depositRefund);

  let rentalRefund = 0;
  let policyApplied = '';

  if (hoursUntilPickup >= 24) {
    rentalRefund = rentalGross;
    policyApplied = 'Cancelled >24h prior: 100% rental refund + 100% deposit refund';
  } else if (hoursUntilPickup > 0) {
    rentalRefund = roundMoney(rentalGross * 0.5);
    policyApplied = 'Cancelled <24h prior: 50% rental refund + 100% deposit refund';
  } else {
    rentalRefund = 0;
    policyApplied = 'Cancelled after pickup: 0% rental refund + 100% deposit refund';
  }

  const refundAmount = roundMoney(rentalRefund + depositRefund);

  return {
    refundAmount,
    rentalRefund,
    depositRefund,
    policyApplied
  };
}

export class BookingService {
  /**
   * Generates a unique, cryptographically random, human-readable booking reference
   * Format: SKY-YYYYMMDD-XXXXXX (e.g. SKY-20260904-8E4F1B)
   */
  public generateBookingReference(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const datePart = `${year}${month}${day}`;
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();

    return `SKY-${datePart}-${randomPart}`;
  }

  /**
   * Generates SHA-256 fingerprint of booking creation request payload
   */
  private generateRequestFingerprint(userId: string, input: CreateBookingInput): string {
    const payload = `${userId}:${input.vehicleId}:${input.pickupAt}:${input.returnAt}:${input.couponCode || ''}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Creates a new booking with inventory locking, anti-double-booking protection, and idempotency
   */
  public async createBooking(
    userId: string,
    input: CreateBookingInput,
    idempotencyKey?: string
  ): Promise<{ booking: BookingDTO; isCached: boolean }> {
    const userObjectId = new Types.ObjectId(userId);

    // 1. Idempotency Check
    let fingerprint = '';
    if (idempotencyKey) {
      fingerprint = this.generateRequestFingerprint(userId, input);
      const existingKey = await IdempotencyModel.findOne({
        key: idempotencyKey,
        userId: userObjectId
      }).exec();

      if (existingKey) {
        if (existingKey.requestFingerprint === fingerprint) {
          return {
            booking: existingKey.responseBody as BookingDTO,
            isCached: true
          };
        } else {
          throw new ApiError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key has already been used with different request parameters.'
          );
        }
      }
    }

    // 2. Validate Vehicle existence and status
    const vehicle = await vehicleRepository.findByIdOrCode(input.vehicleId);
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${input.vehicleId}" not found.`);
    }

    if (vehicle.status !== 'ACTIVE') {
      throw new ApiError(
        409,
        'VEHICLE_NOT_RENTABLE',
        `Vehicle is currently in "${vehicle.status}" status and cannot be booked.`
      );
    }

    // 3. Validate Dates
    const pickupAt = new Date(input.pickupAt);
    const returnAt = new Date(input.returnAt);

    if (isNaN(pickupAt.getTime()) || isNaN(returnAt.getTime())) {
      throw ApiError.badRequest('Invalid pickup or return date format.');
    }

    if (pickupAt >= returnAt) {
      throw ApiError.unprocessable('Return timestamp must be strictly after pickup timestamp.');
    }

    // 4. Concurrency-safe atomic database reservation & booking creation with compensating rollback
    let reservedReservationId: Types.ObjectId | null = null;
    let claimedCouponCode: string | null = null;
    let createdBooking: IBookingDoc;

    try {
      createdBooking = await runWithTransactionOrCompensate(
        async (session) => {
          // Authoritatively reserve inventory in MongoDB atomically (throws 409 if unavailable)
          const reservationId = await availabilityService.reserveForBooking(
            vehicle._id,
            userObjectId,
            pickupAt,
            returnAt,
            session ?? undefined
          );
          reservedReservationId = reservationId;

          // Authoritative pricing engine (Task 09)
          const { pricingSnapshot } = await pricingService.calculatePrice(
            vehicle,
            pickupAt,
            returnAt,
            input.couponCode
          );

          // If coupon code provided, atomically claim usage (enforcing usageLimit atomically)
          if (input.couponCode && input.couponCode.trim().length > 0) {
            const normalizedCode = input.couponCode.trim().toUpperCase();
            const now = new Date();

            const claimedCoupon = await CouponModel.findOneAndUpdate(
              {
                code: normalizedCode,
                isActive: true,
                startsAt: { $lte: now },
                $or: [
                  { expiresAt: null },
                  { expiresAt: { $exists: false } },
                  { expiresAt: { $gt: now } }
                ],
                $expr: {
                  $or: [
                    { $eq: [{ $ifNull: ['$usageLimit', 0] }, 0] },
                    { $lt: ['$usageCount', '$usageLimit'] }
                  ]
                }
              },
              { $inc: { usageCount: 1 } },
              { returnDocument: 'after', session: session ?? undefined }
            ).exec();

            if (!claimedCoupon) {
              throw new ApiError(
                422,
                'COUPON_USAGE_LIMIT_REACHED',
                `Coupon code "${normalizedCode}" is invalid, expired, or has reached its redemption limit.`
              );
            }
            claimedCouponCode = normalizedCode;
          }

          // Snapshots
          const firstImage = vehicle.images && vehicle.images.length > 0 ? vehicle.images[0] : null;
          const imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url || 'assets/images/hero-bg.webp';

          const vehicleSnapshot = {
            brand: vehicle.brand,
            model: vehicle.model,
            variant: vehicle.variant || '',
            registrationNumber: vehicle.registrationNumber || '',
            image: imageUrl,
            name: vehicle.name
          };

          const pickupLocation = {
            locationId: vehicle.location?.locationId || '',
            name: input.pickupLocation || vehicle.location?.name || 'Main Hub',
            address: vehicle.location?.city || ''
          };

          const returnLocation = {
            locationId: vehicle.location?.locationId || '',
            name: input.returnLocation || input.pickupLocation || vehicle.location?.name || 'Main Hub',
            address: vehicle.location?.city || ''
          };

          let bookingReference = this.generateBookingReference();
          // Ensure reference uniqueness in unlikely collision event
          let collision = await bookingRepository.findByReference(bookingReference);
          while (collision) {
            bookingReference = this.generateBookingReference();
            collision = await bookingRepository.findByReference(bookingReference);
          }

          const booking = await bookingRepository.create({
            bookingReference,
            userId: userObjectId,
            vehicleId: vehicle._id,
            ownerId: vehicle.ownerId ? new Types.ObjectId(vehicle.ownerId as any) : null,
            reservationId,
            pickupAt,
            returnAt,
            pickupLocation,
            returnLocation,
            status: 'PENDING',
            paymentStatus: 'UNPAID',
            pricingSnapshot,
            vehicleSnapshot,
            statusHistory: [
              {
                from: null,
                to: 'PENDING',
                changedAt: new Date(),
                changedBy: 'CUSTOMER',
                reason: 'Booking initiated by customer'
              }
            ],
            metadata: {
              notes: input.notes || '',
              source: 'web_checkout',
              couponCode: claimedCouponCode
            },
            isDeleted: false,
            deletedAt: null
          }, { session: session ?? undefined });

          return booking;
        },
        async () => {
          // Compensation callback: if booking creation fails and non-replica MongoDB rollback is needed:
          if (reservedReservationId) {
            await availabilityService.releaseReservation(
              reservedReservationId,
              vehicle._id,
              userObjectId.toString()
            ).catch(() => {});
          }
          if (claimedCouponCode) {
            await CouponModel.updateOne(
              { code: claimedCouponCode, usageCount: { $gt: 0 } },
              { $inc: { usageCount: -1 } }
            ).catch(() => {});
          }
        }
      );
    } catch (err: any) {
      // If concurrent duplicate requests with the same idempotency key race, check if the first request finished
      if (idempotencyKey && err.statusCode === 409 && err.code === 'VEHICLE_UNAVAILABLE') {
        for (let i = 0; i < 20; i++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          const cached = await IdempotencyModel.findOne({
            key: idempotencyKey,
            userId: userObjectId
          }).exec();
          if (cached) {
            return {
              booking: cached.responseBody as BookingDTO,
              isCached: true
            };
          }
        }
      }
      throw err;
    }

    const bookingDTO = createdBooking.toDTO();

    // 5. Store Idempotency response if key provided (TTL: 24h)
    if (idempotencyKey) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      try {
        await IdempotencyModel.create({
          key: idempotencyKey,
          userId: userObjectId,
          requestFingerprint: fingerprint,
          responseStatus: 201,
          responseBody: bookingDTO,
          expiresAt
        });
      } catch (err) {
        // Idempotency write error shouldn't fail booking creation
        console.warn('[Idempotency] Failed to store idempotency record:', err);
      }
    }

    // Enqueue transactional booking creation notification
    try {
      await notificationService.enqueue({
        type: NotificationType.BOOKING_CREATED,
        userId: userObjectId.toString(),
        bookingId: bookingDTO.id,
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
        templateData: {
          customerName: 'Valued Customer',
          bookingReference: bookingDTO.bookingReference,
          vehicleName: bookingDTO.vehicle?.name || 'Selected Vehicle',
          pickupLocation: bookingDTO.pickupLocation?.name || 'Designated Hub',
          pickupAt: new Date(bookingDTO.pickupAt).toLocaleString(),
          returnAt: new Date(bookingDTO.returnAt).toLocaleString(),
          totalAmount: `₹${bookingDTO.pricing?.total?.toLocaleString('en-IN') || 0}`
        }
      });
    } catch (notifyErr) {
      console.warn('[SkyBolt Booking] Failed to enqueue booking creation notification:', notifyErr);
    }

    return { booking: bookingDTO, isCached: false };
  }

  /**
   * Retrieves customer's booking list with pagination, allowlisted sorting, and filters
   */
  public async getUserBookings(
    userId: string,
    query: BookingListQuery
  ): Promise<{
    data: BookingDTO[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const filters = {
      status: query.status,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      vehicleId: query.vehicleId
    };

    const pagination = {
      page: query.page || 1,
      limit: query.limit || 20
    };

    const result = await bookingRepository.findUserBookings(
      userId,
      filters,
      pagination,
      query.sort || 'newest'
    );

    return {
      data: result.bookings.map((b) => b.toDTO()),
      meta: {
        page: result.page,
        limit: pagination.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    };
  }

  /**
   * Retrieves a single booking by ID or reference with strict ownership checks
   */
  public async getBookingById(
    bookingIdOrRef: string,
    user: AuthenticatedUser
  ): Promise<BookingDTO> {
    let booking: IBookingDoc | null = null;

    if (Types.ObjectId.isValid(bookingIdOrRef)) {
      booking = await bookingRepository.findById(bookingIdOrRef);
    } else {
      booking = await bookingRepository.findByReference(bookingIdOrRef);
    }

    if (!booking || booking.isDeleted) {
      throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }

    // Customer access strictly restricted to own bookings
    if (user.role === 'CUSTOMER' && booking.userId.toString() !== user.id) {
      // 404 prevents leaking existence of bookings across users
      throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }

    return booking.toDTO();
  }

  /**
   * Cancels a booking and releases the underlying inventory reservation
   */
  public async cancelBooking(
    bookingIdOrRef: string,
    user: AuthenticatedUser,
    input: CancelBookingInput
  ): Promise<BookingDTO> {
    let booking: IBookingDoc | null = null;

    if (Types.ObjectId.isValid(bookingIdOrRef)) {
      booking = await bookingRepository.findById(bookingIdOrRef);
    } else {
      booking = await bookingRepository.findByReference(bookingIdOrRef);
    }

    if (!booking || booking.isDeleted) {
      throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }

    // Ownership check
    if (user.role === 'CUSTOMER' && booking.userId.toString() !== user.id) {
      throw ApiError.forbidden('You are not authorized to cancel this booking.');
    }

    // State machine check: can this booking transition to CANCELLED?
    BookingStateMachine.assertTransition(booking.status, 'CANCELLED');

    const previousStatus = booking.status;
    const reason = input.reason || 'CUSTOMER_REQUEST';
    const now = new Date();

    // 1. Calculate Authoritative Refund Eligibility
    const { refundAmount } = calculateCancellationRefund(booking, now);

    // 2. Perform Real Gateway Refund if booking was PAID
    let refundResult: {
      refundId: string | null;
      status: 'NOT_APPLICABLE' | 'PENDING' | 'PROCESSED' | 'FAILED';
      amount: number;
      failureReason?: string;
    } = {
      refundId: null,
      status: 'NOT_APPLICABLE',
      amount: 0
    };

    if (booking.paymentStatus === 'PAID' && refundAmount > 0) {
      refundResult = await paymentService.refundBookingPayment(
        booking,
        user,
        refundAmount,
        input.notes || reason
      );
    }

    booking.status = 'CANCELLED';
    booking.cancellation = {
      reason,
      notes: input.notes || '',
      cancelledAt: now,
      cancelledBy: user.id,
      refundAmount: refundResult.amount || (refundResult.status === 'PROCESSED' ? refundAmount : 0),
      refundStatus: refundResult.status,
      refundId: refundResult.refundId || undefined,
      refundFailureReason: refundResult.failureReason,
      refundProcessedAt: refundResult.status === 'PROCESSED' ? now : undefined
    };

    if (refundResult.status === 'PROCESSED') {
      const isFull = (booking.cancellation.refundAmount || 0) >= (booking.pricingSnapshot?.total || 0);
      booking.paymentStatus = isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    }

    booking.statusHistory.push({
      from: previousStatus,
      to: 'CANCELLED',
      changedAt: now,
      changedBy: user.role === 'CUSTOMER' ? 'CUSTOMER' : user.id,
      reason: input.notes || `Cancelled by ${user.role.toLowerCase()}`
    });

    // Release underlying inventory reservation
    if (booking.reservationId) {
      await availabilityService.releaseReservation(
        booking.reservationId,
        booking.vehicleId,
        booking.userId.toString()
      );
    }

    // Release coupon usage if coupon was used
    const appliedCoupon = (booking.metadata as any)?.couponCode;
    if (appliedCoupon) {
      await CouponModel.updateOne(
        { code: appliedCoupon, usageCount: { $gt: 0 } },
        { $inc: { usageCount: -1 } }
      ).catch(() => {});
    }

    await booking.save();

    // Enqueue transactional booking cancellation notification
    try {
      const recordedRefund = booking.cancellation.refundAmount || 0;
      await notificationService.enqueue({
        type: NotificationType.BOOKING_CANCELLED,
        userId: booking.userId.toString(),
        bookingId: booking._id.toString(),
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
        templateData: {
          customerName: user.name || 'Valued Customer',
          bookingReference: booking.bookingReference,
          cancellationReason: input.notes || reason,
          refundAmount: recordedRefund > 0 ? `₹${recordedRefund.toLocaleString('en-IN')}` : '₹0'
        }
      });
    } catch (notifyErr) {
      console.warn('[SkyBolt Booking] Failed to enqueue cancellation notification:', notifyErr);
    }

    return booking.toDTO();
  }
}

export const bookingService = new BookingService();
export default bookingService;
