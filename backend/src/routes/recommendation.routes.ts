import { Router } from 'express';
import { recommendationController } from '../controllers/recommendation.controller.js';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { recommendationRateLimiter } from '../middleware/rate-limit.middleware.js';
import {
  recommendationQuerySchema,
  recommendationChatBodySchema,
  userPreferencesBodySchema,
  recommendationEventBodySchema,
  recommendationFeedbackBodySchema
} from '../validators/recommendation.validator.js';

const recommendationRouter = Router();

/**
 * POST /api/v1/recommendations
 * Core AI/Hybrid vehicle recommendation endpoint
 */
recommendationRouter.post(
  '/',
  recommendationRateLimiter,
  optionalAuth,
  validateRequest({ body: recommendationQuerySchema }),
  recommendationController.getRecommendations
);

/**
 * POST /api/v1/recommendations/chat
 * Conversational vehicle inquiry assistant
 */
recommendationRouter.post(
  '/chat',
  recommendationRateLimiter,
  optionalAuth,
  validateRequest({ body: recommendationChatBodySchema }),
  recommendationController.chat
);

/**
 * Customer Personalized Preference Management
 */
recommendationRouter.get(
  '/preferences',
  requireAuth,
  recommendationController.getPreferences
);

recommendationRouter.put(
  '/preferences',
  requireAuth,
  validateRequest({ body: userPreferencesBodySchema }),
  recommendationController.savePreferences
);

recommendationRouter.delete(
  '/preferences',
  requireAuth,
  recommendationController.clearPreferences
);

/**
 * Behavioral Telemetry & Feedback
 */
recommendationRouter.post(
  '/events',
  optionalAuth,
  validateRequest({ body: recommendationEventBodySchema }),
  recommendationController.recordEvent
);

recommendationRouter.post(
  '/feedback',
  optionalAuth,
  validateRequest({ body: recommendationFeedbackBodySchema }),
  recommendationController.recordFeedback
);

export default recommendationRouter;
