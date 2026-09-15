import mongoose, { Schema, Document, Model } from 'mongoose';
import { baseSchemaOptions, softDeleteSchemaDefinition, ISoftDeletable } from './base.schema.js';
import { TransferDTO, TransferStatus } from '../types/fleet.types.js';

export interface IFleetTransfer {
  transferNumber: string;
  vehicleId: mongoose.Types.ObjectId;
  fromHubId: mongoose.Types.ObjectId;
  toHubId: mongoose.Types.ObjectId;
  initiatedBy: mongoose.Types.ObjectId;
  completedBy?: mongoose.Types.ObjectId;
  cancelledBy?: mongoose.Types.ObjectId;
  status: TransferStatus;
  reason?: string;
  notes?: string;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IFleetTransferDoc extends IFleetTransfer, ISoftDeletable, Document {
  id: string;
  toDTO(): TransferDTO;
}

const fleetTransferSchema = new Schema<IFleetTransferDoc>(
  {
    transferNumber: {
      type: String,
      required: [true, 'Transfer number is required'],
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
    fromHubId: {
      type: Schema.Types.ObjectId,
      ref: 'Hub',
      required: [true, 'Source hub is required'],
      index: true
    },
    toHubId: {
      type: Schema.Types.ObjectId,
      ref: 'Hub',
      required: [true, 'Destination hub is required'],
      index: true
    },
    initiatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Initiator staff/admin reference is required']
    },
    completedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'],
        message: '{VALUE} is not a valid transfer status'
      },
      default: 'PENDING',
      index: true
    },
    reason: {
      type: String,
      trim: true,
      default: ''
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    startedAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    },
    cancelledAt: {
      type: Date,
      default: null
    },
    ...softDeleteSchemaDefinition
  },
  {
    ...baseSchemaOptions
  }
);

// Query indexes for transfer monitoring
fleetTransferSchema.index({ vehicleId: 1, status: 1 });
fleetTransferSchema.index({ toHubId: 1, status: 1 });
fleetTransferSchema.index({ status: 1, createdAt: -1 });

fleetTransferSchema.methods.toDTO = function (): TransferDTO {
  return {
    id: this.id || String(this._id),
    transferNumber: this.transferNumber,
    vehicleId: String(this.vehicleId),
    fromHubId: String(this.fromHubId),
    toHubId: String(this.toHubId),
    initiatedBy: String(this.initiatedBy),
    completedBy: this.completedBy ? String(this.completedBy) : undefined,
    cancelledBy: this.cancelledBy ? String(this.cancelledBy) : undefined,
    status: this.status,
    reason: this.reason || '',
    notes: this.notes || '',
    startedAt: this.startedAt ? this.startedAt.toISOString() : undefined,
    completedAt: this.completedAt ? this.completedAt.toISOString() : undefined,
    cancelledAt: this.cancelledAt ? this.cancelledAt.toISOString() : undefined,
    createdAt: this.createdAt ? this.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: this.updatedAt ? this.updatedAt.toISOString() : new Date().toISOString()
  };
};

export const FleetTransferModel: Model<IFleetTransferDoc> =
  mongoose.models.FleetTransfer ||
  mongoose.model<IFleetTransferDoc>('FleetTransfer', fleetTransferSchema);

export default FleetTransferModel;
