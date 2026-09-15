import { z } from 'zod';

export const MIN_BOOKING_NOTICE_MINUTES = 15;
export const MAX_BOOKING_DAYS = 90;
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes tolerance for network/clock differences

/**
 * Validates pickup and return dates with strict ISO-8601 formatting,
 * past date protection, inverted range checks, and maximum rental limits.
 */
function validateDateRange(
  pickupStr: string,
  returnStr: string,
  ctx: z.RefinementCtx
): { pickupAt: Date; returnAt: Date } | null {
  const pickupAt = new Date(pickupStr);
  const returnAt = new Date(returnStr);

  if (isNaN(pickupAt.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid pickupAt ISO date format',
      path: ['pickupAt']
    });
    return null;
  }

  if (isNaN(returnAt.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid returnAt ISO date format',
      path: ['returnAt']
    });
    return null;
  }

  // 1. pickupAt must be strictly before returnAt
  if (pickupAt.getTime() >= returnAt.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'returnAt must be strictly after pickupAt',
      path: ['returnAt']
    });
    return null;
  }

  // 2. pickupAt cannot be in the past
  const earliestAllowedTime = Date.now() - CLOCK_SKEW_TOLERANCE_MS;
  if (pickupAt.getTime() < earliestAllowedTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'pickupAt cannot be in the past',
      path: ['pickupAt']
    });
    return null;
  }

  // 3. Maximum rental window check
  const maxDurationMs = MAX_BOOKING_DAYS * 24 * 60 * 60 * 1000;
  if (returnAt.getTime() - pickupAt.getTime() > maxDurationMs) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Rental duration cannot exceed ${MAX_BOOKING_DAYS} days`,
      path: ['returnAt']
    });
    return null;
  }

  return { pickupAt, returnAt };
}

export const availabilityQuerySchema = z
  .object({
    pickupAt: z.string({ required_error: 'pickupAt query parameter is required' }).trim(),
    returnAt: z.string({ required_error: 'returnAt query parameter is required' }).trim()
  })
  .superRefine((data, ctx) => {
    validateDateRange(data.pickupAt, data.returnAt, ctx);
  });

export const createHoldSchema = z
  .object({
    pickupAt: z.string({ required_error: 'pickupAt is required in request body' }).trim(),
    returnAt: z.string({ required_error: 'returnAt is required in request body' }).trim(),
    ttlMinutes: z.number().int().min(1).max(60).optional()
  })
  .strict({
    message: 'Unexpected fields provided in hold request'
  })
  .superRefine((data, ctx) => {
    validateDateRange(data.pickupAt, data.returnAt, ctx);
  });

export const holdIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Hold identifier is required')
});

export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
export type CreateHoldInput = z.infer<typeof createHoldSchema>;
