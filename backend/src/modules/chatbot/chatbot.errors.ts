import { ApiError } from '../../utils/api-error.js';

export class ChatbotError extends ApiError {
  constructor(statusCode: number, code: string, message: string, details?: any) {
    super(statusCode, code, message, details);
    this.name = 'ChatbotError';
  }

  public static promptInjection(message = 'Message blocked due to security policies.'): ChatbotError {
    return new ChatbotError(400, 'SECURITY_VIOLATION', message);
  }

  public static conversationNotFound(conversationId: string): ChatbotError {
    return new ChatbotError(404, 'CONVERSATION_NOT_FOUND', `Conversation "${conversationId}" was not found.`);
  }

  public static forbidden(message = 'You do not have permission to access this conversation.'): ChatbotError {
    return new ChatbotError(403, 'FORBIDDEN', message);
  }

  public static providerUnavailable(message = 'AI Assistant is currently unavailable. Please try again later.'): ChatbotError {
    return new ChatbotError(503, 'AI_PROVIDER_UNAVAILABLE', message);
  }

  public static rateLimitExceeded(message = 'Too many chat requests. Please wait a moment.'): ChatbotError {
    return new ChatbotError(429, 'CHAT_RATE_LIMIT_EXCEEDED', message);
  }

  public static toolExecutionError(toolName: string, detail: string): ChatbotError {
    return new ChatbotError(500, 'TOOL_EXECUTION_ERROR', `Failed executing tool "${toolName}": ${detail}`);
  }
}
