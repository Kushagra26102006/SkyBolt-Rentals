import { z } from 'zod';

export const fleetStatusEnum = z.enum([
  'AVAILABLE',
  'RESERVED',
  'ACTIVE_RENTAL',
  'MAINTENANCE',
  'INSPECTION',
  'UNAVAILABLE',
  'TRANSFER_PENDING',
  'RETIRED'
]);

export const hubStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'TEMPORARILY_CLOSED']);

export const maintenanceTypeEnum = z.enum([
  'ROUTINE',
  'REPAIR',
  'EMERGENCY',
  'TIRE_CHANGE',
  'OIL_SERVICE',
  'INSPECTION_REMEDY',
  'OTHER'
]);

export const maintenancePriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const inspectionTypeEnum = z.enum([
  'PRE_RENTAL',
  'POST_RENTAL',
  'POST_MAINTENANCE',
  'ROUTINE',
  'ANNUAL'
]);

export const inspectionResultEnum = z.enum(['PASSED', 'FAILED', 'CONDITIONAL']);

export const idParamSchema = z.object({
  id: z.string().min(1, 'ID parameter is required')
});

export const createHubBodySchema = z.object({
  name: z.string().min(2, 'Hub name must be at least 2 characters').max(100),
  code: z
    .string()
    .min(2, 'Hub code must be at least 2 characters')
    .max(20)
    .regex(/^[A-Z0-9_-]+$/i, 'Hub code must be alphanumeric'),
  address: z.string().min(5, 'Address is required').max(200),
  city: z.string().min(2, 'City is required').max(50),
  state: z.string().min(2, 'State is required').max(50),
  country: z.string().optional().default('India'),
  postalCode: z.string().min(3, 'Postal code is required').max(20),
  capacity: z.number().int().min(1, 'Capacity must be at least 1 vehicle'),
  operationalStatus: hubStatusEnum.optional().default('ACTIVE'),
  coordinates: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180)
    })
    .optional(),
  contact: z
    .object({
      phone: z.string().optional(),
      email: z.string().email().optional(),
      managerName: z.string().optional()
    })
    .optional(),
  timezone: z.string().optional().default('Asia/Kolkata')
});

export const updateHubBodySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  address: z.string().min(5).max(200).optional(),
  city: z.string().min(2).max(50).optional(),
  state: z.string().min(2).max(50).optional(),
  country: z.string().optional(),
  postalCode: z.string().min(3).max(20).optional(),
  capacity: z.number().int().min(1).optional(),
  operationalStatus: hubStatusEnum.optional(),
  coordinates: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180)
    })
    .optional(),
  contact: z
    .object({
      phone: z.string().optional(),
      email: z.string().email().optional(),
      managerName: z.string().optional()
    })
    .optional(),
  timezone: z.string().optional()
});

export const hubQuerySchema = z.object({
  city: z.string().optional(),
  operationalStatus: hubStatusEnum.optional(),
  search: z.string().optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 20))
});

export const fleetQuerySchema = z.object({
  fleetStatus: fleetStatusEnum.optional(),
  hubId: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 20))
});

export const updateFleetStatusBodySchema = z.object({
  status: fleetStatusEnum,
  reason: z.string().max(300).optional(),
  notes: z.string().max(500).optional()
});

export const assignHubBodySchema = z.object({
  hubId: z.string().min(1, 'Target Hub ID is required')
});

export const createTransferBodySchema = z.object({
  toHubId: z.string().min(1, 'Destination Hub ID is required'),
  reason: z.string().max(300).optional(),
  notes: z.string().max(500).optional()
});

export const createMaintenanceBodySchema = z.object({
  type: maintenanceTypeEnum,
  description: z.string().min(3, 'Description is required').max(1000),
  priority: maintenancePriorityEnum.optional().default('MEDIUM'),
  scheduledAt: z.string().datetime({ offset: true }).or(z.string().min(10)).optional(),
  odometer: z.number().min(0).optional(),
  estimatedCost: z.number().min(0).optional(),
  serviceProvider: z.string().max(100).optional(),
  notes: z.string().max(500).optional()
});

export const completeMaintenanceBodySchema = z.object({
  odometer: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
  serviceProvider: z.string().max(100).optional(),
  notes: z.string().max(500).optional()
});

export const createInspectionBodySchema = z.object({
  inspectionType: inspectionTypeEnum,
  result: inspectionResultEnum,
  odometer: z.number().min(0, 'Odometer must be non-negative').optional(),
  notes: z.string().max(500).optional(),
  issues: z
    .array(
      z.object({
        item: z.string().min(1),
        severity: z.enum(['LOW', 'MEDIUM', 'CRITICAL']).default('MEDIUM'),
        notes: z.string().optional()
      })
    )
    .optional(),
  checklists: z
    .object({
      brakes: z.boolean().optional(),
      lights: z.boolean().optional(),
      tires: z.boolean().optional(),
      fluids: z.boolean().optional(),
      bodywork: z.boolean().optional(),
      documents: z.boolean().optional()
    })
    .optional()
});

export const pickupBookingBodySchema = z.object({
  odometer: z.number().min(0).optional(),
  notes: z.string().max(500).optional()
});

export const returnBookingBodySchema = z.object({
  odometer: z.number().min(0).optional(),
  returnHubId: z.string().optional(),
  notes: z.string().max(500).optional()
});
