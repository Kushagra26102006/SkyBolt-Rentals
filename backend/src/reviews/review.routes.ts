import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { reviewRateLimiter } from '../middleware/rate-limit.middleware.js';
import { reviewController } from './review.controller.js';
import {
  createReviewSchema,
  updateReviewSchema,
  createReportSchema,
  publicReviewQuerySchema,
  reviewIdParamSchema,
  bookingIdParamSchema,
  vehicleIdParamSchema
} from '../validators/review.validator.js';

export const reviewRouter = Router();

// ============================================================================
// Public Vehicle Review Endpoints
// ============================================================================

reviewRouter.get(
  '/vehicles/:vehicleId/reviews',
  optionalAuth,
  validateRequest({ params: vehicleIdParamSchema, query: publicReviewQuerySchema }),
  reviewController.getVehicleReviews
);

reviewRouter.get(
  '/vehicles/:vehicleId/reviews/summary',
  validateRequest({ params: vehicleIdParamSchema }),
  reviewController.getVehicleSummary
);

// ============================================================================
// Customer Booking Review Eligibility & Submission
// ============================================================================

reviewRouter.get(
  '/bookings/:bookingId/review-eligibility',
  requireAuth,
  validateRequest({ params: bookingIdParamSchema }),
  reviewController.checkEligibility
);

reviewRouter.post(
  '/bookings/:bookingId/review',
  requireAuth,
  reviewRateLimiter,
  validateRequest({ params: bookingIdParamSchema, body: createReviewSchema }),
  reviewController.createReview
);

// ============================================================================
// Customer Review Interaction Endpoints
// ============================================================================

reviewRouter.get(
  '/reviews/:id',
  optionalAuth,
  validateRequest({ params: reviewIdParamSchema }),
  reviewController.getReviewById
);

reviewRouter.patch(
  '/reviews/:id',
  requireAuth,
  validateRequest({ params: reviewIdParamSchema, body: updateReviewSchema }),
  reviewController.updateReview
);

reviewRouter.delete(
  '/reviews/:id',
  requireAuth,
  validateRequest({ params: reviewIdParamSchema }),
  reviewController.deleteReview
);

reviewRouter.post(
  '/reviews/:id/helpful',
  requireAuth,
  validateRequest({ params: reviewIdParamSchema }),
  reviewController.toggleHelpful
);

reviewRouter.post(
  '/reviews/:id/report',
  requireAuth,
  reviewRateLimiter,
  validateRequest({ params: reviewIdParamSchema, body: createReportSchema }),
  reviewController.reportReview
);

// ============================================================================
// Customer Personal Review History
// ============================================================================

reviewRouter.get(
  '/me/reviews',
  requireAuth,
  validateRequest({ query: publicReviewQuerySchema }),
  reviewController.getMyReviews
);

export default reviewRouter;
