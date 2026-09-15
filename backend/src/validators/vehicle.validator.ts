import { z } from 'zod';

const categoryEnum = z.enum([
  'CAR',
  'SUV',
  'SEDAN',
  'HATCHBACK',
  'BIKE',
  'SCOOTER',
  'EV',
  'LUXURY'
]);

const statusEnum = z.enum([
  'DRAFT',
  'ACTIVE',
  'INACTIVE',
  'MAINTENANCE',
  'RETIRED'
]);

const transmissionEnum = z.enum(['MANUAL', 'AUTOMATIC']);

const fuelTypeEnum = z.enum(['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'MANUAL']);

const sortEnum = z.enum([
  'price_asc',
  'price_desc',
  'rating_desc',
  'newest',
  'popular'
]);

export const listVehiclesQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z
    .string()
    .trim()
    .toUpperCase()
    .optional(),
  brand: z.string().trim().max(50).optional(),
  fuelType: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(fuelTypeEnum)
    .optional(),
  transmission: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(transmissionEnum)
    .optional(),
  minPrice: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val >= 0, {
      message: 'minPrice must be a non-negative number'
    })
    .optional(),
  maxPrice: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val >= 0, {
      message: 'maxPrice must be a non-negative number'
    })
    .optional(),
  seats: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'seats must be a positive integer'
    })
    .optional(),
  location: z.string().trim().max(100).optional(),
  status: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(statusEnum)
    .optional(),
  pickupAt: z.string().trim().optional(),
  returnAt: z.string().trim().optional(),
  sort: sortEnum.default('popular').optional(),
  page: z
    .string()
    .default('1')
    .transform((val) => Math.max(1, parseInt(val, 10) || 1))
    .optional(),
  limit: z
    .string()
    .default('20')
    .transform((val) => Math.min(100, Math.max(1, parseInt(val, 10) || 20)))
    .optional()
});

export const vehicleImageInputSchema = z.object({
  url: z.string().trim().min(1, 'Image URL cannot be empty'),
  thumbnailUrl: z.string().trim().optional(),
  altText: z.string().trim().optional(),
  isPrimary: z.boolean().default(false).optional(),
  sortOrder: z.number().int().default(0).optional()
});

export const createVehicleSchema = z
  .object({
    brand: z.string({ required_error: 'Brand is required' }).trim().min(1).max(50),
    model: z.string({ required_error: 'Model is required' }).trim().min(1).max(50),
    name: z.string({ required_error: 'Vehicle name is required' }).trim().min(1).max(100),
    variant: z.string().trim().max(50).optional(),
    year: z
      .number({ required_error: 'Year is required' })
      .int()
      .min(1990)
      .max(new Date().getFullYear() + 2),
    vehicleCode: z.string().trim().toUpperCase().max(30).optional(),
    registrationNumber: z.string().trim().toUpperCase().max(30).optional(),
    category: categoryEnum,
    status: statusEnum.default('ACTIVE').optional(),
    specifications: z.object({
      seats: z.number().int().min(1, 'At least 1 seat required'),
      doors: z.number().int().min(0).optional(),
      transmission: transmissionEnum,
      fuelType: fuelTypeEnum,
      engineCC: z.number().int().min(0).optional(),
      mileage: z.string().trim().optional(),
      luggageCapacity: z.number().int().min(0).optional()
    }),
    rental: z.object({
      baseRate: z.number().min(0, 'Base rate cannot be negative'),
      currency: z.string().trim().toUpperCase().default('INR').optional(),
      deposit: z.number().min(0).optional()
    }),
    location: z.object({
      name: z.string().trim().min(1, 'Location name is required'),
      city: z.string().trim().optional(),
      locationId: z.string().trim().optional()
    }),
    images: z.array(vehicleImageInputSchema).default([]).optional(),
    features: z.array(z.string().trim()).default([]).optional(),
    description: z.string().trim().max(2000).optional(),
    adminNotes: z.string().trim().max(1000).optional()
  })
  .strict({
    message: 'Unexpected fields provided. Mass assignment of privileged fields is rejected.'
  });

export const updateVehicleSchema = createVehicleSchema
  .partial()
  .strict({
    message: 'Unexpected fields provided. Protected fields cannot be modified.'
  });

export const vehicleIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Vehicle ID parameter is required')
});

export type ListVehiclesQueryInput = z.infer<typeof listVehiclesQuerySchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
