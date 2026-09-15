import { Router } from 'express';
import { chatbotController } from './chatbot.controller.js';
import { optionalAuth } from '../../middleware/auth.middleware.js';
import { chatbotRateLimiter } from './chatbot.rate-limiter.js';
import { validateRequest } from '../../middleware/validate.middleware.js';
import { chatMessageSchema, conversationParamSchema } from './chatbot.validation.js';

export const chatbotRouter = Router();

/**
 * @route   POST /api/v1/chat
 * @desc    Send a message to SkyBolt AI Assistant
 * @access  Public / Authenticated (Session-aware)
 */
chatbotRouter.post(
  '/',
  optionalAuth,
  chatbotRateLimiter,
  validateRequest({ body: chatMessageSchema }),
  chatbotController.sendMessage
);

/**
 * @route   GET /api/v1/chat/history/:conversationId
 * @desc    Get conversation turn history
 * @access  Public / Authenticated (Protected by ownership/session check)
 */
chatbotRouter.get(
  '/history/:conversationId',
  optionalAuth,
  validateRequest({ params: conversationParamSchema }),
  chatbotController.getHistory
);

/**
 * @route   DELETE /api/v1/chat/history/:conversationId
 * @desc    Clear conversation history
 * @access  Public / Authenticated (Protected by ownership/session check)
 */
chatbotRouter.delete(
  '/history/:conversationId',
  optionalAuth,
  validateRequest({ params: conversationParamSchema }),
  chatbotController.clearHistory
);

export default chatbotRouter;
