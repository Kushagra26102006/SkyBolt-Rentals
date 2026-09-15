import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { updateProfileSchema } from '../validators/auth.validator.js';

const userRouter = Router();

// Profile inspection
userRouter.get(
  '/me',
  requireAuth,
  userController.getMe
);

// Profile modification with mass-assignment protection
userRouter.patch(
  '/me',
  requireAuth,
  validateRequest({ body: updateProfileSchema }),
  userController.updateMe
);

export default userRouter;
