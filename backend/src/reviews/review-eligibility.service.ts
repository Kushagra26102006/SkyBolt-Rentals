import mongoose, { Types } from 'mongoose';
import { BookingModel, IBookingDoc } from '../models/booking.model.js';
import { ReviewModel } from '../models/review.model.js';
import { ApiError } from '../utils/api-error.js';
import { ReviewEligibilityResult } from './review.types.js';

export const REVIEW_WINDOW_DAYS = 30;
export const REVIEW_WINDOW_MS = REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export class ReviewEligibilityService {
  /**
   * Resolves the completion date of a booking from statusHistory or returnAt.
   */
  public getBookingCompletionDate(booking: IBookingDoc): Date {
    if (booking.statusHistory && booking.statusHistory.length > 0) {
      // Find the most recent transition to COMPLETED
      for (let i = booking.statusHistory.length - 1; i >= 0; i--) {
        const entry = booking.statusHistory[i];
        if (entry && entry.to === 'COMPLETED' && entry.changedAt) {
          return new Date(entry.changedAt);
        }
      }
    }

    if (booking.returnAt) {
      return new Date(booking.returnAt);
    }

    return booking.updatedAt || new Date();
  }

  /**
   * Non-throwing eligibility check for customer UI display and pre-flight validation.
   */
  public async checkEligibility(
    userId: string,
    bookingIdOrRef: string
  ): Promise<ReviewEligibilityResult> {
    const isObjectId = mongoose.isValidObjectId(bookingIdOrRef);
    const booking = await BookingModel.findOne(
      isObjectId
        ? { $or: [{ _id: new Types.ObjectId(bookingIdOrRef) }, { bookingReference: bookingIdOrRef }] }
        : { bookingReference: bookingIdOrRef }
    ).exec();

    if (!booking || booking.isDeleted) {
      return {
        eligible: false,
        code: 'BOOKING_NOT_FOUND',
        reason: 'Booking not found.'
      };
    }

    // Ownership check
    if (booking.userId.toString() !== userId) {
      return {
        eligible: false,
        code: 'BOOKING_NOT_OWNED',
        reason: 'You can only review bookings made from your own account.'
      };
    }

    // Status check
    if (booking.status !== 'COMPLETED') {
      return {
        eligible: false,
        code: 'BOOKING_NOT_COMPLETED',
        reason: `Rental status is "${booking.status}". Reviews can only be submitted after the rental is completed.`
      };
    }

    // Duplicate check
    const existingReview = await ReviewModel.findOne({
      userId: booking.userId,
      bookingId: booking._id,
      isDeleted: false
    }).exec();

    if (existingReview) {
      return {
        eligible: false,
        code: 'REVIEW_ALREADY_EXISTS',
        reason: 'You have already submitted a review for this booking.',
        existingReviewId: existingReview.id || String(existingReview._id)
      };
    }

    // Review window check
    const completedAt = this.getBookingCompletionDate(booking);
    const now = Date.now();
    if (now - completedAt.getTime() > REVIEW_WINDOW_MS) {
      return {
        eligible: false,
        code: 'REVIEW_WINDOW_EXPIRED',
        reason: `The ${REVIEW_WINDOW_DAYS}-day review window for this rental has expired.`
      };
    }

    return {
      eligible: true,
      bookingId: booking.id || String(booking._id),
      vehicleId: String(booking.vehicleId),
      completedAt: completedAt.toISOString()
    };
  }

  /**
   * Authoritative asserting eligibility check that throws typed ApiErrors.
   * Used by POST /api/v1/bookings/:bookingId/review.
   */
  public async assertEligible(
    userId: string,
    bookingIdOrRef: string
  ): Promise<{
    booking: IBookingDoc;
    vehicleId: string;
    completedAt: Date;
  }> {
    const isObjectId = mongoose.isValidObjectId(bookingIdOrRef);
    const booking = await BookingModel.findOne(
      isObjectId
        ? { $or: [{ _id: new Types.ObjectId(bookingIdOrRef) }, { bookingReference: bookingIdOrRef }] }
        : { bookingReference: bookingIdOrRef }
    ).exec();

    if (!booking || booking.isDeleted) {
      throw new ApiError(404, 'BOOKING_NOT_FOUND', `Booking "${bookingIdOrRef}" not found.`);
    }

    // Strict booking ownership
    if (booking.userId.toString() !== userId) {
      throw new ApiError(
        403,
        'BOOKING_NOT_OWNED',
        'You do not have authorization to review this booking.'
      );
    }

    // Must be COMPLETED
    if (booking.status !== 'COMPLETED') {
      throw new ApiError(
        409,
        'BOOKING_NOT_COMPLETED',
        `Cannot review booking in status "${booking.status}". Rental must be COMPLETED.`
      );
    }

    // Must not have already reviewed
    const existing = await ReviewModel.findOne({
      userId: booking.userId,
      bookingId: booking._id,
      isDeleted: false
    }).exec();

    if (existing) {
      throw new ApiError(
        409,
        'REVIEW_ALREADY_EXISTS',
        'A review has already been submitted for this completed booking.'
      );
    }

    // Review window check
    const completedAt = this.getBookingCompletionDate(booking);
    const now = Date.now();
    if (now - completedAt.getTime() > REVIEW_WINDOW_MS) {
      throw new ApiError(
        400,
        'REVIEW_WINDOW_EXPIRED',
        `The ${REVIEW_WINDOW_DAYS}-day review window for this rental has expired.`
      );
    }

    return {
      booking,
      vehicleId: String(booking.vehicleId),
      completedAt
    };
  }
}

export const reviewEligibilityService = new ReviewEligibilityService();
export default reviewEligibilityService;
