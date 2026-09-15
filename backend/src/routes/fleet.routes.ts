import { Router } from 'express';
import { fleetController } from '../controllers/fleet.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import {
  fleetQuerySchema,
  updateFleetStatusBodySchema,
  assignHubBodySchema,
  createTransferBodySchema,
  createMaintenanceBodySchema,
  completeMaintenanceBodySchema,
  createInspectionBodySchema,
  pickupBookingBodySchema,
  returnBookingBodySchema,
  idParamSchema
} from '../validators/fleet.validator.js';

const router = Router();

// All fleet operations strictly require authentication and operational role
router.use(requireAuth);

/**
 * 1. Fleet Audit Trail
 */
router.get(
  '/audit-logs',
  requireRole('FLEET_MANAGER', 'ADMIN'),
  fleetController.getAuditLogs
);

/**
 * 2. Operational Booking Handover / Return
 */
router.post(
  '/bookings/:id/pickup',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema, body: pickupBookingBodySchema }),
  fleetController.pickupBooking
);

router.post(
  '/bookings/:id/return',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema, body: returnBookingBodySchema }),
  fleetController.returnBooking
);

/**
 * 3. Transfer Action Endpoints
 */
router.patch(
  '/transfers/:id/complete',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  fleetController.completeTransfer
);

router.patch(
  '/transfers/:id/cancel',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  fleetController.cancelTransfer
);

/**
 * 4. Maintenance Action Endpoints
 */
router.patch(
  '/maintenance/:id/start',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  fleetController.startMaintenance
);

router.patch(
  '/maintenance/:id',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  fleetController.startMaintenance
);

router.patch(
  '/maintenance/:id/complete',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema, body: completeMaintenanceBodySchema }),
  fleetController.completeMaintenance
);

/**
 * 5. Primary Fleet Inventory Endpoints
 */
router.get(
  '/',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ query: fleetQuerySchema }),
  fleetController.listFleet
);

router.get(
  '/:id',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  fleetController.getVehicle
);

router.patch(
  '/:id/status',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema, body: updateFleetStatusBodySchema }),
  fleetController.updateStatus
);

router.get(
  '/:id/readiness',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  fleetController.checkReadiness
);

router.post(
  '/:id/hub',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema, body: assignHubBodySchema }),
  fleetController.assignHub
);

router.delete(
  '/:id/hub',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  fleetController.removeHub
);

router.get(
  '/:id/transfers',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  fleetController.listTransfers
);

router.post(
  '/:id/transfers',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema, body: createTransferBodySchema }),
  fleetController.createTransfer
);

router.get(
  '/:id/maintenance',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  fleetController.listMaintenance
);

router.post(
  '/:id/maintenance',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema, body: createMaintenanceBodySchema }),
  fleetController.createMaintenance
);

router.get(
  '/:id/inspections',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  fleetController.listInspections
);

router.post(
  '/:id/inspections',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema, body: createInspectionBodySchema }),
  fleetController.createInspection
);

export default router;
