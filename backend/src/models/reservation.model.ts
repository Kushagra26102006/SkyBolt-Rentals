import mongoose, { Schema, Document, Model } from 'mongoose';
import { ISoftDeletable } from './base.schema.js';
import {
  IReservation,
  InventoryHoldDTO,
  ReservationDTO
} from '../types/reservation.types.js';

export interface IReservationDoc
  extends Omit<IReservation, '_id' | 'isDeleted' | 'deletedAt'>,
    ISoftDeletable,
    Document {
  toHoldDTO(): InventoryHoldDTO;
  toReservationDTO(): ReservationDTO;
}

const reservationSchema = new Schema<IReservationDoc>(
  {
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: [true, 'Vehicle reference is required'],
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true
    },
    pickupAt: {
      type: Date,
      required: [true, 'Pickup timestamp is required'],
      index: true
    },
    returnAt: {
      type: Date,
      required: [true, 'Return timestamp is required'],
      index: true
    },
    status: {
      type: String,
      enum: {
        values: ['HELD', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED'],
        message: '{VALUE} is not a valid reservation status'
      },
      default: 'HELD',
      required: true,
      index: true
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true
    },
    holdToken: {
      type: String,
      trim: true,
      sparse: true,
      unique: true
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, any>) => {
        delete ret.__v;
        return ret;
      }
    }
  }
);

/**
 * High-performance compound indexes for interval queries and locking
 */
// 1. Primary interval overlap lookup index: filters active/held reservations per vehicle
reservationSchema.index({ vehicleId: 1, status: 1, pickupAt: 1, returnAt: 1 });

// 2. Index for filtering active holds by expiration
reservationSchema.index({ status: 1, expiresAt: 1 });

// 3. User reservation history index
reservationSchema.index({ userId: 1, status: 1 });

/**
 * Instance serialization methods
 */
reservationSchema.methods.toHoldDTO = function (): InventoryHoldDTO {
  return {
    id: this._id.toString(),
    holdToken: this.holdToken || '',
    vehicleId: this.vehicleId.toString(),
    userId: this.userId.toString(),
    pickupAt: this.pickupAt.toISOString(),
    returnAt: this.returnAt.toISOString(),
    expiresAt: this.expiresAt ? this.expiresAt.toISOString() : '',
    status: this.status,
    createdAt: this.createdAt.toISOString()
  };
};

reservationSchema.methods.toReservationDTO = function (): ReservationDTO {
  return {
    id: this._id.toString(),
    vehicleId: this.vehicleId.toString(),
    userId: this.userId.toString(),
    pickupAt: this.pickupAt.toISOString(),
    returnAt: this.returnAt.toISOString(),
    status: this.status,
    expiresAt: this.expiresAt ? this.expiresAt.toISOString() : null,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString()
  };
};

export const ReservationModel: Model<IReservationDoc> =
  mongoose.models.Reservation ||
  mongoose.model<IReservationDoc>('Reservation', reservationSchema);

export default ReservationModel;
