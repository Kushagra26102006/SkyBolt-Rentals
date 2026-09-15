import { Request, Response, NextFunction, RequestHandler } from 'express';
import { config } from '../config/env.config.js';
import { ApiError } from '../utils/api-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF Protection Middleware for Cookie-based sessions
 * Validates request Origin and Referer against allowed CORS origins on state-changing requests.
 */
export const csrfProtection: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  // Skip safe idempotent methods
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Skip in test environment
  if (config.isTest) {
    return next();
  }

  // Only enforce CSRF verification if an auth cookie is present
  const hasAuthCookie = req.cookies && req.cookies[config.auth.cookieName];
  if (!hasAuthCookie) {
    return next();
  }

  const origin = req.headers['origin'] as string | undefined;
  const referer = req.headers['referer'] as string | undefined;

  let requestOrigin: string | null = null;
  if (origin) {
    requestOrigin = origin;
  } else if (referer) {
    try {
      const url = new URL(referer);
      requestOrigin = url.origin;
    } catch {
      requestOrigin = null;
    }
  }

  // If client provides a custom anti-CSRF or request header (browsers do not allow cross-origin forms to set custom headers)
  const hasCustomHeader = Boolean(req.headers['x-requested-with'] || req.headers['x-csrf-token']);
  if (hasCustomHeader) {
    return next();
  }

  if (!requestOrigin) {
    return next(
      new ApiError(
        403,
        'CSRF_PROTECTION_VIOLATION',
        'Request blocked: State-changing cookie request missing Origin and Referer headers'
      )
    );
  }

  const isAllowed =
    config.corsOrigins.includes(requestOrigin) ||
    (config.isDevelopment && (requestOrigin.startsWith('http://localhost') || requestOrigin.startsWith('http://127.0.0.1')));

  if (!isAllowed) {
    return next(
      new ApiError(
        403,
        'CSRF_PROTECTION_VIOLATION',
        `Request blocked by CSRF policy: untrusted origin ${requestOrigin}`
      )
    );
  }

  next();
};
