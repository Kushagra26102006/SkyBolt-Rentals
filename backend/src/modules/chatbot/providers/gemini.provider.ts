import crypto from 'crypto';
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

function sanitizeSchemaForGemini(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }
  if (Array.isArray(schema)) {
    return schema.map(sanitizeSchemaForGemini);
  }

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties' || key === '$schema') {
      continue;
    }
    if (key === 'properties' && value && typeof value === 'object') {
      clean.properties = {};
      for (const [propKey, propVal] of Object.entries(value as Record<string, any>)) {
        clean.properties[propKey] = sanitizeSchemaForGemini(propVal);
      }
    } else if (key === 'items' && value) {
      clean.items = sanitizeSchemaForGemini(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export class GeminiChatProvider implements IAIProvider {
  public name = 'gemini';
  private apiKey: string;
  private model: string;
  private timeoutMs: number;

  constructor(apiKey?: string, model?: string, timeoutMs?: number) {
    this.apiKey = apiKey || config.recommendations.geminiApiKey || process.env.GEMINI_API_KEY || '';
    const configuredModel = model || config.recommendations.model || 'gemini-3.5-flash-lite';
    // Canonicalize deprecated/old model names to the current supported model
    const deprecatedModels = [
      'gemini-1.5-flash',
      'gemini-2.0-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-flash-latest',
    ];
    this.model = deprecatedModels.includes(configuredModel) ? 'gemini-3.5-flash-lite' : configuredModel;
    this.timeoutMs = timeoutMs || config.chatbot.requestTimeoutMs || 15000;
  }

  public async chat(
    messages: IChatMessage[],
    tools?: IChatToolDefinition[],
    options?: AIProviderOptions
  ): Promise<AIProviderResponse> {
    if (!this.apiKey) {
      throw ChatbotError.providerUnavailable('Gemini API key is not configured.');
    }

    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs || this.timeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Separate system instruction and conversational contents
    let systemInstructionText = '';
    const rawContents: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstructionText += (systemInstructionText ? '\n' : '') + msg.content;
      } else if (msg.role === 'user') {
        rawContents.push({
          role: 'user',
          parts: [{ text: msg.content || '' }]
        });
      } else if (msg.role === 'assistant') {
        const parts: any[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            let parsedArgs = {};
            try {
              parsedArgs = JSON.parse(tc.function.arguments || '{}');
            } catch {
              parsedArgs = {};
            }
            const fcPart: any = {
              functionCall: {
                name: tc.function.name,
                args: parsedArgs
              }
            };
            if (tc.thoughtSignature) {
              fcPart.thoughtSignature = tc.thoughtSignature;
            }
            parts.push(fcPart);
          }
        }
        if (parts.length > 0) {
          rawContents.push({
            role: 'model',
            parts
          });
        }
      } else if (msg.role === 'tool') {
        let toolResponseObj: any;
        try {
          toolResponseObj = JSON.parse(msg.content);
        } catch {
          toolResponseObj = { output: msg.content };
        }
        rawContents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: msg.name || 'tool',
                response:
                  typeof toolResponseObj === 'object' && toolResponseObj !== null
                    ? toolResponseObj
                    : { output: toolResponseObj }
              }
            }
          ]
        });
      }
    }

    // Merge consecutive 'user' turns containing functionResponse parts into a single turn
    const contents: any[] = [];
    for (const entry of rawContents) {
      const lastEntry = contents[contents.length - 1];
      const isFunctionResponse = entry.parts.some((p: any) => p.functionResponse);
      const lastHasFunctionResponse = lastEntry && lastEntry.parts.some((p: any) => p.functionResponse);
      if (lastEntry && lastEntry.role === 'user' && entry.role === 'user' && (isFunctionResponse || lastHasFunctionResponse)) {
        lastEntry.parts.push(...entry.parts);
      } else {
        contents.push(entry);
      }
    }

    const payload: any = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? config.chatbot.temperature ?? 0.2,
        maxOutputTokens: options?.maxTokens ?? config.chatbot.maxTokens ?? 800
      }
    };

    if (systemInstructionText) {
      payload.systemInstruction = {
        parts: [{ text: systemInstructionText }]
      };
    }

    if (tools && tools.length > 0) {
      payload.tools = [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.function.name,
            description: t.function.description,
            parameters: sanitizeSchemaForGemini(t.function.parameters)
          }))
        }
      ];
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errMessage = `Gemini API returned status ${response.status}`;
        try {
          const errBody: any = await response.json();
          if (errBody?.error?.message) {
            errMessage = errBody.error.message;
          }
        } catch {
          // ignore parse error
        }

        if (response.status === 401 || response.status === 403) {
          throw ChatbotError.providerUnavailable('Gemini API authentication failed.');
        }
        if (response.status === 429) {
          throw ChatbotError.providerUnavailable('AI service rate limit exceeded. Please try again shortly.');
        }

        throw ChatbotError.providerUnavailable(errMessage);
      }

      const data: any = await response.json();
      const candidate = data.candidates?.[0];
      const content = candidate?.content;
      const parts = content?.parts || [];

      let responseText = '';
      const toolCalls: IChatToolCall[] = [];

      for (const part of parts) {
        if (part.text) {
          responseText += part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            id: `call_${crypto.randomUUID().slice(0, 8)}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {})
            },
            thoughtSignature: part.thoughtSignature
          });
        }
      }

      return {
        message: responseText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount,
          completionTokens: data.usageMetadata?.candidatesTokenCount,
          totalTokens: data.usageMetadata?.totalTokenCount
        },
        finishReason: candidate?.finishReason
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

export const geminiChatProvider = new GeminiChatProvider();
