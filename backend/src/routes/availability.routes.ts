import { Router } from 'express';
import { availabilityController } from '../controllers/availability.controller.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { vehicleIdParamSchema } from '../validators/vehicle.validator.js';
import {
  availabilityQuerySchema,
  createHoldSchema,
  holdIdParamSchema
} from '../validators/availability.validator.js';

const router = Router();

/**
 * @route   GET /api/v1/vehicles/:id/availability
 * @desc    Check if a specific vehicle is available for the given date/time range
 * @access  Public
 */
router.get(
  '/vehicles/:id/availability',
  validateRequest({
    params: vehicleIdParamSchema,
    query: availabilityQuerySchema
  }),
  availabilityController.getAvailability
);

/**
 * @route   POST /api/v1/vehicles/:id/holds
 * @desc    Create a temporary inventory hold lock for checkout
 * @access  Private (Authenticated users)
 */
router.post(
  '/vehicles/:id/holds',
  requireAuth,
  validateRequest({
    params: vehicleIdParamSchema,
    body: createHoldSchema
  }),
  availabilityController.createHold
);

/**
 * @route   DELETE /api/v1/holds/:id
 * @desc    Release a temporary inventory hold
 * @access  Private (Hold owner)
 */
router.delete(
  '/holds/:id',
  requireAuth,
  validateRequest({
    params: holdIdParamSchema
  }),
  availabilityController.releaseHold
);

export const availabilityRoutes = router;
export default router;
