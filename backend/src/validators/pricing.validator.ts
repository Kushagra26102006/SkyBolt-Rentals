import { z } from 'zod';

const MIN_NOTICE_TOLERANCE_MS = 15 * 60 * 1000;

export const pricingQuoteSchema = z
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
    couponCode: z.string().max(30, 'Coupon code is too long').trim().optional(),
    pickupLocation: z.string().max(100).optional(),
    returnLocation: z.string().max(100).optional()
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
