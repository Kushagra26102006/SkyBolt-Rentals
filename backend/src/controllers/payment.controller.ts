import { Request, Response, NextFunction } from 'express';
import { paymentService } from '../services/payment.service.js';
import { paymentReconciliationService } from '../services/payment-reconciliation.service.js';
import {
  createOrderSchema,
  verifyPaymentSchema,
  paymentListQuerySchema
} from '../validators/payment.validator.js';
import { ApiError } from '../utils/api-error.js';
import { VerifyPaymentInput } from '../types/payment.types.js';

export class PaymentController {
  /**
   * POST /api/v1/payments/orders
   * Initiates payment order using authoritative booking pricing snapshot
   */
  public async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required.');
      }

      const validated = createOrderSchema.parse(req.body);
      const checkoutOrder = await paymentService.createPaymentOrder(req.user, {
        bookingId: validated.bookingId
      });

      res.status(201).json({
        success: true,
        data: checkoutOrder
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/payments/verify
   * Cryptographically verifies payment signature and confirms booking
   */
  public async verifyPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required.');
      }

      const validated = verifyPaymentSchema.parse(req.body);
      const result = await paymentService.verifyPayment(req.user, validated as VerifyPaymentInput);

      res.status(200).json({
        success: true,
        message: 'Payment verified and booking confirmed successfully.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/payments/webhook
   * Official Razorpay Webhook Callback
   * Signature verified via RAZORPAY_WEBHOOK_SECRET against raw request buffer
   */
  public async handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      if (!signature) {
        throw new ApiError(400, 'WEBHOOK_SIGNATURE_MISSING', 'Missing X-Razorpay-Signature header.');
      }

      // Retrieve preserved raw buffer from verify middleware in app.ts
      const rawBody: Buffer | string =
        (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

      const result = await paymentService.processWebhook(rawBody, signature, req.body);

      res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/payments/:id
   * Retrieves single payment details with ownership check
   */
  public async getPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required.');
      }

      const payment = await paymentService.getPaymentById(req.params.id as string, req.user);
      res.status(200).json({
        success: true,
        data: payment
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/payments
   * Retrieves customer payment history
   */
  public async getUserPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required.');
      }

      const query = paymentListQuerySchema.parse(req.query);
      const result = await paymentService.getUserPayments(req.user.id, query);

      res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/payments/reconciliation/report
   * Internal staff/admin endpoint to scan for payment & booking discrepancies
   */
  public async getReconciliationReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !['STAFF', 'FLEET_MANAGER', 'ADMIN'].includes(req.user.role)) {
        throw ApiError.forbidden('Access denied to reconciliation report.');
      }

      const discrepancies = await paymentReconciliationService.detectDiscrepancies();
      res.status(200).json({
        success: true,
        count: discrepancies.length,
        data: discrepancies
      });
    } catch (err) {
      next(err);
    }
  }
}

export const paymentController = new PaymentController();
export default paymentController;
