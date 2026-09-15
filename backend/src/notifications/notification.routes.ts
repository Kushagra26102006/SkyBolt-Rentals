import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { notificationController } from './notification.controller.js';
import {
  customerNotificationQuerySchema,
  adminNotificationQuerySchema,
  notificationIdParamSchema,
  updatePreferencesSchema
} from '../validators/notification.validator.js';

// Customer Notification Routes: /api/v1/notifications
const customerNotificationRouter = Router();

customerNotificationRouter.use(requireAuth);

customerNotificationRouter.get(
  '/',
  validateRequest({ query: customerNotificationQuerySchema }),
  notificationController.getMyNotifications
);

customerNotificationRouter.get(
  '/preferences',
  notificationController.getPreferences
);

customerNotificationRouter.patch(
  '/preferences',
  validateRequest({ body: updatePreferencesSchema }),
  notificationController.updatePreferences
);

customerNotificationRouter.patch(
  '/:id/read',
  validateRequest({ params: notificationIdParamSchema }),
  notificationController.markAsRead
);

// Admin Notification Routes: /api/v1/admin/notifications
const adminNotificationRouter = Router();

adminNotificationRouter.use(requireAuth);
adminNotificationRouter.use(requireRole('ADMIN'));

adminNotificationRouter.get(
  '/',
  validateRequest({ query: adminNotificationQuerySchema }),
  notificationController.getAdminNotifications
);

adminNotificationRouter.get(
  '/stats',
  notificationController.getAdminStats
);

adminNotificationRouter.get(
  '/:id',
  validateRequest({ params: notificationIdParamSchema }),
  notificationController.getNotificationDetail
);

adminNotificationRouter.post(
  '/:id/retry',
  validateRequest({ params: notificationIdParamSchema }),
  notificationController.retryNotification
);

export { customerNotificationRouter, adminNotificationRouter };
export default customerNotificationRouter;
