import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.config.js';
import { ApiError } from '../utils/api-error.js';
import { userRepository } from '../repositories/user.repository.js';
import { AuthJwtPayload, UserRole, AuthenticatedUser } from '../types/auth.types.js';

/**
 * Authentication Middleware: Validates JWT session from HTTP-only cookie or Bearer header
 */
export const requireAuth: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined = undefined;

    // 1. Primary: Extract from secure HTTP-only session cookie
    if (req.cookies && req.cookies[config.auth.cookieName]) {
      token = req.cookies[config.auth.cookieName];
    }

    // 2. Secondary fallback: Extract from Authorization Bearer header
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return next(ApiError.unauthorized('Authentication required. Please sign in.'));
    }

    // 3. Verify JWT token cryptographically (strictly enforce HS256 to reject alg=none)
    let decoded: AuthJwtPayload;
    try {
      decoded = jwt.verify(token, config.auth.jwtSecret, { algorithms: ['HS256'] }) as AuthJwtPayload;
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === 'TokenExpiredError') {
        return next(new ApiError(401, 'SESSION_EXPIRED', 'Authentication session has expired. Please sign in again.'));
      }
      return next(ApiError.unauthorized('Invalid authentication credentials.'));
    }

    if (!decoded.sub) {
      return next(ApiError.unauthorized('Malformed authentication token.'));
    }

    // 4. Verify authoritative user record in database
    const user = await userRepository.findById(decoded.sub);
    if (!user || user.isDeleted) {
      return next(ApiError.unauthorized('User account no longer exists.'));
    }

    // 5. Enforce account status server-side
    if (user.status === 'SUSPENDED') {
      return next(new ApiError(403, 'ACCOUNT_SUSPENDED', 'Your account has been suspended. Please contact customer support.'));
    }

    if (user.status === 'DEACTIVATED') {
      return next(new ApiError(403, 'ACCOUNT_DEACTIVATED', 'This account is deactivated.'));
    }

    // 6. Attach typed authenticated user context
    const authenticatedUser: AuthenticatedUser = {
      id: user.id || String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      avatar: user.avatar,
      licenseNumber: user.licenseNumber,
      emailVerified: Boolean(user.emailVerified),
      phoneVerified: Boolean(user.phoneVerified)
    };

    req.user = authenticatedUser;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Authorization Middleware: Reusable Role-Based Access Control (RBAC)
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required.'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ApiError(
          403,
          'FORBIDDEN',
          `Insufficient permissions. Requires one of: [${roles.join(', ')}]`
        )
      );
    }

    next();
  };
}

/**
 * Optional Authentication Middleware: If a token or cookie is present and valid,
 * attaches req.user without rejecting unauthenticated requests.
 */
export const optionalAuth: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined = undefined;

    if (req.cookies && req.cookies[config.auth.cookieName]) {
      token = req.cookies[config.auth.cookieName];
    }

    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, config.auth.jwtSecret, { algorithms: ['HS256'] }) as AuthJwtPayload;
      if (decoded?.sub) {
        const user = await userRepository.findById(decoded.sub);
        if (user && !user.isDeleted && user.status !== 'SUSPENDED' && user.status !== 'DEACTIVATED') {
          req.user = {
            id: user.id || String(user._id),
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            status: user.status,
            avatar: user.avatar,
            licenseNumber: user.licenseNumber,
            emailVerified: Boolean(user.emailVerified),
            phoneVerified: Boolean(user.phoneVerified)
          };
        }
      }
    } catch {
      // Ignore token decode error on optional auth
    }

    next();
  } catch (err) {
    next(err);
  }
};

