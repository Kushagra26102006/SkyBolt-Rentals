import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { reviewController } from '../reviews/review.controller.js';
import {
  adminReviewQuerySchema,
  moderateReviewSchema,
  resolveReportSchema,
  reviewIdParamSchema,
  reportIdParamSchema
} from '../validators/review.validator.js';

export const adminReviewRouter = Router();

adminReviewRouter.use(requireAuth);
adminReviewRouter.use(requireRole('ADMIN'));

// List reviews with filters
adminReviewRouter.get(
  '/',
  validateRequest({ query: adminReviewQuerySchema }),
  reviewController.adminListReviews
);

// Moderate review (approve, hide, reject)
adminReviewRouter.patch(
  '/:id/moderate',
  validateRequest({ params: reviewIdParamSchema, body: moderateReviewSchema }),
  reviewController.adminModerateReview
);

// Abuse reports
adminReviewRouter.get(
  '/reports',
  reviewController.adminListReports
);

adminReviewRouter.patch(
  '/reports/:id',
  validateRequest({ params: reportIdParamSchema, body: resolveReportSchema }),
  reviewController.adminResolveReport
);

export default adminReviewRouter;
