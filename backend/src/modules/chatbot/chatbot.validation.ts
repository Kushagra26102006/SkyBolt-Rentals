import { z } from 'zod';
import { config } from '../../config/env.config.js';

export const chatMessageSchema = z.object({
  message: z
    .string({
      required_error: 'Message is required'
    })
    .trim()
    .min(1, 'Message cannot be empty')
    .max(
      config.chatbot.maxMessageLength || 2000,
      `Message exceeds maximum allowed length of ${config.chatbot.maxMessageLength || 2000} characters`
    ),
  conversationId: z
    .string()
    .trim()
    .max(100, 'Invalid conversation ID')
    .optional(),
  sessionId: z
    .string()
    .trim()
    .max(100, 'Invalid session ID')
    .optional()
});

export const conversationParamSchema = z.object({
  conversationId: z
    .string({
      required_error: 'Conversation ID is required'
    })
    .trim()
    .min(1, 'Conversation ID cannot be empty')
    .max(100, 'Conversation ID is too long')
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
