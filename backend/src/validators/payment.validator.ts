import { z } from 'zod';

export const createOrderSchema = z.object({
  bookingId: z.string({
    error: 'Booking ID or Reference is required'
  }).min(1, 'Booking ID cannot be empty')
});

export const verifyPaymentSchema = z.object({
  bookingId: z.string({
    error: 'Booking ID is required'
  }).min(1, 'Booking ID cannot be empty'),
  razorpay_order_id: z.string({
    error: 'Razorpay order ID is required'
  }).min(1, 'Razorpay order ID cannot be empty'),
  razorpay_payment_id: z.string({
    error: 'Razorpay payment ID is required'
  }).min(1, 'Razorpay payment ID cannot be empty'),
  razorpay_signature: z.string({
    error: 'Razorpay signature is required'
  }).min(1, 'Razorpay signature cannot be empty')
});

export const paymentListQuerySchema = z.object({
  page: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 20)),
  status: z
    .enum([
      'CREATED',
      'ORDER_CREATED',
      'PENDING',
      'AUTHORIZED',
      'CAPTURED',
      'FAILED',
      'CANCELLED',
      'REFUNDED',
      'PARTIALLY_REFUNDED'
    ])
    .optional(),
  bookingId: z.string().optional()
});
