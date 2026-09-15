/**
 * SkyBolt Rentals — Provider-Agnostic Error Tracking Boundary
 * 
 * Provides a standardized abstraction for capturing backend exceptions, worker errors,
 * unhandled promise rejections, and critical payment/webhook failures without leaking
 * sensitive user credentials, payment details, or PII.
 * 
 * Compatible with Sentry, Datadog, New Relic, AWS CloudWatch, or custom sinks.
 */

import { config } from '../config/env.config.js';

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  component?: 'API' | 'WORKER' | 'PAYMENT' | 'DATABASE' | 'QUEUE' | 'NOTIFICATION' | 'AI';
  extra?: Record<string, unknown>;
}

export interface TrackedErrorEvent {
  id: string;
  timestamp: string;
  environment: 'development' | 'test' | 'production';
  errorName: string;
  message: string;
  stack?: string;
  context: ErrorContext;
}

// In-memory circular buffer for recent production errors (accessible to observability probes)
const RECENT_ERROR_CAPACITY = 50;
const recentErrors: TrackedErrorEvent[] = [];

/**
 * Strips sensitive keys (passwords, tokens, secrets, card data) from error metadata
 */
function sanitizeContext(ctx: ErrorContext): ErrorContext {
  const sensitiveKeys = ['password', 'token', 'jwt', 'secret', 'key', 'cookie', 'authorization', 'cvv', 'card'];
  const sanitizedExtra: Record<string, unknown> = {};

  if (ctx.extra) {
    for (const [key, value] of Object.entries(ctx.extra)) {
      const lower = key.toLowerCase();
      if (sensitiveKeys.some((s) => lower.includes(s))) {
        sanitizedExtra[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        try {
          sanitizedExtra[key] = JSON.parse(JSON.stringify(value));
        } catch {
          sanitizedExtra[key] = '[Unserializable]';
        }
      } else {
        sanitizedExtra[key] = value;
      }
    }
  }

  return {
    ...ctx,
    extra: sanitizedExtra
  };
}

export class ErrorTracker {
  /**
   * Capture an error and forward to monitoring pipelines
   */
  public static captureException(err: Error | unknown, context: ErrorContext = {}): string {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const sanitizedCtx = sanitizeContext(context);

    const event: TrackedErrorEvent = {
      id: errorId,
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv as 'development' | 'test' | 'production',
      errorName: errorObj.name || 'Error',
      message: errorObj.message || 'Unknown error',
      stack: config.isProduction ? undefined : errorObj.stack,
      context: sanitizedCtx
    };

    // Store in internal buffer
    recentErrors.unshift(event);
    if (recentErrors.length > RECENT_ERROR_CAPACITY) {
      recentErrors.pop();
    }

    // Structured log output
    if (!config.isTest) {
      console.error(
        `[SkyBolt ErrorTracker][${event.id}] [${sanitizedCtx.component || 'GENERAL'}] ${event.errorName}: ${event.message}`,
        JSON.stringify({
          errorId: event.id,
          context: sanitizedCtx
        })
      );
    }

    return errorId;
  }

  /**
   * Get recently captured errors (for operational diagnostics)
   */
  public static getRecentErrors(): ReadonlyArray<TrackedErrorEvent> {
    return Object.freeze([...recentErrors]);
  }

  /**
   * Clear error buffer (for testing/cleanup)
   */
  public static clear(): void {
    recentErrors.length = 0;
  }
}

export default ErrorTracker;
