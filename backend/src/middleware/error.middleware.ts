import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/api-error.js';
import { ApiErrorResponse } from '../types/api.types.js';
import { config } from '../config/env.config.js';
import { ErrorTracker } from '../utils/error-tracker.js';

/**
 * 404 Not Found Middleware for unmapped routes
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl || req.url}`));
}

/**
 * Global Centralized Error Handling Middleware
 */
export function errorHandler(
  err: Error | ApiError | any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected internal server error occurred.';
  let details: unknown = undefined;

  if (err.name === 'SyntaxError' && 'body' in err) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Malformed JSON payload in request body';
  } else if (err instanceof ApiError || (err && typeof err.statusCode === 'number')) {
    statusCode = err.statusCode;
    code = err.code || 'API_ERROR';
    message = err.message || message;
    details = err.details;
  } else if (err.code === 11000) {
    // Sanitize MongoDB duplicate key error
    statusCode = 409;
    const keyPattern = err.keyPattern || {};
    const field = Object.keys(keyPattern)[0] || 'field';
    if (field === 'registrationNumber') {
      code = 'DUPLICATE_REGISTRATION';
      message = 'Vehicle with this registration number already exists in fleet.';
    } else if (field === 'vehicleCode') {
      code = 'VEHICLE_ALREADY_EXISTS';
      message = 'Vehicle with this identifier code already exists.';
    } else {
      code = 'DUPLICATE_RESOURCE';
      message = `A resource with that ${field} already exists.`;
    }
  } else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_IDENTIFIER';
    message = `Invalid identifier format for field "${err.path}".`;
  } else if (err.name === 'ZodError') {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = err.errors?.map((e: any) => ({ field: e.path.join('.'), message: e.message })) || err.issues;
  }

  // Forward unexpected 500+ server exceptions to ErrorTracker boundary
  if (statusCode >= 500) {
    ErrorTracker.captureException(err, {
      requestId: (_req as any)?.id,
      route: _req.originalUrl || _req.url,
      method: _req.method,
      statusCode,
      component: 'API'
    });
  }

  const errorResponse: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(!config.isProduction && statusCode >= 500 && err.stack ? { stack: err.stack } : {})
    }
  };

  res.status(statusCode).json(errorResponse);
}
