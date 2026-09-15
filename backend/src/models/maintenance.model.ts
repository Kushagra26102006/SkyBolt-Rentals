import mongoose, { Schema, Document, Model } from 'mongoose';
import { baseSchemaOptions, softDeleteSchemaDefinition, ISoftDeletable } from './base.schema.js';
import {
  MaintenanceDTO,
  MaintenanceType,
  MaintenanceStatus,
  MaintenancePriority
} from '../types/fleet.types.js';

export interface IMaintenance {
  maintenanceNumber: string;
  vehicleId: mongoose.Types.ObjectId;
  type: MaintenanceType;
  description: string;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  odometer?: number;
  cost?: number;
  serviceProvider?: string;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  completedBy?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IMaintenanceDoc extends IMaintenance, ISoftDeletable, Document {
  id: string;
  toDTO(): MaintenanceDTO;
}

const maintenanceSchema = new Schema<IMaintenanceDoc>(
  {
    maintenanceNumber: {
      type: String,
      required: [true, 'Maintenance reference number is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: [true, 'Vehicle reference is required'],
      index: true
    },
    type: {
      type: String,
      enum: {
        values: [
          'ROUTINE',
          'REPAIR',
          'EMERGENCY',
          'TIRE_CHANGE',
          'OIL_SERVICE',
          'INSPECTION_REMEDY',
          'OTHER'
        ],
        message: '{VALUE} is not a valid maintenance type'
      },
      required: true
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    status: {
      type: String,
      enum: {
        values: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
        message: '{VALUE} is not a valid maintenance status'
      },
      default: 'SCHEDULED',
      index: true
    },
    priority: {
      type: String,
      enum: {
        values: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        message: '{VALUE} is not a valid priority level'
      },
      default: 'MEDIUM'
    },
    scheduledAt: {
      type: Date,
      required: [true, 'Scheduled service date is required'],
      index: true
    },
    startedAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    },
    odometer: {
      type: Number,
      min: [0, 'Odometer cannot be negative'],
      default: 0
    },
    cost: {
      type: Number,
      min: [0, 'Maintenance cost cannot be negative'],
      default: 0
    },
    serviceProvider: {
      type: String,
      trim: true,
      default: ''
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    completedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    ...softDeleteSchemaDefinition
  },
  {
    ...baseSchemaOptions
  }
);

maintenanceSchema.index({ vehicleId: 1, status: 1, scheduledAt: -1 });
maintenanceSchema.index({ status: 1, scheduledAt: 1 });
maintenanceSchema.index({ status: 1, startedAt: 1 });

maintenanceSchema.methods.toDTO = function (): MaintenanceDTO {
  return {
    id: this.id || String(this._id),
    maintenanceNumber: this.maintenanceNumber,
    vehicleId: String(this.vehicleId),
    type: this.type,
    description: this.description,
    status: this.status,
    priority: this.priority,
    scheduledAt: this.scheduledAt.toISOString(),
    startedAt: this.startedAt ? this.startedAt.toISOString() : undefined,
    completedAt: this.completedAt ? this.completedAt.toISOString() : undefined,
    odometer: this.odometer,
    cost: this.cost,
    serviceProvider: this.serviceProvider || '',
    notes: this.notes || '',
    createdBy: String(this.createdBy),
    completedBy: this.completedBy ? String(this.completedBy) : undefined,
    createdAt: this.createdAt ? this.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: this.updatedAt ? this.updatedAt.toISOString() : new Date().toISOString()
  };
};

export const MaintenanceModel: Model<IMaintenanceDoc> =
  mongoose.models.Maintenance ||
  mongoose.model<IMaintenanceDoc>('Maintenance', maintenanceSchema);

export default MaintenanceModel;
