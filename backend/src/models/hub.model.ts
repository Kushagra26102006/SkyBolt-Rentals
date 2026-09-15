import mongoose, { Schema, Document, Model } from 'mongoose';
import { baseSchemaOptions, softDeleteSchemaDefinition, ISoftDeletable } from './base.schema.js';
import { HubDTO, HubOperationalStatus, HubContact, HubCoordinates } from '../types/fleet.types.js';

export interface IHub {
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  coordinates?: HubCoordinates;
  capacity: number;
  currentVehicleCount: number;
  operationalStatus: HubOperationalStatus;
  contact?: HubContact;
  timezone: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IHubDoc extends IHub, ISoftDeletable, Document {
  id: string;
  toDTO(): HubDTO;
}

const hubContactSchema = new Schema<HubContact>(
  {
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    managerName: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const hubCoordinatesSchema = new Schema<HubCoordinates>(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },
  { _id: false }
);

const hubSchema = new Schema<IHubDoc>(
  {
    name: {
      type: String,
      required: [true, 'Hub facility name is required'],
      trim: true,
      maxlength: [100, 'Hub name cannot exceed 100 characters']
    },
    code: {
      type: String,
      required: [true, 'Hub code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    address: {
      type: String,
      required: [true, 'Hub address is required'],
      trim: true,
      maxlength: [200, 'Hub address cannot exceed 200 characters']
    },
    city: {
      type: String,
      required: [true, 'Hub city is required'],
      trim: true,
      index: true
    },
    state: {
      type: String,
      required: [true, 'Hub state is required'],
      trim: true
    },
    country: {
      type: String,
      default: 'India',
      trim: true
    },
    postalCode: {
      type: String,
      required: [true, 'Hub postal code is required'],
      trim: true
    },
    coordinates: {
      type: hubCoordinatesSchema,
      default: null
    },
    capacity: {
      type: Number,
      required: [true, 'Hub vehicle capacity is required'],
      min: [1, 'Capacity must be at least 1 vehicle']
    },
    currentVehicleCount: {
      type: Number,
      default: 0,
      min: [0, 'Current vehicle count cannot be negative']
    },
    operationalStatus: {
      type: String,
      enum: {
        values: ['ACTIVE', 'INACTIVE', 'TEMPORARILY_CLOSED'],
        message: '{VALUE} is not a valid hub operational status'
      },
      default: 'ACTIVE',
      index: true
    },
    contact: {
      type: hubContactSchema,
      default: () => ({})
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata',
      trim: true
    },
    ...softDeleteSchemaDefinition
  },
  {
    ...baseSchemaOptions
  }
);

// High-performance compound indexes for hub queries
hubSchema.index({ city: 1, operationalStatus: 1 });
hubSchema.index({ operationalStatus: 1, currentVehicleCount: 1 });

/**
 * Instance method: Safe Public/Internal Hub DTO
 */
hubSchema.methods.toDTO = function (): HubDTO {
  const availableCapacity = Math.max(0, this.capacity - (this.currentVehicleCount || 0));
  return {
    id: this.id || String(this._id),
    name: this.name,
    code: this.code,
    address: this.address,
    city: this.city,
    state: this.state,
    country: this.country,
    postalCode: this.postalCode,
    coordinates: this.coordinates
      ? { latitude: this.coordinates.latitude, longitude: this.coordinates.longitude }
      : undefined,
    capacity: this.capacity,
    currentVehicleCount: this.currentVehicleCount || 0,
    availableCapacity,
    operationalStatus: this.operationalStatus,
    contact: this.contact
      ? {
          phone: this.contact.phone || '',
          email: this.contact.email || '',
          managerName: this.contact.managerName || ''
        }
      : undefined,
    timezone: this.timezone || 'Asia/Kolkata',
    createdAt: this.createdAt ? this.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: this.updatedAt ? this.updatedAt.toISOString() : new Date().toISOString()
  };
};

export const HubModel: Model<IHubDoc> =
  mongoose.models.Hub || mongoose.model<IHubDoc>('Hub', hubSchema);

export default HubModel;
