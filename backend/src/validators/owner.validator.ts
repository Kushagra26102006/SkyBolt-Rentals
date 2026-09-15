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

const transmissionEnum = z.enum(['MANUAL', 'AUTOMATIC']);

const fuelTypeEnum = z.enum(['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'MANUAL']);

export const ownerVehicleImageSchema = z.object({
  url: z.string().trim().min(1, 'Image URL cannot be empty'),
  thumbnailUrl: z.string().trim().optional(),
  altText: z.string().trim().optional(),
  isPrimary: z.boolean().default(false).optional(),
  sortOrder: z.number().int().default(0).optional()
});

export const createOwnerVehicleSchema = z
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
    category: categoryEnum,
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
      baseRate: z.number().min(0, 'Rental base rate cannot be negative'),
      currency: z.string().trim().toUpperCase().default('INR').optional(),
      deposit: z.number().min(0).default(0).optional()
    }),
    location: z.object({
      name: z.string().trim().min(1, 'Location or pickup hub name is required'),
      city: z.string().trim().optional()
    }),
    images: z.array(ownerVehicleImageSchema).min(1, 'At least one vehicle image is required'),
    features: z.array(z.string().trim()).default([]).optional(),
    description: z.string().trim().max(2000).optional()
  })
  .strict({
    message: 'Unauthorized field provided. Ownership and approval status are managed securely by the server.'
  });

export const updateOwnerVehicleSchema = z
  .object({
    brand: z.string().trim().min(1).max(50).optional(),
    model: z.string().trim().min(1).max(50).optional(),
    name: z.string().trim().min(1).max(100).optional(),
    variant: z.string().trim().max(50).optional(),
    year: z
      .number()
      .int()
      .min(1990)
      .max(new Date().getFullYear() + 2)
      .optional(),
    category: categoryEnum.optional(),
    specifications: z
      .object({
        seats: z.number().int().min(1).optional(),
        doors: z.number().int().min(0).optional(),
        transmission: transmissionEnum.optional(),
        fuelType: fuelTypeEnum.optional(),
        engineCC: z.number().int().min(0).optional(),
        mileage: z.string().trim().optional(),
        luggageCapacity: z.number().int().min(0).optional()
      })
      .optional(),
    rental: z
      .object({
        baseRate: z.number().min(0).optional(),
        currency: z.string().trim().toUpperCase().optional(),
        deposit: z.number().min(0).optional()
      })
      .optional(),
    location: z
      .object({
        name: z.string().trim().min(1).optional(),
        city: z.string().trim().optional()
      })
      .optional(),
    images: z.array(ownerVehicleImageSchema).optional(),
    features: z.array(z.string().trim()).optional(),
    description: z.string().trim().max(2000).optional()
  })
  .strict({
    message: 'Unauthorized fields cannot be modified.'
  });

export const toggleOwnerVehicleStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE'], {
      required_error: 'Status must be ACTIVE or INACTIVE'
    })
  })
  .strict();

export type CreateOwnerVehicleInput = z.infer<typeof createOwnerVehicleSchema>;
export type UpdateOwnerVehicleInput = z.infer<typeof updateOwnerVehicleSchema>;
export type ToggleOwnerVehicleStatusInput = z.infer<typeof toggleOwnerVehicleStatusSchema>;
