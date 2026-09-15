import { Request, Response, NextFunction } from 'express';
import { notificationRepository } from './notification.repository.js';
import { notificationService } from './notification.service.js';
import { ApiError } from '../utils/api-error.js';

export class NotificationController {
  /**
   * Customer: Get paginated notification history for the authenticated user
   */
  public getMyNotifications = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const { page, limit, channel, status, type } = req.query as any;

      const result = await notificationRepository.findCustomerNotifications(req.user.id, {
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        channel,
        status,
        type
      });

      res.status(200).json({
        success: true,
        data: result.notifications.map((n) => n.toSafeDTO()),
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit) || 1
        }
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Customer: Get notification preferences
   */
  public getPreferences = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const preferences = await notificationService.getPreferences(req.user.id);

      res.status(200).json({
        success: true,
        data: preferences
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Customer: Update notification preferences
   */
  public updatePreferences = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const updated = await notificationService.updatePreferences(req.user.id, req.body);

      res.status(200).json({
        success: true,
        message: 'Notification preferences updated successfully.',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Customer: Mark notification as read
   */
  public markAsRead = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const id = req.params.id!;
      const updated = await notificationRepository.markNotificationRead(id, req.user.id);
      if (!updated) {
        throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found or access denied');
      }

      res.status(200).json({
        success: true,
        message: 'Notification marked as read.',
        data: updated.toSafeDTO()
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Admin: List all notifications across users with filters and pagination
   */
  public getAdminNotifications = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { page, limit, channel, status, type, userId, bookingId, paymentId, recipient } = req.query as any;

      const result = await notificationRepository.findAdminNotifications({
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        channel,
        status,
        type,
        userId,
        bookingId,
        paymentId,
        recipient
      });

      res.status(200).json({
        success: true,
        data: result.notifications.map((n) => n.toAdminDTO()),
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit) || 1
        }
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Admin: Get notification aggregate health and channel stats
   */
  public getAdminStats = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const stats = await notificationRepository.getStats();

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Admin: Get detailed notification by ID
   */
  public getNotificationDetail = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = req.params.id!;
      const doc = await notificationRepository.findNotificationById(id);
      if (!doc) {
        throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', 'Notification record not found');
      }

      res.status(200).json({
        success: true,
        data: doc.toAdminDTO()
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Admin: Authorized retry of failed notification
   */
  public retryNotification = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const id = req.params.id!;
      const result = await notificationService.retryNotification(id, req.user);

      res.status(200).json({
        success: result.success,
        message: result.success
          ? 'Notification redelivered successfully'
          : `Notification retry attempt recorded: ${result.error || 'delivery failed'}`,
        data: result
      });
    } catch (err) {
      next(err);
    }
  };
}

export const notificationController = new NotificationController();
