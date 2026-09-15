import { Request, Response, NextFunction } from 'express';
import { reviewService } from './review.service.js';
import { ApiError } from '../utils/api-error.js';

export class ReviewController {
  /**
   * Customer: Check eligibility to review a completed booking.
   */
  public checkEligibility = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) throw ApiError.unauthorized('Authentication required');
      const bookingId = req.params.bookingId!;
      const result = await reviewService.checkEligibility(req.user.id, bookingId);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Customer: Submit a verified customer review for a completed booking.
   */
  public createReview = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) throw ApiError.unauthorized('Authentication required');
      const bookingId = req.params.bookingId!;
      const review = await reviewService.createReview(req.user.id, bookingId, req.body, req.user);
      res.status(201).json({
        success: true,
        message: 'Verified review submitted successfully.',
        data: review
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Public: Query paginated reviews and summary for a vehicle.
   */
  public getVehicleReviews = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const vehicleId = req.params.vehicleId!;
      const result = await reviewService.getPublicVehicleReviews(vehicleId, req.query as any, req.user?.id);
      res.status(200).json({
        success: true,
        data: result.reviews,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit) || 1
        },
        summary: result.summary
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Public: Get review aggregation summary for a vehicle.
   */
  public getVehicleSummary = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const vehicleId = req.params.vehicleId!;
      const summary = await reviewService.getVehicleReviewSummary(vehicleId);
      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Public: Get single review by ID.
   */
  public getReviewById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = req.params.id!;
      const review = await reviewService.getReviewById(id, req.user?.id);
      res.status(200).json({
        success: true,
        data: review
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Customer: Edit own review within 30 days of submission.
   */
  public updateReview = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) throw ApiError.unauthorized('Authentication required');
      const id = req.params.id!;
      const review = await reviewService.updateReview(id, req.user.id, req.body, req.user);
      res.status(200).json({
        success: true,
        message: 'Review updated successfully.',
        data: review
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Customer: Soft-delete own review.
   */
  public deleteReview = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) throw ApiError.unauthorized('Authentication required');
      const id = req.params.id!;
      await reviewService.deleteReview(id, req.user.id);
      res.status(200).json({
        success: true,
        message: 'Review deleted successfully.'
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Customer: Toggle helpful vote on a review.
   */
  public toggleHelpful = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) throw ApiError.unauthorized('Authentication required');
      const id = req.params.id!;
      const result = await reviewService.toggleHelpfulVote(id, req.user.id);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Customer: Report review for abuse or policy violation.
   */
  public reportReview = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) throw ApiError.unauthorized('Authentication required');
      const id = req.params.id!;
      const report = await reviewService.reportReview(id, req.user.id, req.body);
      res.status(201).json({
        success: true,
        message: 'Review reported successfully and queued for moderation.',
        data: report
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Customer: List personal review history.
   */
  public getMyReviews = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) throw ApiError.unauthorized('Authentication required');
      const result = await reviewService.getCustomerReviews(req.user.id, req.query as any);
      res.status(200).json({
        success: true,
        data: result.reviews,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit) || 1
        }
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Admin: List all reviews across the platform.
   */
  public adminListReviews = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await reviewService.adminListReviews(req.query as any);
      res.status(200).json({
        success: true,
        data: result.reviews,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit) || 1
        }
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Admin: Moderate review status.
   */
  public adminModerateReview = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) throw ApiError.unauthorized('Authentication required');
      const id = req.params.id!;
      const updated = await reviewService.adminModerateReview(id, req.user, req.body);
      res.status(200).json({
        success: true,
        message: 'Review moderation updated successfully.',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Admin: List abuse reports.
   */
  public adminListReports = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await reviewService.adminListReports(req.query as any);
      res.status(200).json({
        success: true,
        data: result.reports,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit) || 1
        }
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Admin: Resolve or dismiss abuse report.
   */
  public adminResolveReport = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) throw ApiError.unauthorized('Authentication required');
      const id = req.params.id!;
      const report = await reviewService.adminResolveReport(id, req.user, req.body);
      res.status(200).json({
        success: true,
        message: 'Report resolved successfully.',
        data: report
      });
    } catch (err) {
      next(err);
    }
  };
}

export const reviewController = new ReviewController();
export default reviewController;
