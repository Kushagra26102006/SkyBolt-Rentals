import { INotificationPreferences } from '../notifications/notification.types.js';

export type UserRole = 'CUSTOMER' | 'OWNER' | 'STAFF' | 'FLEET_MANAGER' | 'ADMIN';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' | 'PENDING_VERIFICATION';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string;
  licenseNumber?: string;
  city?: string;
  address?: string;
  idVerificationNumber?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  notificationPreferences?: INotificationPreferences;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string;
  licenseNumber?: string;
  city?: string;
  address?: string;
  idVerificationNumber?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  notificationPreferences?: INotificationPreferences;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface AuthJwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
