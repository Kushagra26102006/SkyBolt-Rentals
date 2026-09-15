import { IAIProvider } from './ai.provider.js';
import { config } from '../../../config/env.config.js';
import {
  IChatMessage,
  IChatToolDefinition,
  AIProviderOptions,
  AIProviderResponse,
  IChatToolCall
} from '../chatbot.types.js';
import { ChatbotError } from '../chatbot.errors.js';

export class OpenAIProvider implements IAIProvider {
  public name = 'openai';
  private apiKey: string;
  private model: string;
  private timeoutMs: number;

  constructor(apiKey?: string, model?: string, timeoutMs?: number) {
    this.apiKey = apiKey || config.chatbot.openaiApiKey || '';
    this.model = model || config.chatbot.openaiModel || 'gpt-4o-mini';
    this.timeoutMs = timeoutMs || config.chatbot.requestTimeoutMs || 15000;
  }

  public async chat(
    messages: IChatMessage[],
    tools?: IChatToolDefinition[],
    options?: AIProviderOptions
  ): Promise<AIProviderResponse> {
    if (!this.apiKey) {
      throw ChatbotError.providerUnavailable('OpenAI API key is not configured.');
    }

    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs || this.timeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Format messages for OpenAI Chat Completion API
    const formattedMessages = messages.map((m) => {
      const base: any = { role: m.role, content: m.content || '' };
      if (m.role === 'tool' && m.toolCallId) {
        base.tool_call_id = m.toolCallId;
      }
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        base.tool_calls = m.toolCalls;
      }
      return base;
    });

    const payload: any = {
      model: this.model,
      messages: formattedMessages,
      temperature: options?.temperature ?? config.chatbot.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? config.chatbot.maxTokens ?? 800
    };

    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errMessage = `OpenAI API returned status ${response.status}`;
        try {
          const errBody: any = await response.json();
          if (errBody?.error?.message) {
            errMessage = errBody.error.message;
          }
        } catch {
          // ignore parsing error
        }

        if (response.status === 401) {
          throw ChatbotError.providerUnavailable('OpenAI API authentication failed.');
        }
        if (response.status === 429) {
          throw ChatbotError.providerUnavailable('AI service rate limit exceeded. Please try again shortly.');
        }

        throw ChatbotError.providerUnavailable(errMessage);
      }

      const data: any = await response.json();
      const choice = data.choices?.[0];
      const messageObj = choice?.message;

      const toolCalls: IChatToolCall[] = (messageObj?.tool_calls || []).map((tc: any) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments
        }
      }));

      return {
        message: messageObj?.content || '',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
          totalTokens: data.usage?.total_tokens
        },
        finishReason: choice?.finish_reason
      };
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        throw ChatbotError.providerUnavailable(`AI request timed out after ${timeoutMs}ms.`);
      }

      if (err instanceof ChatbotError) {
        throw err;
      }

      throw ChatbotError.providerUnavailable(err.message || 'Failed connecting to AI service.');
    }
  }
}

export const openAIProvider = new OpenAIProvider();
