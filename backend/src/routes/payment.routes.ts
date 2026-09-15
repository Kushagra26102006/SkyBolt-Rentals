import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * Public Webhook endpoint
 * IMPORTANT: No user authentication - Razorpay server-to-server webhook
 * Authenticity is guaranteed via cryptographic HMAC signature verification on raw body buffer.
 */
router.post('/webhook', (req, res, next) => paymentController.handleWebhook(req, res, next));

/**
 * Authenticated Customer Endpoints
 */
router.use(requireAuth);

router.post('/orders', (req, res, next) => paymentController.createOrder(req, res, next));
router.post('/verify', (req, res, next) => paymentController.verifyPayment(req, res, next));
router.get('/reconciliation/report', requireRole('STAFF', 'FLEET_MANAGER', 'ADMIN'), (req, res, next) =>
  paymentController.getReconciliationReport(req, res, next)
);
router.get('/:id', (req, res, next) => paymentController.getPayment(req, res, next));
router.get('/', (req, res, next) => paymentController.getUserPayments(req, res, next));

export default router;
