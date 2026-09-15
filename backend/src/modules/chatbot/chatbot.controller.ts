import { Request, Response, NextFunction } from 'express';
import { chatbotService } from './chatbot.service.js';

export class ChatbotController {
  /**
   * POST /api/chat & POST /api/v1/chat
   * Process a conversational turn with SkyBolt AI
   */
  public async sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { message, conversationId, sessionId } = req.body;

      const result = await chatbotService.processMessage({
        message,
        conversationId,
        sessionId,
        user: req.user,
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/chat/history/:conversationId
   * Retrieve conversational turn history
   */
  public async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const conversationId = req.params.conversationId as string;
      const sessionId = req.headers['x-session-id'] as string | undefined;

      const history = await chatbotService.getHistory(conversationId, req.user, sessionId);

      res.status(200).json({
        success: true,
        conversationId,
        messages: history
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/chat/history/:conversationId
   * Clear conversation history
   */
  public async clearHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const conversationId = req.params.conversationId as string;
      const sessionId = req.headers['x-session-id'] as string | undefined;

      await chatbotService.clearHistory(conversationId, req.user, sessionId);

      res.status(200).json({
        success: true,
        message: 'Conversation history cleared successfully.'
      });
    } catch (err) {
      next(err);
    }
  }
}

export const chatbotController = new ChatbotController();
