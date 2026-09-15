import { z } from 'zod';

export const adminBookingQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z
    .enum(['PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'REFUNDED'])
    .optional(),
  paymentStatus: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
  vehicleId: z.string().optional(),
  hubId: z.string().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  sort: z
    .enum(['newest', 'oldest', 'pickup_soonest', 'pickup_latest', 'amount_high', 'amount_low'])
    .default('newest')
});

export const adminUserQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  role: z.enum(['CUSTOMER', 'OWNER', 'STAFF', 'FLEET_MANAGER', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'PENDING_VERIFICATION']).optional(),
  sort: z.enum(['newest', 'oldest', 'name_asc', 'name_desc']).default('newest')
});

export const updateUserRoleBodySchema = z.object({
  role: z.enum(['CUSTOMER', 'OWNER', 'STAFF', 'FLEET_MANAGER', 'ADMIN']),
  reason: z.string().trim().max(500).optional()
});

export const updateUserStatusBodySchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'PENDING_VERIFICATION']),
  reason: z.string().trim().max(500).optional()
});

export const vehicleApprovalBodySchema = z.object({
  status: z.enum(['ACTIVE', 'REJECTED', 'SUSPENDED'], {
    required_error: 'Status must be ACTIVE, REJECTED, or SUSPENDED'
  }),
  reason: z.string().trim().max(500).optional()
});

export const ownerVerificationBodySchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED'], {
    required_error: 'Verification status must be ACTIVE (approved) or SUSPENDED (rejected)'
  }),
  reason: z.string().trim().max(500).optional()
});

export const adminPaymentQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z
    .enum(['ORDER_CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED'])
    .optional(),
  sort: z.enum(['newest', 'oldest', 'amount_high', 'amount_low']).default('newest')
});

export const adminAuditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  entityType: z
    .enum(['VEHICLE', 'HUB', 'TRANSFER', 'MAINTENANCE', 'INSPECTION', 'BOOKING', 'USER', 'PAYMENT'])
    .optional(),
  entityId: z.string().optional(),
  actorId: z.string().optional(),
  action: z.string().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional()
});

export const adminMaintenanceQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  vehicleId: z.string().optional()
});

export const adminInspectionQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  result: z.enum(['PASSED', 'FAILED', 'CONDITIONAL']).optional(),
  type: z.enum(['ROUTINE', 'PRE_RENTAL', 'POST_RENTAL', 'DAMAGE']).optional(),
  vehicleId: z.string().optional()
});

export const adminTransferQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED']).optional(),
  fromHubId: z.string().optional(),
  toHubId: z.string().optional(),
  vehicleId: z.string().optional()
});
