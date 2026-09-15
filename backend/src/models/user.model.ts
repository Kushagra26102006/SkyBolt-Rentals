import { Schema, model, Document } from 'mongoose';
import { baseSchemaOptions, softDeleteSchemaDefinition, ISoftDeletable } from './base.schema.js';
import { UserRole, UserStatus, UserDTO } from '../types/auth.types.js';

export interface IUser {
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string;
  licenseNumber?: string;
  city?: string;
  address?: string;
  idVerificationNumber?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  notificationPreferences?: import('../notifications/notification.types.js').INotificationPreferences;
  lastLoginAt?: Date;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
  emailVerificationTokenHash?: string;
  emailVerificationExpiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserDoc extends IUser, ISoftDeletable, Document {
  id: string;
  toSafeDTO(): UserDTO;
}

const userSchema = new Schema<IUserDoc>(
  {
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
      maxlength: [100, 'User name cannot exceed 100 characters']
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      maxlength: [254, 'Email address cannot exceed 254 characters']
    },
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false // Never returned in default queries
    },
    role: {
      type: String,
      enum: {
        values: ['CUSTOMER', 'OWNER', 'STAFF', 'FLEET_MANAGER', 'ADMIN'],
        message: '{VALUE} is not a valid role'
      },
      default: 'CUSTOMER',
      index: true
    },
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'PENDING_VERIFICATION'],
        message: '{VALUE} is not a valid account status'
      },
      default: 'ACTIVE',
      index: true
    },
    avatar: {
      type: String,
      trim: true,
      default: ''
    },
    licenseNumber: {
      type: String,
      trim: true,
      default: ''
    },
    city: {
      type: String,
      trim: true,
      default: ''
    },
    address: {
      type: String,
      trim: true,
      default: ''
    },
    idVerificationNumber: {
      type: String,
      trim: true,
      default: ''
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    phoneVerified: {
      type: Boolean,
      default: false
    },
    notificationPreferences: {
      emailBookingUpdates: { type: Boolean, default: true },
      emailPaymentUpdates: { type: Boolean, default: true },
      smsBookingUpdates: { type: Boolean, default: true },
      smsPaymentUpdates: { type: Boolean, default: true },
      marketingEmail: { type: Boolean, default: false },
      marketingSms: { type: Boolean, default: false }
    },
    lastLoginAt: {
      type: Date,
      default: null
    },
    passwordResetTokenHash: {
      type: String,
      select: false,
      default: null
    },
    passwordResetExpiresAt: {
      type: Date,
      default: null
    },
    emailVerificationTokenHash: {
      type: String,
      select: false,
      default: null
    },
    emailVerificationExpiresAt: {
      type: Date,
      default: null
    },
    ...softDeleteSchemaDefinition
  },
  {
    ...baseSchemaOptions,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret['_id']) {
          ret['id'] = String(ret['_id']);
        }
        delete ret['_id'];
        delete ret['__v'];
        delete ret['passwordHash'];
        delete ret['passwordResetTokenHash'];
        delete ret['emailVerificationTokenHash'];
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret['_id']) {
          ret['id'] = String(ret['_id']);
        }
        delete ret['_id'];
        delete ret['__v'];
        delete ret['passwordHash'];
        delete ret['passwordResetTokenHash'];
        delete ret['emailVerificationTokenHash'];
        return ret;
      }
    }
  }
);

userSchema.index({ role: 1, status: 1, createdAt: -1 });

/**
 * Instance method to produce guaranteed safe user DTO
 */
userSchema.methods.toSafeDTO = function (): UserDTO {
  return {
    id: this.id || String(this._id),
    name: this.name,
    email: this.email,
    phone: this.phone || '',
    role: this.role,
    status: this.status,
    avatar: this.avatar || '',
    licenseNumber: this.licenseNumber || '',
    city: this.city || '',
    address: this.address || '',
    idVerificationNumber: this.idVerificationNumber || '',
    emailVerified: Boolean(this.emailVerified),
    phoneVerified: Boolean(this.phoneVerified),
    notificationPreferences: this.notificationPreferences || {
      emailBookingUpdates: true,
      emailPaymentUpdates: true,
      smsBookingUpdates: true,
      smsPaymentUpdates: true,
      marketingEmail: false,
      marketingSms: false
    },
    createdAt: this.createdAt ? this.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: this.updatedAt ? this.updatedAt.toISOString() : new Date().toISOString(),
    ...(this.lastLoginAt ? { lastLoginAt: this.lastLoginAt.toISOString() } : {})
  };
};

/**
 * Standalone helper to serialize any user document or plain object to safe DTO
 */
export function toSafeUser(user: Partial<IUserDoc> & { _id?: unknown; id?: string }): UserDTO {
  const id = user.id || (user._id ? String(user._id) : '');
  return {
    id,
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    role: user.role || 'CUSTOMER',
    status: user.status || 'ACTIVE',
    avatar: user.avatar || '',
    licenseNumber: user.licenseNumber || '',
    city: user.city || '',
    address: user.address || '',
    idVerificationNumber: user.idVerificationNumber || '',
    emailVerified: Boolean(user.emailVerified),
    phoneVerified: Boolean(user.phoneVerified),
    notificationPreferences: user.notificationPreferences || {
      emailBookingUpdates: true,
      emailPaymentUpdates: true,
      smsBookingUpdates: true,
      smsPaymentUpdates: true,
      marketingEmail: false,
      marketingSms: false
    },
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : (user.createdAt || new Date().toISOString()),
    updatedAt: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : (user.updatedAt || new Date().toISOString()),
    ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt instanceof Date ? user.lastLoginAt.toISOString() : String(user.lastLoginAt) } : {})
  };
}

export const UserModel = model<IUserDoc>('User', userSchema);
