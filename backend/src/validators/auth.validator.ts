import { z } from 'zod';

export const registerSchema = z.object({
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
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters'),
  phone: z
    .string()
    .trim()
    .max(25, 'Phone number cannot exceed 25 characters')
    .optional(),
  licenseNumber: z
    .string()
    .trim()
    .max(50, 'License number cannot exceed 50 characters')
    .optional(),
  role: z
    .enum(['CUSTOMER', 'OWNER'], {
      errorMap: () => ({ message: 'Role must be either CUSTOMER or OWNER. Privileged roles are prohibited.' })
    })
    .default('CUSTOMER')
    .optional(),
  city: z
    .string()
    .trim()
    .max(100, 'City cannot exceed 100 characters')
    .optional(),
  address: z
    .string()
    .trim()
    .max(200, 'Address cannot exceed 200 characters')
    .optional(),
  idVerificationNumber: z
    .string()
    .trim()
    .max(100, 'ID verification number cannot exceed 100 characters')
    .optional()
}).strict({
  message: 'Unexpected fields provided. Mass assignment of privileged fields is rejected.'
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Invalid email address format'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password cannot be empty')
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z
    .string({ required_error: 'Current password is required' })
    .min(1, 'Current password cannot be empty'),
  newPassword: z
    .string({ required_error: 'New password is required' })
    .min(8, 'New password must be at least 8 characters long')
    .max(128, 'New password cannot exceed 128 characters')
}).strict();

export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Invalid email address format')
}).strict();

export const resetPasswordSchema = z.object({
  token: z
    .string({ required_error: 'Reset token is required' })
    .min(10, 'Invalid reset token format'),
  newPassword: z
    .string({ required_error: 'New password is required' })
    .min(8, 'New password must be at least 8 characters long')
    .max(128, 'New password cannot exceed 128 characters')
}).strict();

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .optional(),
  phone: z
    .string()
    .trim()
    .max(25, 'Phone number cannot exceed 25 characters')
    .optional(),
  avatar: z
    .string()
    .trim()
    .max(500, 'Avatar URL cannot exceed 500 characters')
    .optional(),
  licenseNumber: z
    .string()
    .trim()
    .max(50, 'License number cannot exceed 50 characters')
    .optional(),
  city: z
    .string()
    .trim()
    .max(100, 'City cannot exceed 100 characters')
    .optional(),
  address: z
    .string()
    .trim()
    .max(200, 'Address cannot exceed 200 characters')
    .optional()
}).strict({
  message: 'Only profile details (name, phone, avatar, licenseNumber, city, address) may be modified. Role, status, and credentials cannot be altered.'
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
