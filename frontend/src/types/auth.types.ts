/**
 * SkyBolt Rentals - React Authentication Types & DTOs
 */

export type UserRole = 'CUSTOMER' | 'STAFF' | 'FLEET_MANAGER' | 'ADMIN';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string;
  licenseNumber?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: UserDTO | null;
  error: string | null;
}

export interface RegisterCredentials {
  name: string;
  email: string;
  password: string;
  phone?: string;
  licenseNumber?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  name?: string;
  phone?: string;
  avatar?: string;
  licenseNumber?: string;
}
