import { Request } from 'express';

/**
 * Standardized Success Envelope
 */
export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

/**
 * Standardized Error Envelope
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Extended Express Request with correlation ID
 */
export interface RequestWithId extends Request {
  id?: string;
  startTime?: number;
}
