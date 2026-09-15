import { Router } from 'express';
import { ownerController } from '../controllers/owner.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import {
  createOwnerVehicleSchema,
  updateOwnerVehicleSchema,
  toggleOwnerVehicleStatusSchema
} from '../validators/owner.validator.js';

const ownerRouter = Router();

// Strict RBAC Guard: Authentication and OWNER role required for all endpoints
ownerRouter.use(requireAuth);
ownerRouter.use(requireRole('OWNER'));

// Dashboard summary statistics
ownerRouter.get('/stats', ownerController.getStats);

// Vehicle operations
ownerRouter.post(
  '/vehicles',
  validateRequest({ body: createOwnerVehicleSchema }),
  ownerController.createVehicle
);

ownerRouter.get('/vehicles', ownerController.getVehicles);

ownerRouter.get('/vehicles/:id', ownerController.getVehicleById);

ownerRouter.patch(
  '/vehicles/:id',
  validateRequest({ body: updateOwnerVehicleSchema }),
  ownerController.updateVehicle
);

ownerRouter.patch(
  '/vehicles/:id/status',
  validateRequest({ body: toggleOwnerVehicleStatusSchema }),
  ownerController.toggleVehicleStatus
);

ownerRouter.delete('/vehicles/:id', ownerController.deleteVehicle);

// Rentals and earnings operations
ownerRouter.get('/bookings', ownerController.getBookings);
ownerRouter.get('/earnings', ownerController.getEarnings);

export default ownerRouter;
