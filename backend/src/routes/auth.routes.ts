import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { authRateLimiter, passwordResetRateLimiter } from '../middleware/rate-limit.middleware.js';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema
} from '../validators/auth.validator.js';

const authRouter = Router();

// Registration endpoint
authRouter.post(
  '/register',
  authRateLimiter,
  validateRequest({ body: registerSchema }),
  authController.register
);

// Login endpoint
authRouter.post(
  '/login',
  authRateLimiter,
  validateRequest({ body: loginSchema }),
  authController.login
);

// Logout endpoint
authRouter.post(
  '/logout',
  authController.logout
);

// Current user identity endpoint
authRouter.get(
  '/me',
  requireAuth,
  authController.getMe
);

// Admin-only authorization test endpoint
authRouter.get(
  '/admin-only',
  requireAuth,
  requireRole('ADMIN'),
  (_req, res) => {
    res.status(200).json({ success: true, data: { secret: 'admin-classified-data' } });
  }
);

// Password change endpoint (authenticated)
authRouter.post(
  '/change-password',
  authRateLimiter,
  requireAuth,
  validateRequest({ body: changePasswordSchema }),
  authController.changePassword
);

// Forgot password request endpoint
authRouter.post(
  '/forgot-password',
  passwordResetRateLimiter,
  validateRequest({ body: forgotPasswordSchema }),
  authController.forgotPassword
);

// Reset password execution endpoint
authRouter.post(
  '/reset-password',
  passwordResetRateLimiter,
  validateRequest({ body: resetPasswordSchema }),
  authController.resetPassword
);

export default authRouter;
