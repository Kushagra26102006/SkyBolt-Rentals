import {
  IChatMessage,
  IChatToolDefinition,
  AIProviderOptions,
  AIProviderResponse
} from '../chatbot.types.js';
import { config } from '../../../config/env.config.js';
import { mockAIProvider } from './mock.provider.js';
import { openAIProvider } from './openai.provider.js';
import { geminiChatProvider } from './gemini.provider.js';

export interface IAIProvider {
  name: string;
  chat(
    messages: IChatMessage[],
    tools?: IChatToolDefinition[],
    options?: AIProviderOptions
  ): Promise<AIProviderResponse>;
}

export function getAIProvider(overrideName?: string): IAIProvider {
  const providerName = overrideName || config.chatbot.provider;

  if (providerName === 'openai' && config.chatbot.openaiApiKey) {
    return openAIProvider;
  }

  if (providerName === 'gemini' && (config.recommendations.geminiApiKey || process.env.GEMINI_API_KEY)) {
    return geminiChatProvider;
  }

  return mockAIProvider;
}
