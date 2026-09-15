import { z } from 'zod';

export const vehicleCategoryEnum = z.enum([
  'CAR',
  'SUV',
  'SEDAN',
  'HATCHBACK',
  'BIKE',
  'SCOOTER',
  'EV',
  'LUXURY'
]);

export const recommendationQuerySchema = z.object({
  pickupAt: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'pickupAt must be a valid ISO date-time string'
    }),
  returnAt: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'returnAt must be a valid ISO date-time string'
    }),
  pickupLocation: z.string().trim().max(100).optional(),
  returnLocation: z.string().trim().max(100).optional(),
  passengers: z
    .union([z.number(), z.string()])
    .optional()
    .transform((val) => (val !== undefined ? Number(val) : undefined))
    .refine((val) => val === undefined || (Number.isInteger(val) && val >= 1 && val <= 12), {
      message: 'passengers must be an integer between 1 and 12'
    }),
  luggageCount: z
    .union([z.number(), z.string()])
    .optional()
    .transform((val) => (val !== undefined ? Number(val) : undefined))
    .refine((val) => val === undefined || (Number.isInteger(val) && val >= 0 && val <= 10), {
      message: 'luggageCount must be an integer between 0 and 10'
    }),
  budget: z
    .union([z.number(), z.string()])
    .optional()
    .transform((val) => (val !== undefined ? Number(val) : undefined))
    .refine((val) => val === undefined || (val >= 100 && val <= 1000000), {
      message: 'budget must be between ₹100 and ₹1,000,000'
    }),
  category: vehicleCategoryEnum.optional(),
  transmission: z.enum(['MANUAL', 'AUTOMATIC']).optional(),
  fuelType: z.enum(['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'MANUAL']).optional(),
  query: z.string().trim().max(500).optional(),
  limit: z
    .union([z.number(), z.string()])
    .optional()
    .transform((val) => (val !== undefined ? Math.min(20, Math.max(1, Number(val))) : 8))
});

export const userPreferencesBodySchema = z.object({
  preferredCategories: z.array(vehicleCategoryEnum).default([]),
  preferredTransmission: z.enum(['MANUAL', 'AUTOMATIC']).nullable().optional(),
  preferredFuelType: z.string().trim().max(30).optional(),
  preferredSeatCount: z.number().int().min(1).max(12).nullable().optional(),
  preferredPriceRange: z
    .object({
      min: z.number().min(0).optional(),
      max: z.number().min(0).optional()
    })
    .nullable()
    .optional(),
  preferredFeatures: z.array(z.string().trim().max(50)).default([]),
  preferredPickupLocations: z.array(z.string().trim().max(100)).default([])
});

export const recommendationEventBodySchema = z.object({
  sessionId: z.string().trim().max(100).optional(),
  eventType: z.enum([
    'VEHICLE_VIEWED',
    'VEHICLE_SEARCHED',
    'VEHICLE_SELECTED',
    'BOOKING_COMPLETED',
    'RECOMMENDATION_CLICKED'
  ]),
  vehicleId: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

export const recommendationFeedbackBodySchema = z.object({
  recommendationId: z.string().optional(),
  vehicleId: z.string().min(1, 'vehicleId is required'),
  helpful: z.boolean(),
  feedback: z.string().trim().max(500).optional()
});

export const recommendationChatBodySchema = z.object({
  message: z.string().trim().min(2, 'Message must be at least 2 characters').max(500),
  pickupAt: z.string().optional(),
  returnAt: z.string().optional(),
  passengers: z.number().int().min(1).max(12).optional(),
  category: vehicleCategoryEnum.optional(),
  budget: z.number().min(100).optional()
});
