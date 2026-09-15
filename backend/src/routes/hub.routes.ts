import { Router } from 'express';
import { hubController } from '../controllers/hub.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import {
  createHubBodySchema,
  updateHubBodySchema,
  hubQuerySchema,
  idParamSchema
} from '../validators/fleet.validator.js';

const router = Router();

// All hub operations require authentication
router.use(requireAuth);

/**
 * Hub Endpoints
 */
// 1. List hubs (accessible by STAFF, FLEET_MANAGER, ADMIN)
router.get(
  '/',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ query: hubQuerySchema }),
  hubController.listHubs
);

// 2. Create hub (FLEET_MANAGER, ADMIN)
router.post(
  '/',
  requireRole('FLEET_MANAGER', 'ADMIN'),
  validateRequest({ body: createHubBodySchema }),
  hubController.createHub
);

// 3. Get hub by ID
router.get(
  '/:id',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  hubController.getHub
);

// 4. Update hub (FLEET_MANAGER, ADMIN)
router.patch(
  '/:id',
  requireRole('FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema, body: updateHubBodySchema }),
  hubController.updateHub
);

// 5. Get vehicles at hub
router.get(
  '/:id/vehicles',
  requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  hubController.getHubVehicles
);

export default router;
