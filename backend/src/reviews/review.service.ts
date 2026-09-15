import mongoose, { Types } from 'mongoose';
import { reviewRepository } from './review.repository.js';
import { reviewEligibilityService } from './review-eligibility.service.js';
import { VehicleModel } from '../models/vehicle.model.js';
import { auditService } from '../services/audit.service.js';
import { cacheService } from '../services/cache.service.js';
import { cacheKeys } from '../utils/cache-keys.js';
import { ApiError } from '../utils/api-error.js';
import { AuthenticatedUser } from '../types/auth.types.js';
import {
  ReviewStatus,
  ReviewVerificationStatus,
  ReviewModerationStatus,
  ReportStatus,
  CreateReviewInput,
  UpdateReviewInput,
  CreateReportInput,
  ModerateReviewInput,
  ResolveReportInput,
  ReviewQueryOptions,
  ReviewDTO,
  AdminReviewDTO,
  ReviewReportDTO,
  VehicleReviewSummaryDTO,
  ReviewEligibilityResult
} from './review.types.js';

export const REVIEW_EDIT_WINDOW_DAYS = 30;
export const REVIEW_EDIT_WINDOW_MS = REVIEW_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Strips HTML tags and script injections, normalizing text for plain storage.
 */
export function sanitizePlainText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove <script> tags and content
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')   // Remove <style> tags and content
    .replace(/<[^>]+>/g, '')                                            // Strip any other HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export class ReviewService {
  /**
   * Resolves vehicle ID whether supplied as a 24-character ObjectId or unique vehicleCode.
   */
  private async resolveVehicleId(vehicleIdOrCode: string): Promise<string> {
    if (mongoose.isValidObjectId(vehicleIdOrCode)) {
      return vehicleIdOrCode;
    }
    const vehicle = await VehicleModel.findOne({ vehicleCode: vehicleIdOrCode }).exec();
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${vehicleIdOrCode}" not found.`);
    }
    return vehicle.id || String(vehicle._id);
  }

  /**
   * Synchronizes authoritative review aggregation stats back into VehicleModel document.
   */
  public async syncVehicleRatingAggregate(vehicleId: string): Promise<VehicleReviewSummaryDTO> {
    const summary = await reviewRepository.aggregateVehicleReviewSummary(vehicleId);

    await VehicleModel.findByIdAndUpdate(vehicleId, {
      $set: {
        'rating.average': summary.averageRating,
        'rating.count': summary.totalReviews
      }
    }).exec();

    // Invalidate cached review summary and vehicle details
    await cacheService.del([
      cacheKeys.reviewSummary(vehicleId),
      cacheKeys.vehicle(vehicleId)
    ]);
    await cacheService.delByPattern(cacheKeys.patterns.vehicleReviews(vehicleId));

    return summary;
  }

  /**
   * Pre-flight eligibility query for customer.
   */
  public async checkEligibility(
    userId: string,
    bookingIdOrRef: string
  ): Promise<ReviewEligibilityResult> {
    return await reviewEligibilityService.checkEligibility(userId, bookingIdOrRef);
  }

  /**
   * Submits a verified customer review.
   * Derives vehicleId and verification status authoritatively from completed booking.
   */
  public async createReview(
    userId: string,
    bookingIdOrRef: string,
    input: CreateReviewInput,
    userContext?: AuthenticatedUser
  ): Promise<ReviewDTO> {
    // 1. Authoritative Eligibility Verification
    const { booking, vehicleId } = await reviewEligibilityService.assertEligible(
      userId,
      bookingIdOrRef
    );

    // 2. Sanitize user inputs to prevent XSS / malicious injection
    const cleanTitle = sanitizePlainText(input.title);
    const cleanComment = sanitizePlainText(input.comment);

    if (cleanTitle.length < 3) {
      throw new ApiError(422, 'INVALID_REVIEW_CONTENT', 'Review title must be at least 3 characters.');
    }
    if (cleanComment.length < 10) {
      throw new ApiError(422, 'INVALID_REVIEW_CONTENT', 'Review comment must be at least 10 characters.');
    }

    // 3. Persist review record with unique compound constraint
    let reviewDoc;
    try {
      reviewDoc = await reviewRepository.createReview({
        userId: new Types.ObjectId(userId),
        bookingId: booking._id,
        vehicleId: new Types.ObjectId(vehicleId),
        rating: input.rating,
        title: cleanTitle,
        comment: cleanComment,
        status: ReviewStatus.PUBLISHED,
        verificationStatus: ReviewVerificationStatus.VERIFIED,
        moderationStatus: ReviewModerationStatus.APPROVED,
        helpfulCount: 0,
        reportedCount: 0,
        publishedAt: new Date()
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ApiError(
          409,
          'REVIEW_ALREADY_EXISTS',
          'A review has already been submitted for this booking.'
        );
      }
      throw err;
    }

    // 4. Update authoritative vehicle rating aggregate
    await this.syncVehicleRatingAggregate(vehicleId);

    const author = {
      id: userId,
      name: userContext?.name || 'Verified Customer',
      avatar: userContext?.avatar
    };

    return reviewDoc.toSafeDTO(author, false);
  }

  /**
   * Public: Retrieve paginated published reviews for a vehicle.
   */
  public async getPublicVehicleReviews(
    vehicleIdOrCode: string,
    options: ReviewQueryOptions = {},
    currentUserId?: string
  ): Promise<{
    reviews: ReviewDTO[];
    total: number;
    page: number;
    limit: number;
    summary: VehicleReviewSummaryDTO;
  }> {
    const vehicleId = await this.resolveVehicleId(vehicleIdOrCode);

    const [reviewsResult, summary] = await Promise.all([
      reviewRepository.findPublicVehicleReviews(vehicleId, options, currentUserId),
      cacheService.getOrSet(
        cacheKeys.reviewSummary(vehicleId),
        () => reviewRepository.aggregateVehicleReviewSummary(vehicleId),
        120 // 2 minutes TTL
      )
    ]);

    return {
      ...reviewsResult,
      summary
    };
  }

  /**
   * Public: Retrieve vehicle review summary metrics.
   */
  public async getVehicleReviewSummary(vehicleIdOrCode: string): Promise<VehicleReviewSummaryDTO> {
    const vehicleId = await this.resolveVehicleId(vehicleIdOrCode);
    return await cacheService.getOrSet(
      cacheKeys.reviewSummary(vehicleId),
      () => reviewRepository.aggregateVehicleReviewSummary(vehicleId),
      120
    );
  }

  /**
   * Public: Retrieve single review by ID.
   */
  public async getReviewById(id: string, currentUserId?: string): Promise<ReviewDTO> {
    const review = await reviewRepository.findReviewById(id);
    if (!review || review.isDeleted || review.status !== ReviewStatus.PUBLISHED) {
      throw new ApiError(404, 'REVIEW_NOT_FOUND', 'Review not found or not published.');
    }

    let userHasVoted = false;
    if (currentUserId) {
      userHasVoted = await reviewRepository.hasUserVotedHelpful(id, currentUserId);
    }

    const userRef = review.userId as any;
    const author = {
      id: userRef?._id ? userRef._id.toString() : String(review.userId),
      name: userRef?.name || 'Verified Customer',
      avatar: userRef?.avatar
    };

    return review.toSafeDTO(author, userHasVoted);
  }

  /**
   * Customer: Edit an existing review within the 30-day edit window.
   */
  public async updateReview(
    reviewId: string,
    userId: string,
    input: UpdateReviewInput,
    userContext?: AuthenticatedUser
  ): Promise<ReviewDTO> {
    const review = await reviewRepository.findReviewById(reviewId);
    if (!review || review.isDeleted) {
      throw new ApiError(404, 'REVIEW_NOT_FOUND', 'Review not found.');
    }

    // Ownership enforcement
    const authorId = (review.userId as any)?._id ? (review.userId as any)._id.toString() : review.userId.toString();
    if (authorId !== userId) {
      throw new ApiError(403, 'UNAUTHORIZED_REVIEW_ACTION', 'You can only edit your own reviews.');
    }

    // Edit window check
    const publishedTime = review.publishedAt ? review.publishedAt.getTime() : review.createdAt.getTime();
    if (Date.now() - publishedTime > REVIEW_EDIT_WINDOW_MS) {
      throw new ApiError(
        400,
        'REVIEW_EDIT_WINDOW_EXPIRED',
        `Reviews can only be edited within ${REVIEW_EDIT_WINDOW_DAYS} days of submission.`
      );
    }

    const updatePayload: { rating?: number; title?: string; comment?: string; editedAt: Date } = {
      editedAt: new Date()
    };

    if (input.rating !== undefined) {
      updatePayload.rating = input.rating;
    }

    if (input.title !== undefined) {
      const cleanTitle = sanitizePlainText(input.title);
      if (cleanTitle.length < 3) {
        throw new ApiError(422, 'INVALID_REVIEW_CONTENT', 'Review title must be at least 3 characters.');
      }
      updatePayload.title = cleanTitle;
    }

    if (input.comment !== undefined) {
      const cleanComment = sanitizePlainText(input.comment);
      if (cleanComment.length < 10) {
        throw new ApiError(422, 'INVALID_REVIEW_CONTENT', 'Review comment must be at least 10 characters.');
      }
      updatePayload.comment = cleanComment;
    }

    const updated = await reviewRepository.updateReview(reviewId, updatePayload);
    if (!updated) {
      throw new ApiError(500, 'REVIEW_UPDATE_FAILED', 'Failed to update review.');
    }

    // Recalculate aggregates if rating changed
    if (input.rating !== undefined && input.rating !== review.rating) {
      await this.syncVehicleRatingAggregate(String(review.vehicleId));
    }

    const author = {
      id: userId,
      name: userContext?.name || 'Verified Customer',
      avatar: userContext?.avatar
    };

    return updated.toSafeDTO(author, false);
  }

  /**
   * Customer: Soft-delete own review.
   */
  public async deleteReview(reviewId: string, userId: string): Promise<void> {
    const review = await reviewRepository.findReviewById(reviewId);
    if (!review || review.isDeleted) {
      throw new ApiError(404, 'REVIEW_NOT_FOUND', 'Review not found.');
    }

    const authorId = (review.userId as any)?._id ? (review.userId as any)._id.toString() : review.userId.toString();
    if (authorId !== userId) {
      throw new ApiError(403, 'UNAUTHORIZED_REVIEW_ACTION', 'You can only delete your own reviews.');
    }

    await reviewRepository.softDeleteReview(reviewId);

    // Recalculate aggregates
    await this.syncVehicleRatingAggregate(String(review.vehicleId));
  }

  /**
   * Customer: Toggle helpful vote.
   */
  public async toggleHelpfulVote(
    reviewId: string,
    userId: string
  ): Promise<{ voted: boolean; helpfulCount: number }> {
    const review = await reviewRepository.findReviewById(reviewId);
    if (!review || review.isDeleted || review.status !== ReviewStatus.PUBLISHED) {
      throw new ApiError(404, 'REVIEW_NOT_FOUND', 'Review not found or not published.');
    }

    const hasVoted = await reviewRepository.hasUserVotedHelpful(reviewId, userId);
    if (hasVoted) {
      return await reviewRepository.removeHelpfulVote(reviewId, userId);
    } else {
      return await reviewRepository.addHelpfulVote(reviewId, userId);
    }
  }

  /**
   * Customer: Report review for abuse or policy violation.
   */
  public async reportReview(
    reviewId: string,
    reportedBy: string,
    input: CreateReportInput
  ): Promise<ReviewReportDTO> {
    const review = await reviewRepository.findReviewById(reviewId);
    if (!review || review.isDeleted) {
      throw new ApiError(404, 'REVIEW_NOT_FOUND', 'Review not found.');
    }

    const cleanDescription = input.description ? sanitizePlainText(input.description) : '';

    try {
      const report = await reviewRepository.createReport({
        reviewId,
        reportedBy,
        reason: input.reason,
        description: cleanDescription
      });

      return report.toDTO();
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ApiError(
          409,
          'REVIEW_ALREADY_REPORTED',
          'You have already submitted a report for this review.'
        );
      }
      throw err;
    }
  }

  /**
   * Customer: Get list of personal reviews.
   */
  public async getCustomerReviews(
    userId: string,
    options: ReviewQueryOptions = {}
  ): Promise<{ reviews: ReviewDTO[]; total: number; page: number; limit: number }> {
    return await reviewRepository.findCustomerReviews(userId, options);
  }

  /**
   * Admin: List reviews across the platform.
   */
  public async adminListReviews(
    options: ReviewQueryOptions = {}
  ): Promise<{ reviews: AdminReviewDTO[]; total: number; page: number; limit: number }> {
    return await reviewRepository.findAdminReviews(options);
  }

  /**
   * Admin: Moderate review status (publish, hide, reject).
   */
  public async adminModerateReview(
    reviewId: string,
    admin: AuthenticatedUser,
    input: ModerateReviewInput
  ): Promise<AdminReviewDTO> {
    const review = await reviewRepository.findReviewById(reviewId);
    if (!review) {
      throw new ApiError(404, 'REVIEW_NOT_FOUND', 'Review not found.');
    }

    const prevStatus = review.status;
    const cleanReason = input.rejectionReason ? sanitizePlainText(input.rejectionReason) : undefined;

    const updated = await reviewRepository.updateModeration(reviewId, {
      status: input.status,
      moderationStatus: input.moderationStatus || (input.status === ReviewStatus.PUBLISHED ? ReviewModerationStatus.APPROVED : ReviewModerationStatus.REJECTED),
      rejectionReason: cleanReason,
      moderatedBy: admin.id
    });

    if (!updated) {
      throw new ApiError(500, 'MODERATION_FAILED', 'Failed to update review moderation status.');
    }

    // Sync vehicle aggregate rating if status visibility changed
    if (prevStatus !== input.status) {
      await this.syncVehicleRatingAggregate(String(review.vehicleId));
    }

    // Record audit log
    await auditService.log(admin, 'REVIEW_MODERATE', 'REVIEW', reviewId, {
      previousState: { status: prevStatus, moderationStatus: review.moderationStatus },
      newState: { status: input.status, moderationStatus: updated.moderationStatus, rejectionReason: cleanReason }
    });

    return updated.toAdminDTO();
  }

  /**
   * Admin: List abuse reports.
   */
  public async adminListReports(options: {
    page?: number;
    limit?: number;
    status?: ReportStatus;
  } = {}): Promise<{ reports: ReviewReportDTO[]; total: number; page: number; limit: number }> {
    return await reviewRepository.findReports(options);
  }

  /**
   * Admin: Resolve or dismiss abuse report.
   */
  public async adminResolveReport(
    reportId: string,
    admin: AuthenticatedUser,
    input: ResolveReportInput
  ): Promise<ReviewReportDTO> {
    const updated = await reviewRepository.updateReportStatus(reportId, {
      status: input.status,
      resolvedBy: admin.id,
      resolutionNotes: input.resolutionNotes ? sanitizePlainText(input.resolutionNotes) : undefined
    });

    if (!updated) {
      throw new ApiError(404, 'REPORT_NOT_FOUND', 'Abuse report not found.');
    }

    // If requested, hide or reject the problematic review
    const shouldHide = input.hideReview || input.reviewAction === 'HIDE_REVIEW';
    const shouldReject = input.reviewAction === 'REJECT_REVIEW';

    if ((shouldHide || shouldReject) && input.status === ReportStatus.RESOLVED) {
      await this.adminModerateReview(String(updated.reviewId), admin, {
        status: shouldReject ? ReviewStatus.REJECTED : ReviewStatus.HIDDEN,
        moderationStatus: ReviewModerationStatus.FLAGGED,
        rejectionReason: input.resolutionNotes || (shouldReject ? 'Rejected following resolved abuse report' : 'Hidden following resolved abuse report')
      });
    }

    // Record audit log
    await auditService.log(admin, 'REVIEW_REPORT_RESOLVE', 'REVIEW_REPORT', reportId, {
      newState: {
        status: input.status,
        resolutionNotes: input.resolutionNotes,
        hideReview: input.hideReview,
        reviewAction: input.reviewAction
      }
    });

    return updated.toDTO();
  }
}

export const reviewService = new ReviewService();
export default reviewService;
