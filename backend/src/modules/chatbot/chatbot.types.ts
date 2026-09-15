import { AuthenticatedUser } from '../../types/auth.types.js';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface IChatToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
  thoughtSignature?: string;
}

export interface IChatToolResult {
  toolCallId: string;
  name: string;
  result: any;
}

export interface IChatMessage {
  role: ChatRole;
  content: string;
  toolCalls?: IChatToolCall[];
  toolCallId?: string;
  name?: string;
  timestamp?: Date;
}

export interface IChatToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export interface ChatbotToolContext {
  user?: AuthenticatedUser;
  sessionId: string;
  conversationId: string;
  ip?: string;
}

export interface ChatbotToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  requiresConfirmation?: boolean;
  promptUser?: string;
}

export interface ChatbotResponseDTO {
  success: boolean;
  conversationId: string;
  message: string;
  data?: {
    type: 'text' | 'vehicles' | 'quote' | 'booking' | 'locations' | 'coupons' | 'cancellation' | 'error';
    vehicles?: any[];
    quote?: any;
    booking?: any;
    locations?: any[];
    coupons?: any[];
    suggestions?: string[];
    [key: string]: any;
  };
}

export interface AIProviderOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface AIProviderResponse {
  message: string;
  toolCalls?: IChatToolCall[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  finishReason?: string;
}
