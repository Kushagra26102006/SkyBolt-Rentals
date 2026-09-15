import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.config.js';
import { authService } from '../services/auth.service.js';
import { userService } from '../services/user.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { ApiError } from '../utils/api-error.js';

export class AuthController {
  /**
   * Set HTTP-Only session cookie
   */
  private setSessionCookie(res: Response, token: string): void {
    res.cookie(config.auth.cookieName, token, {
      httpOnly: true,
      secure: config.auth.cookieSecure,
      sameSite: config.auth.cookieSameSite as 'lax' | 'strict' | 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });
  }

  /**
   * Clear session cookie
   */
  private clearSessionCookie(res: Response): void {
    res.clearCookie(config.auth.cookieName, {
      httpOnly: true,
      secure: config.auth.cookieSecure,
      sameSite: config.auth.cookieSameSite as 'lax' | 'strict' | 'none',
      path: '/'
    });
  }

  /**
   * POST /api/v1/auth/register
   */
  public register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { user, token } = await authService.register(req.body);
      this.setSessionCookie(res, token);
      sendSuccess(res, { user }, 201, 'User registered successfully');
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/login
   */
  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { user, token } = await authService.login(req.body);
      this.setSessionCookie(res, token);
      sendSuccess(res, { user }, 200, 'Authentication successful');
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/logout
   */
  public logout = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.clearSessionCookie(res);
      sendSuccess(res, null, 200, 'Logged out successfully');
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/auth/me
   */
  public getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Authentication required.'));
      }
      const user = await userService.getProfile(req.user.id);
      sendSuccess(res, { user }, 200);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/change-password
   */
  public changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Authentication required.'));
      }
      await authService.changePassword(req.user.id, req.body);
      sendSuccess(res, null, 200, 'Password updated successfully');
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/forgot-password
   */
  public forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await authService.forgotPassword(req.body.email);
      sendSuccess(res, result, 200);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/reset-password
   */
  public resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await authService.resetPassword(req.body);
      sendSuccess(res, null, 200, 'Password has been reset successfully. Please sign in with your new password.');
    } catch (err) {
      next(err);
    }
  };
}

export const authController = new AuthController();
