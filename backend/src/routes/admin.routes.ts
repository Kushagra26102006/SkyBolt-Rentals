import { Router } from 'express';
import { adminDashboardController } from '../controllers/admin-dashboard.controller.js';
import { recommendationController } from '../controllers/recommendation.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { idParamSchema } from '../validators/fleet.validator.js';
import {
  adminBookingQuerySchema,
  adminUserQuerySchema,
  updateUserRoleBodySchema,
  updateUserStatusBodySchema,
  adminPaymentQuerySchema,
  adminAuditQuerySchema,
  adminMaintenanceQuerySchema,
  adminInspectionQuerySchema,
  adminTransferQuerySchema,
  vehicleApprovalBodySchema,
  ownerVerificationBodySchema
} from '../validators/admin.validator.js';

const router = Router();

// Strict Authentication Guard across all admin control-center endpoints
router.use(requireAuth);

/**
 * 1. Operational Overview & Health Diagnostics
 */
router.get(
  '/dashboard/overview',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  adminDashboardController.getOverview
);

/**
 * 2. Bookings Operations & Management
 */
router.get(
  '/bookings',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ query: adminBookingQuerySchema }),
  adminDashboardController.getBookings
);

/**
 * 3. User Management & Privilege Enforcement (Strictly ADMIN)
 */
router.get(
  '/users',
  requireRole('ADMIN'),
  validateRequest({ query: adminUserQuerySchema }),
  adminDashboardController.getUsers
);

router.patch(
  '/users/:id/role',
  requireRole('ADMIN'),
  validateRequest({ params: idParamSchema, body: updateUserRoleBodySchema }),
  adminDashboardController.updateUserRole
);

router.patch(
  '/users/:id/status',
  requireRole('ADMIN'),
  validateRequest({ params: idParamSchema, body: updateUserStatusBodySchema }),
  adminDashboardController.updateUserStatus
);

/**
 * 4. Cross-Vehicle Maintenance Records Queue
 */
router.get(
  '/maintenance',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ query: adminMaintenanceQuerySchema }),
  adminDashboardController.getMaintenance
);

/**
 * 5. Cross-Vehicle Inspections Records Queue
 */
router.get(
  '/inspections',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ query: adminInspectionQuerySchema }),
  adminDashboardController.getInspections
);

/**
 * 6. Cross-Hub Vehicle Transfers Queue
 */
router.get(
  '/transfers',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ query: adminTransferQuerySchema }),
  adminDashboardController.getTransfers
);

/**
 * 7. Payment Financial Ledger & Gateway Reconciliation (FLEET_MANAGER & ADMIN)
 */
router.get(
  '/payments',
  requireRole('FLEET_MANAGER', 'ADMIN'),
  validateRequest({ query: adminPaymentQuerySchema }),
  adminDashboardController.getPayments
);

/**
 * 8. Comprehensive Vehicle Operations Dossier
 */
router.get(
  '/vehicles/:id/operations',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  adminDashboardController.getVehicleDetail
);

/**
 * 9. Platform-wide Immutable Audit Logs (FLEET_MANAGER & ADMIN)
 */
router.get(
  '/audit-logs',
  requireRole('FLEET_MANAGER', 'ADMIN'),
  validateRequest({ query: adminAuditQuerySchema }),
  adminDashboardController.getAuditLogs
);

/**
 * 10. AI-Powered Recommendation Engine Operational Telemetry
 */
router.get(
  '/recommendations/metrics',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  recommendationController.getMetrics
);

/**
 * 11. Marketplace Vehicle Listing Approval & Control (Strictly ADMIN)
 */
router.patch(
  '/vehicles/:id/approval',
  requireRole('ADMIN'),
  validateRequest({ params: idParamSchema, body: vehicleApprovalBodySchema }),
  adminDashboardController.approveVehicle
);

/**
 * 12. Marketplace Vehicle Owner Identity Verification (Strictly ADMIN)
 */
router.patch(
  '/users/:id/verify-owner',
  requireRole('ADMIN'),
  validateRequest({ params: idParamSchema, body: ownerVerificationBodySchema }),
  adminDashboardController.verifyOwner
);

/**
 * 13. Marketplace Vehicle Owners Directorate (FLEET_MANAGER & ADMIN)
 */
router.get(
  '/owners',
  requireRole('FLEET_MANAGER', 'ADMIN'),
  adminDashboardController.getOwners
);

export default router;
