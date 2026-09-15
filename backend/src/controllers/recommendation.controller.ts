import { Request, Response, NextFunction } from 'express';
import { recommendationService } from '../services/recommendation.service.js';
import { sendSuccess } from '../utils/api-response.js';

export class RecommendationController {
  /**
   * POST /api/v1/recommendations
   * Core recommendation endpoint
   */
  public getRecommendations = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const result = await recommendationService.getRecommendations(req.body, userId);
      sendSuccess(res, result, 200, 'Recommendations generated successfully');
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/recommendations/chat
   * Conversational recommendation inquiry
   */
  public chat = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const { message, pickupAt, returnAt, passengers, budget } = req.body;

      const result = await recommendationService.getRecommendations(
        {
          query: message,
          pickupAt,
          returnAt,
          passengers,
          budget
        },
        userId
      );

      let reply = 'Here are our top recommended vehicles matching your travel plans:';
      if (result.recommendations.length === 0) {
        reply = 'We could not find vehicles matching all those specific criteria. Please consider adjusting passenger count, budget, or dates.';
      } else if (result.recommendations[0]?.reason) {
        reply = `I found ${result.recommendations.length} great option${result.recommendations.length > 1 ? 's' : ''} for you! Our top pick: ${result.recommendations[0].vehicle.brand} ${result.recommendations[0].vehicle.model} (${result.recommendations[0].reason}).`;
      }

      sendSuccess(
        res,
        {
          reply,
          ...result
        },
        200,
        'Chat recommendation processed successfully'
      );
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/recommendations/preferences
   */
  public getPreferences = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user.id;
      const preferences = await recommendationService.getUserPreferences(userId);
      sendSuccess(res, preferences, 200, 'User preferences retrieved');
    } catch (err) {
      next(err);
    }
  };

  /**
   * PUT /api/v1/recommendations/preferences
   */
  public savePreferences = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user.id;
      const saved = await recommendationService.saveUserPreferences(userId, req.body);
      sendSuccess(res, saved, 200, 'User preferences updated successfully');
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/v1/recommendations/preferences
   * Privacy right to clear personalization data
   */
  public clearPreferences = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user.id;
      await recommendationService.clearUserPreferences(userId);
      sendSuccess(res, null, 200, 'User preferences cleared successfully');
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/recommendations/events
   * Privacy-conscious behavioral telemetry
   */
  public recordEvent = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      await recommendationService.recordEvent({
        ...req.body,
        userId
      });
      sendSuccess(res, null, 200, 'Event recorded successfully');
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/recommendations/feedback
   */
  public recordFeedback = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      await recommendationService.recordFeedback({
        ...req.body,
        userId
      });
      sendSuccess(res, null, 200, 'Feedback recorded successfully');
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/admin/recommendations/metrics
   */
  public getMetrics = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const metrics = await recommendationService.getOperationalMetrics();
      sendSuccess(res, metrics, 200, 'Recommendation operational metrics retrieved');
    } catch (err) {
      next(err);
    }
  };
}

export const recommendationController = new RecommendationController();
export default recommendationController;
