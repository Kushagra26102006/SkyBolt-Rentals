import { z } from 'zod';

export const createReviewSchema = z
  .object({
    rating: z
      .number({
        required_error: 'Rating is required',
        invalid_type_error: 'Rating must be a number'
      })
      .int('Rating must be an integer')
      .min(1, 'Rating cannot be less than 1')
      .max(5, 'Rating cannot be greater than 5'),
    title: z
      .string({
        required_error: 'Review title is required'
      })
      .trim()
      .min(3, 'Review title must be at least 3 characters')
      .max(100, 'Review title cannot exceed 100 characters'),
    comment: z
      .string({
        required_error: 'Review comment is required'
      })
      .trim()
      .min(10, 'Review comment must be at least 10 characters')
      .max(2000, 'Review comment cannot exceed 2000 characters')
  })
  .strict();

export const updateReviewSchema = z
  .object({
    rating: z
      .number()
      .int('Rating must be an integer')
      .min(1, 'Rating cannot be less than 1')
      .max(5, 'Rating cannot be greater than 5')
      .optional(),
    title: z
      .string()
      .trim()
      .min(3, 'Review title must be at least 3 characters')
      .max(100, 'Review title cannot exceed 100 characters')
      .optional(),
    comment: z
      .string()
      .trim()
      .min(10, 'Review comment must be at least 10 characters')
      .max(2000, 'Review comment cannot exceed 2000 characters')
      .optional()
  })
  .strict();

export const createReportSchema = z
  .object({
    reason: z.enum(['SPAM', 'ABUSIVE', 'INAPPROPRIATE', 'FRAUDULENT', 'IRRELEVANT', 'OTHER'], {
      required_error: 'Report reason is required'
    }),
    description: z
      .string()
      .trim()
      .max(500, 'Report description cannot exceed 500 characters')
      .optional()
  })
  .strict();

export const moderateReviewSchema = z
  .object({
    status: z.enum(['PUBLISHED', 'HIDDEN', 'REJECTED'], {
      required_error: 'Moderation status is required'
    }),
    moderationStatus: z.enum(['APPROVED', 'PENDING', 'FLAGGED', 'REJECTED']).optional(),
    rejectionReason: z.string().trim().max(500).optional()
  })
  .strict();

export const resolveReportSchema = z
  .object({
    status: z.enum(['RESOLVED', 'DISMISSED'], {
      required_error: 'Resolution status is required'
    }),
    resolutionNotes: z.string().trim().max(500).optional(),
    hideReview: z.boolean().optional(),
    reviewAction: z.enum(['NONE', 'HIDE_REVIEW', 'REJECT_REVIEW']).optional()
  })
  .strict();

export const publicReviewQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z.string().optional().transform((val) => (val ? Math.min(50, Math.max(1, parseInt(val, 10))) : 10)),
  sort: z.enum(['newest', 'highest', 'lowest', 'most_helpful']).optional().default('newest'),
  rating: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .refine((val) => val === undefined || (val >= 1 && val <= 5), {
      message: 'Rating filter must be between 1 and 5'
    })
});

export const adminReviewQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z.string().optional().transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 20)),
  sort: z.enum(['newest', 'highest', 'lowest', 'most_helpful']).optional().default('newest'),
  status: z.enum(['PUBLISHED', 'PENDING', 'HIDDEN', 'REJECTED', 'DELETED']).optional(),
  rating: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),
  vehicleId: z.string().optional(),
  userId: z.string().optional(),
  startDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
  endDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined))
});

export const reviewIdParamSchema = z.object({
  id: z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
    message: 'Invalid review identifier format'
  })
});

export const reportIdParamSchema = z.object({
  id: z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
    message: 'Invalid report identifier format'
  })
});

export const bookingIdParamSchema = z.object({
  bookingId: z.string().min(1, 'Booking identifier is required')
});

export const vehicleIdParamSchema = z.object({
  vehicleId: z.string().min(1, 'Vehicle identifier is required')
});
