import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import vehicleRoutes from './vehicle.routes.js';
import availabilityRoutes from './availability.routes.js';
import bookingRoutes from './booking.routes.js';
import pricingRoutes from './pricing.routes.js';
import paymentRoutes from './payment.routes.js';
import fleetRoutes from './fleet.routes.js';
import hubRoutes from './hub.routes.js';
import adminRoutes from './admin.routes.js';
import contactRoutes from './contact.routes.js';
import { customerNotificationRouter, adminNotificationRouter } from '../notifications/notification.routes.js';
import reviewRouter from '../reviews/review.routes.js';
import adminReviewRouter from './admin-review.routes.js';
import adminQueueRouter from './admin-queue.routes.js';
import recommendationRouter from './recommendation.routes.js';
import chatbotRouter from '../modules/chatbot/chatbot.routes.js';
import ownerRoutes from './owner.routes.js';
import { fleetController } from '../controllers/fleet.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { completeMaintenanceBodySchema, idParamSchema } from '../validators/fleet.validator.js';

const apiRouter = Router();

// Mount foundational routes
apiRouter.use('/', healthRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/vehicles', vehicleRoutes);
apiRouter.use('/owner', ownerRoutes);
apiRouter.use('/', availabilityRoutes);
apiRouter.use('/bookings', bookingRoutes);
apiRouter.use('/pricing', pricingRoutes);
apiRouter.use('/payments', paymentRoutes);
apiRouter.use('/contact', contactRoutes);

// Mount Fleet Management & Hub Logistics (Task 11)
apiRouter.use('/fleet', fleetRoutes);
apiRouter.use('/hubs', hubRoutes);

// Mount Transactional Notification Subsystem (Task 13)
apiRouter.use('/admin/notifications', adminNotificationRouter);
apiRouter.use('/notifications', customerNotificationRouter);

// Mount Verified Customer Reviews Subsystem (Task 14)
apiRouter.use('/admin/reviews', adminReviewRouter);
apiRouter.use('/', reviewRouter);

// Mount Production Admin Operational Dashboards (Task 12)
apiRouter.use('/admin', adminRoutes);

// Mount Redis & BullMQ Queue Management (Task 15)
apiRouter.use('/admin/queues', adminQueueRouter);

// Mount Production AI-Powered Vehicle Recommendation Engine (Task 16)
apiRouter.use('/recommendations', recommendationRouter);

// Mount Production AI Chatbot — SkyBolt AI
apiRouter.use('/chat', chatbotRouter);

// Direct alias endpoints for transfers & maintenance actions
const transferRouter = Router();
transferRouter.use(requireAuth);
transferRouter.patch(
  '/:id/complete',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  fleetController.completeTransfer
);
transferRouter.patch(
  '/:id/cancel',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  fleetController.cancelTransfer
);
apiRouter.use('/transfers', transferRouter);

const maintenanceRouter = Router();
maintenanceRouter.use(requireAuth);
maintenanceRouter.patch(
  '/:id/start',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  fleetController.startMaintenance
);
maintenanceRouter.patch(
  '/:id/complete',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema, body: completeMaintenanceBodySchema }),
  fleetController.completeMaintenance
);
maintenanceRouter.patch(
  '/:id',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  fleetController.startMaintenance
);
apiRouter.use('/maintenance', maintenanceRouter);

export default apiRouter;
