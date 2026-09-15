import { z } from 'zod';

export const updatePreferencesSchema = z.object({
  emailBookingUpdates: z.boolean().optional(),
  emailPaymentUpdates: z.boolean().optional(),
  smsBookingUpdates: z.boolean().optional(),
  smsPaymentUpdates: z.boolean().optional(),
  marketingEmail: z.boolean().optional(),
  marketingSms: z.boolean().optional()
}).strict();

export const customerNotificationQuerySchema = z.object({
  channel: z.enum(['EMAIL', 'SMS']).optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED']).optional(),
  type: z.string().optional(),
  page: z.string().optional().transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z.string().optional().transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 20))
});

export const adminNotificationQuerySchema = z.object({
  channel: z.enum(['EMAIL', 'SMS']).optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED']).optional(),
  type: z.string().optional(),
  userId: z.string().optional(),
  bookingId: z.string().optional(),
  paymentId: z.string().optional(),
  recipient: z.string().optional(),
  page: z.string().optional().transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z.string().optional().transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 20))
});

export const notificationIdParamSchema = z.object({
  id: z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
    message: 'Invalid notification identifier format'
  })
});
