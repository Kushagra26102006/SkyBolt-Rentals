import { Schema, model, Document, Types } from 'mongoose';
import { baseSchemaOptions, softDeleteSchemaDefinition, ISoftDeletable } from './base.schema.js';
import {
  VehicleCategory,
  VehicleStatus,
  FleetStatus,
  VehicleDTO,
  AdminVehicleDTO,
  VehicleSpecifications,
  VehicleRental,
  VehicleLocation,
  VehicleImage,
  VehicleRating
} from '../types/vehicle.types.js';

export interface IActiveReservation {
  reservationId: Types.ObjectId;
  userId: Types.ObjectId;
  pickupAt: Date;
  returnAt: Date;
  status: 'HELD' | 'CONFIRMED' | 'ACTIVE';
  expiresAt?: Date | null;
}

export interface IVehicle {
  brand: string;
  model: string;
  name: string;
  variant?: string;
  year: number;
  vehicleCode: string;
  registrationNumber?: string;
  category: VehicleCategory;
  status: VehicleStatus;
  ownerId?: Types.ObjectId | string | null;
  fleetStatus?: FleetStatus;
  currentHubId?: Types.ObjectId | string | null;
  vin?: string;
  odometer?: number;
  activeBookingId?: Types.ObjectId | string | null;
  activeReservations?: IActiveReservation[];
  maintenanceState?: {
    inMaintenance: boolean;
    currentMaintenanceId?: Types.ObjectId | string | null;
    lastServicedAt?: Date | null;
    nextServiceOdometer?: number;
  };
  inspectionState?: {
    lastInspectionResult?: 'PASSED' | 'FAILED' | 'CONDITIONAL' | null;
    lastInspectedAt?: Date | null;
    lastInspectionId?: Types.ObjectId | string | null;
  };
  specifications: VehicleSpecifications;
  rental: VehicleRental;
  location: VehicleLocation;
  images: VehicleImage[];
  features: string[];
  description?: string;
  rating: VehicleRating;
  adminNotes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IVehicleDoc extends IVehicle, ISoftDeletable, Omit<Document, 'model'> {
  id: string;
  toSafeDTO(): VehicleDTO;
  toAdminDTO(): AdminVehicleDTO;
}

const vehicleImageSchema = new Schema<VehicleImage>(
  {
    url: { type: String, required: true, trim: true },
    thumbnailUrl: { type: String, trim: true, default: '' },
    altText: { type: String, trim: true, default: '' },
    isPrimary: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 }
  },
  { _id: false }
);

const vehicleSpecificationsSchema = new Schema<VehicleSpecifications>(
  {
    seats: { type: Number, required: true, min: [1, 'Vehicle must have at least 1 seat'] },
    doors: { type: Number, min: 0 },
    transmission: {
      type: String,
      enum: ['MANUAL', 'AUTOMATIC'],
      required: true
    },
    fuelType: {
      type: String,
      enum: ['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'MANUAL'],
      required: true
    },
    engineCC: { type: Number, min: 0 },
    mileage: { type: String, trim: true },
    luggageCapacity: { type: Number, min: 0 }
  },
  { _id: false }
);

const vehicleRentalSchema = new Schema<VehicleRental>(
  {
    baseRate: {
      type: Number,
      required: true,
      min: [0, 'Base rental rate cannot be negative']
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
      uppercase: true
    },
    deposit: { type: Number, min: 0, default: 0 }
  },
  { _id: false }
);

const vehicleLocationSchema = new Schema<VehicleLocation>(
  {
    name: { type: String, required: true, trim: true },
    city: { type: String, trim: true, default: '' },
    locationId: { type: String, trim: true }
  },
  { _id: false }
);

const vehicleRatingSchema = new Schema<VehicleRating>(
  {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const activeReservationSchema = new Schema(
  {
    reservationId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    pickupAt: { type: Date, required: true },
    returnAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['HELD', 'CONFIRMED', 'ACTIVE'],
      required: true
    },
    expiresAt: { type: Date, default: null }
  },
  { _id: false }
);

const vehicleSchema = new Schema<IVehicleDoc>(
  {
    brand: {
      type: String,
      required: [true, 'Brand is required'],
      trim: true,
      maxlength: [50, 'Brand cannot exceed 50 characters']
    },
    model: {
      type: String,
      required: [true, 'Model is required'],
      trim: true,
      maxlength: [50, 'Model cannot exceed 50 characters']
    },
    name: {
      type: String,
      required: [true, 'Vehicle name is required'],
      trim: true,
      maxlength: [100, 'Vehicle name cannot exceed 100 characters']
    },
    variant: {
      type: String,
      trim: true,
      maxlength: [50, 'Variant cannot exceed 50 characters']
    },
    year: {
      type: Number,
      required: [true, 'Model year is required'],
      min: [1990, 'Year must be 1990 or later'],
      max: [new Date().getFullYear() + 2, 'Year cannot be in distant future']
    },
    vehicleCode: {
      type: String,
      required: [true, 'Unique vehicle identifier code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    registrationNumber: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
      select: false // Sensitive fleet operational data - hidden by default from public queries
    },
    category: {
      type: String,
      enum: {
        values: ['CAR', 'SUV', 'SEDAN', 'HATCHBACK', 'BIKE', 'SCOOTER', 'EV', 'LUXURY'],
        message: '{VALUE} is not a valid vehicle category'
      },
      required: true,
      uppercase: true,
      index: true
    },
    status: {
      type: String,
      enum: {
        values: ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'REJECTED', 'SUSPENDED', 'MAINTENANCE', 'RETIRED'],
        message: '{VALUE} is not a valid vehicle status'
      },
      default: 'ACTIVE',
      uppercase: true,
      index: true
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    fleetStatus: {
      type: String,
      enum: {
        values: [
          'AVAILABLE',
          'RESERVED',
          'ACTIVE_RENTAL',
          'MAINTENANCE',
          'INSPECTION',
          'UNAVAILABLE',
          'TRANSFER_PENDING',
          'RETIRED'
        ],
        message: '{VALUE} is not a valid fleet status'
      },
      default: 'AVAILABLE',
      uppercase: true,
      index: true
    },
    currentHubId: {
      type: Schema.Types.ObjectId,
      ref: 'Hub',
      default: null,
      index: true
    },
    vin: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      select: false
    },
    odometer: {
      type: Number,
      min: [0, 'Odometer cannot be negative'],
      default: 0
    },
    activeBookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking'
    },
    maintenanceState: {
      inMaintenance: { type: Boolean, default: false },
      currentMaintenanceId: { type: Schema.Types.ObjectId, ref: 'Maintenance', default: null },
      lastServicedAt: { type: Date, default: null },
      nextServiceOdometer: { type: Number, default: 0 }
    },
    inspectionState: {
      lastInspectionResult: {
        type: String,
        enum: ['PASSED', 'FAILED', 'CONDITIONAL', null],
        default: null
      },
      lastInspectedAt: { type: Date, default: null },
      lastInspectionId: { type: Schema.Types.ObjectId, ref: 'Inspection', default: null }
    },
    specifications: {
      type: vehicleSpecificationsSchema,
      required: true
    },
    rental: {
      type: vehicleRentalSchema,
      required: true
    },
    location: {
      type: vehicleLocationSchema,
      required: true
    },
    images: {
      type: [vehicleImageSchema],
      default: []
    },
    features: {
      type: [String],
      default: []
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters']
    },
    rating: {
      type: vehicleRatingSchema,
      default: () => ({ average: 0, count: 0 })
    },
    adminNotes: {
      type: String,
      trim: true,
      select: false
    },
    activeReservations: {
      type: [activeReservationSchema],
      default: []
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
        delete ret['registrationNumber'];
        delete ret['vin'];
        delete ret['adminNotes'];
        delete ret['activeReservations'];
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
        delete ret['registrationNumber'];
        delete ret['vin'];
        delete ret['adminNotes'];
        delete ret['activeReservations'];
        return ret;
      }
    }
  }
);

// ----------------------------------------------------------------------------
// COMPOUND INDEXES FOR CATALOG SEARCH & QUERY OPTIMIZATION
// ----------------------------------------------------------------------------
// 1. Primary catalog browsing query: Category + Status + Price
vehicleSchema.index({ category: 1, status: 1, 'rental.baseRate': 1 });

// 2. Hub / Location availability query: Location Name + Status
vehicleSchema.index({ 'location.name': 1, status: 1 });

// 3. Rating sorting query: Status + Rating Average
vehicleSchema.index({ status: 1, 'rating.average': -1 });

// 4. Text search compound index across brand, model, and name
vehicleSchema.index({ name: 'text', brand: 'text', model: 'text' });

// 5. Fleet Operational Indexes
vehicleSchema.index({ currentHubId: 1, fleetStatus: 1 });
vehicleSchema.index({ fleetStatus: 1, isDeleted: 1 });

// 6. Active interval concurrency indexes
vehicleSchema.index({ 'activeReservations.pickupAt': 1, 'activeReservations.returnAt': 1 });
vehicleSchema.index({ 'activeReservations.reservationId': 1 });

/**
 * Instance method: Safe Public DTO
 */
vehicleSchema.methods.toSafeDTO = function (): VehicleDTO {
  return {
    id: this.id || String(this._id),
    vehicleCode: this.vehicleCode,
    brand: this.brand,
    model: this.model,
    name: this.name,
    variant: this.variant || '',
    year: this.year,
    category: this.category,
    status: this.status,
    ownerId: this.ownerId ? String(this.ownerId) : undefined,
    fleetStatus:
      this.fleetStatus ||
      (this.status === 'MAINTENANCE' ? 'MAINTENANCE' : this.status === 'RETIRED' ? 'RETIRED' : 'AVAILABLE'),
    currentHubId: this.currentHubId ? String(this.currentHubId) : undefined,
    specifications: this.specifications,
    rental: this.rental,
    location: this.location,
    images: this.images || [],
    features: this.features || [],
    description: this.description || '',
    rating: this.rating || { average: 0, count: 0 },
    createdAt: this.createdAt ? this.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: this.updatedAt ? this.updatedAt.toISOString() : new Date().toISOString()
  };
};

/**
 * Instance method: Admin / Fleet Manager DTO (Includes sensitive operational fields)
 */
vehicleSchema.methods.toAdminDTO = function (): AdminVehicleDTO {
  const safe = this.toSafeDTO();
  return {
    ...safe,
    ...(this.registrationNumber ? { registrationNumber: this.registrationNumber } : {}),
    ...(this.adminNotes ? { adminNotes: this.adminNotes } : {}),
    ...(this.vin ? { vin: this.vin } : {}),
    odometer: this.odometer || 0,
    ...(this.activeBookingId ? { activeBookingId: String(this.activeBookingId) } : {}),
    ...(this.maintenanceState
      ? {
          maintenanceState: {
            inMaintenance: Boolean(this.maintenanceState.inMaintenance),
            currentMaintenanceId: this.maintenanceState.currentMaintenanceId
              ? String(this.maintenanceState.currentMaintenanceId)
              : undefined,
            lastServicedAt: this.maintenanceState.lastServicedAt
              ? this.maintenanceState.lastServicedAt.toISOString()
              : undefined,
            nextServiceOdometer: this.maintenanceState.nextServiceOdometer || 0
          }
        }
      : {}),
    ...(this.inspectionState
      ? {
          inspectionState: {
            lastInspectionResult: this.inspectionState.lastInspectionResult || undefined,
            lastInspectedAt: this.inspectionState.lastInspectedAt
              ? this.inspectionState.lastInspectedAt.toISOString()
              : undefined,
            lastInspectionId: this.inspectionState.lastInspectionId
              ? String(this.inspectionState.lastInspectionId)
              : undefined
          }
        }
      : {})
  };
};

/**
 * Standalone public serializer helper
 */
export function toSafeVehicle(doc: Partial<IVehicleDoc> & { _id?: unknown; id?: string; ownerId?: any }): VehicleDTO {
  const id = doc.id || (doc._id ? String(doc._id) : '');
  return {
    id,
    vehicleCode: doc.vehicleCode || '',
    brand: doc.brand || '',
    model: doc.model || '',
    name: doc.name || '',
    variant: doc.variant || '',
    year: doc.year || 2024,
    category: doc.category || 'CAR',
    status: doc.status || 'ACTIVE',
    ownerId: doc.ownerId ? String(doc.ownerId) : undefined,
    fleetStatus:
      doc.fleetStatus ||
      (doc.status === 'MAINTENANCE' ? 'MAINTENANCE' : doc.status === 'RETIRED' ? 'RETIRED' : 'AVAILABLE'),
    currentHubId: doc.currentHubId ? String(doc.currentHubId) : undefined,
    specifications: doc.specifications || {
      seats: 4,
      transmission: 'AUTOMATIC',
      fuelType: 'PETROL'
    },
    rental: doc.rental || {
      baseRate: 0,
      currency: 'INR'
    },
    location: doc.location || {
      name: 'Central Hub'
    },
    images: doc.images || [],
    features: doc.features || [],
    description: doc.description || '',
    rating: doc.rating || { average: 0, count: 0 },
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : (doc.createdAt || new Date().toISOString()),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : (doc.updatedAt || new Date().toISOString())
  };
}

/**
 * Standalone admin serializer helper
 */
export function toAdminVehicle(doc: Partial<IVehicleDoc> & { _id?: unknown; id?: string }): AdminVehicleDTO {
  const safe = toSafeVehicle(doc);
  return {
    ...safe,
    ...(doc.registrationNumber ? { registrationNumber: doc.registrationNumber } : {}),
    ...(doc.adminNotes ? { adminNotes: doc.adminNotes } : {}),
    ...(doc.vin ? { vin: doc.vin } : {}),
    odometer: doc.odometer || 0,
    ...(doc.activeBookingId ? { activeBookingId: String(doc.activeBookingId) } : {})
  };
}

export const VehicleModel = model<IVehicleDoc>('Vehicle', vehicleSchema);

