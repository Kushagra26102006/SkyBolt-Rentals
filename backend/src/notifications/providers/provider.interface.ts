export interface ProviderSendResult {
  success: boolean;
  providerMessageId?: string;
  isTransient: boolean;
  errorCode?: string;
  errorReason?: string;
  metadata?: Record<string, any>;
}

export interface EmailSendOptions {
  recipient: string;
  subject: string;
  html: string;
  text: string;
  notificationId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export interface SmsSendOptions {
  recipient: string; // E.164 formatted string
  message: string;
  notificationId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export interface IEmailProvider {
  readonly name: string;
  send(options: EmailSendOptions): Promise<ProviderSendResult>;
}

export interface ISmsProvider {
  readonly name: string;
  send(options: SmsSendOptions): Promise<ProviderSendResult>;
}

/**
 * Classifies an error as transient (retryable) vs. permanent (non-retryable).
 */
export function classifyError(statusCode?: number, errorCode?: string, rawError?: any): {
  isTransient: boolean;
  code: string;
  reason: string;
} {
  const code = errorCode || (rawError?.code as string) || (statusCode ? `HTTP_${statusCode}` : 'UNKNOWN_ERROR');
  const reason = rawError?.message || (statusCode ? `HTTP Status ${statusCode}` : 'Unknown provider error');

  if (statusCode) {
    // 429 Too Many Requests or 5xx Server Errors are transient
    if (statusCode === 429 || (statusCode >= 500 && statusCode < 600)) {
      return { isTransient: true, code, reason };
    }
    // 4xx client errors (400 Bad Request, 401 Unauthorized, 404 Not Found, 422 Unprocessable) are permanent
    if (statusCode >= 400 && statusCode < 500) {
      return { isTransient: false, code, reason };
    }
  }

  // Network level errors
  const transientNetworkCodes = [
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'RATE_LIMITED',
    'TIMEOUT',
    'NETWORK_ERROR'
  ];

  if (transientNetworkCodes.includes(code.toUpperCase())) {
    return { isTransient: true, code, reason };
  }

  // Known permanent codes
  const permanentCodes = [
    'INVALID_RECIPIENT',
    'INVALID_PHONE',
    'INVALID_EMAIL',
    'AUTHENTICATION_FAILED',
    'TEMPLATE_ERROR',
    'UNSUBSCRIBED',
    'BLACKLISTED'
  ];

  if (permanentCodes.includes(code.toUpperCase())) {
    return { isTransient: false, code, reason };
  }

  // Default to transient for unexpected network/IO errors unless explicitly known to be permanent
  return { isTransient: true, code, reason };
}
