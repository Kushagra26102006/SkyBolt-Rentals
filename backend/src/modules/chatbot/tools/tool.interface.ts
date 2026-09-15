import {
  IChatToolDefinition,
  ChatbotToolContext,
  ChatbotToolResult
} from '../chatbot.types.js';

export interface IChatbotTool {
  name: string;
  description: string;
  definition: IChatToolDefinition;
  execute(params: any, context: ChatbotToolContext): Promise<ChatbotToolResult>;
}
