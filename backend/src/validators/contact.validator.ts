import { z } from 'zod';

export const submitContactSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters'),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Invalid email address format')
    .max(254, 'Email cannot exceed 254 characters'),
  phone: z
    .string()
    .trim()
    .max(25, 'Phone number cannot exceed 25 characters')
    .optional(),
  subject: z
    .string()
    .trim()
    .min(2, 'Subject must be at least 2 characters')
    .max(100, 'Subject cannot exceed 100 characters')
    .default('general'),
  message: z
    .string({ required_error: 'Message is required' })
    .trim()
    .min(5, 'Message must be at least 5 characters')
    .max(5000, 'Message cannot exceed 5000 characters')
}).strict({
  message: 'Unexpected fields provided.'
});

export type SubmitContactInput = z.infer<typeof submitContactSchema>;
