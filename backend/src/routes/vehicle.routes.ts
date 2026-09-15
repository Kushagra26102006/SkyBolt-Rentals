import { Router } from 'express';
import { vehicleController } from '../controllers/vehicle.controller.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import {
  listVehiclesQuerySchema,
  createVehicleSchema,
  updateVehicleSchema,
  vehicleIdParamSchema
} from '../validators/vehicle.validator.js';

const vehicleRouter = Router();

// Public Catalog Listing
vehicleRouter.get(
  '/',
  validateRequest({ query: listVehiclesQuerySchema }),
  vehicleController.getVehicles
);

// Public Vehicle Details
vehicleRouter.get(
  '/:id',
  validateRequest({ params: vehicleIdParamSchema }),
  vehicleController.getVehicleById
);

// Create Vehicle (Admin or Fleet Manager)
vehicleRouter.post(
  '/',
  requireAuth,
  requireRole('ADMIN', 'FLEET_MANAGER'),
  validateRequest({ body: createVehicleSchema }),
  vehicleController.createVehicle
);

// Update Vehicle (Admin or Fleet Manager)
vehicleRouter.patch(
  '/:id',
  requireAuth,
  requireRole('ADMIN', 'FLEET_MANAGER'),
  validateRequest({
    params: vehicleIdParamSchema,
    body: updateVehicleSchema
  }),
  vehicleController.updateVehicle
);

// Soft-Retire Vehicle (Admin only)
vehicleRouter.delete(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  validateRequest({ params: vehicleIdParamSchema }),
  vehicleController.deleteVehicle
);

export default vehicleRouter;
