import { Router } from 'express';
import { ContactController } from '../controllers/contact.controller.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { submitContactSchema } from '../validators/contact.validator.js';
import { contactRateLimiter } from '../middleware/rate-limit.middleware.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Public contact inquiry submission with rate limiting and validation
router.post(
  '/',
  contactRateLimiter,
  validateRequest({ body: submitContactSchema }),
  ContactController.submitInquiry
);

// Admin/Staff inquiry management
router.get(
  '/',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  ContactController.listInquiries
);

export default router;
