import { Request, Response, NextFunction } from 'express';
import { userService } from '../services/user.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { ApiError } from '../utils/api-error.js';

export class UserController {
  /**
   * GET /api/v1/users/me
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
   * PATCH /api/v1/users/me
   */
  public updateMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Authentication required.'));
      }
      const updatedUser = await userService.updateProfile(req.user.id, req.body);
      sendSuccess(res, { user: updatedUser }, 200, 'Profile updated successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const userController = new UserController();
