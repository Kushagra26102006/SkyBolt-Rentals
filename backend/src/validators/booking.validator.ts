import { z } from 'zod';
import mongoose from 'mongoose';

const MIN_NOTICE_TOLERANCE_MS = 15 * 60 * 1000; // 15 minutes tolerance

export const createBookingSchema = z
  .object({
    vehicleId: z
      .string({ required_error: 'Vehicle ID is required' })
      .min(1, 'Vehicle ID cannot be empty')
      .trim(),
    pickupAt: z
      .string({ required_error: 'Pickup date/time is required' })
      .datetime({ message: 'Pickup date must be a valid ISO-8601 UTC timestamp' }),
    returnAt: z
      .string({ required_error: 'Return date/time is required' })
      .datetime({ message: 'Return date must be a valid ISO-8601 UTC timestamp' }),
    pickupLocation: z.string().max(100, 'Pickup location is too long').optional(),
    returnLocation: z.string().max(100, 'Return location is too long').optional(),
    notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),
    couponCode: z.string().max(30, 'Coupon code is too long').trim().optional()
  })
  .strict()
  .refine(
    (data) => {
      const p = new Date(data.pickupAt).getTime();
      const r = new Date(data.returnAt).getTime();
      return p < r;
    },
    {
      message: 'Return timestamp must be strictly after pickup timestamp',
      path: ['returnAt']
    }
  )
  .refine(
    (data) => {
      const p = new Date(data.pickupAt).getTime();
      const now = Date.now();
      return p >= now - MIN_NOTICE_TOLERANCE_MS;
    },
    {
      message: 'Pickup date cannot be in the past',
      path: ['pickupAt']
    }
  );

export const cancelBookingSchema = z
  .object({
    reason: z
      .enum(['CUSTOMER_REQUEST', 'OPERATIONAL', 'PAYMENT_TIMEOUT', 'SYSTEM', 'OTHER'])
      .default('CUSTOMER_REQUEST'),
    notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional()
  })
  .strict();

export const bookingListQuerySchema = z.object({
  status: z
    .enum([
      'DRAFT',
      'PENDING',
      'PAYMENT_PENDING',
      'CONFIRMED',
      'ACTIVE',
      'COMPLETED',
      'CANCELLED',
      'EXPIRED'
    ])
    .optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  vehicleId: z.string().optional(),
  sort: z
    .enum(['newest', 'oldest', 'pickup_soonest', 'pickup_latest'])
    .default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const bookingIdParamSchema = z.object({
  id: z.string().refine(
    (val) => mongoose.isValidObjectId(val) || /^SKY-\d{8}-[A-Z0-9]{6}$/.test(val.trim().toUpperCase()),
    {
      message: 'Identifier must be a valid MongoDB ObjectId or booking reference (SKY-YYYYMMDD-XXXXXX)'
    }
  )
});
