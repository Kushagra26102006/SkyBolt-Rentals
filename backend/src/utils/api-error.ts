export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    isOperational = true,
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad Request', details?: unknown): ApiError {
    return new ApiError(400, 'BAD_REQUEST', message, true, details);
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message, true);
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, 'FORBIDDEN', message, true);
  }

  static notFound(message = 'Resource Not Found'): ApiError {
    return new ApiError(404, 'NOT_FOUND', message, true);
  }

  static conflict(message = 'Resource Conflict', details?: unknown): ApiError {
    return new ApiError(409, 'CONFLICT', message, true, details);
  }

  static unprocessable(message = 'Validation Failed', details?: unknown): ApiError {
    return new ApiError(422, 'UNPROCESSABLE_ENTITY', message, true, details);
  }

  static tooManyRequests(message = 'Too many requests, please try again later.'): ApiError {
    return new ApiError(429, 'TOO_MANY_REQUESTS', message, true);
  }

  static internal(message = 'Internal Server Error'): ApiError {
    return new ApiError(500, 'INTERNAL_SERVER_ERROR', message, false);
  }
}
