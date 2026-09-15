import mongoose, { Schema, Document, Model } from 'mongoose';
import { ISoftDeletable } from './base.schema.js';
import { IBooking, BookingDTO } from '../types/booking.types.js';

export interface IBookingDoc
  extends Omit<IBooking, '_id' | 'isDeleted' | 'deletedAt'>,
    ISoftDeletable,
    Document {
  toDTO(): BookingDTO;
}

const pricingSnapshotSchema = new Schema(
  {
    currency: { type: String, required: true, default: 'INR' },
    baseAmount: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, required: true, min: 0, default: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    fees: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    pricingVersion: { type: String, required: true, default: 'v1_base' }
  },
  { _id: false }
);

const vehicleSnapshotSchema = new Schema(
  {
    brand: { type: String, required: true },
    model: { type: String, required: true },
    variant: { type: String, default: '' },
    registrationNumber: { type: String, default: '' },
    image: { type: String, required: true },
    name: { type: String, required: true }
  },
  { _id: false }
);

const locationSnapshotSchema = new Schema(
  {
    locationId: { type: String, default: '' },
    name: { type: String, required: true },
    address: { type: String, default: '' }
  },
  { _id: false }
);

const statusHistorySchema = new Schema(
  {
    from: { type: String, default: null },
    to: { type: String, required: true },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: String, required: true },
    reason: { type: String, default: '' }
  },
  { _id: false }
);

const cancellationSchema = new Schema(
  {
    reason: {
      type: String,
      enum: ['CUSTOMER_REQUEST', 'OPERATIONAL', 'PAYMENT_TIMEOUT', 'SYSTEM', 'OTHER'],
      required: true
    },
    notes: { type: String, default: '' },
    cancelledAt: { type: Date, default: Date.now },
    cancelledBy: { type: String, required: true },
    refundAmount: { type: Number, default: 0 },
    refundStatus: {
      type: String,
      enum: ['NOT_APPLICABLE', 'PENDING', 'PROCESSED', 'FAILED'],
      default: 'NOT_APPLICABLE'
    },
    refundId: { type: String, default: null },
    refundFailureReason: { type: String, default: null },
    refundProcessedAt: { type: Date, default: null }
  },
  { _id: false }
);

const bookingSchema = new Schema<IBookingDoc>(
  {
    bookingReference: {
      type: String,
      required: [true, 'Booking reference is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true
    },
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: [true, 'Vehicle reference is required'],
      index: true
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    reservationId: {
      type: Schema.Types.ObjectId,
      ref: 'Reservation',
      default: null,
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
    pickupLocation: {
      type: locationSnapshotSchema,
      required: true
    },
    returnLocation: {
      type: locationSnapshotSchema,
      required: true
    },
    status: {
      type: String,
      enum: {
        values: [
          'DRAFT',
          'PENDING',
          'PAYMENT_PENDING',
          'CONFIRMED',
          'ACTIVE',
          'COMPLETED',
          'CANCELLED',
          'EXPIRED'
        ],
        message: '{VALUE} is not a valid booking status'
      },
      default: 'PENDING',
      required: true,
      index: true
    },
    paymentStatus: {
      type: String,
      enum: {
        values: [
          'UNPAID',
          'PENDING',
          'PAID',
          'FAILED',
          'REFUNDED',
          'PARTIALLY_REFUNDED'
        ],
        message: '{VALUE} is not a valid payment status'
      },
      default: 'UNPAID',
      required: true,
      index: true
    },
    pricingSnapshot: {
      type: pricingSnapshotSchema,
      required: true
    },
    vehicleSnapshot: {
      type: vehicleSnapshotSchema,
      required: true
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: []
    },
    cancellation: {
      type: cancellationSchema,
      default: null
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
 * Compound indexes for query performance
 */
// 1. High-frequency customer queries: user bookings sorted by recency or filtered by status
bookingSchema.index({ userId: 1, status: 1, createdAt: -1 });

// 2. Vehicle booking queries: vehicle reservations across intervals
bookingSchema.index({ vehicleId: 1, status: 1, pickupAt: 1, returnAt: 1 });

// 3. Operational status and recency index for Admin Overview & filtering
bookingSchema.index({ status: 1, createdAt: -1 });

// 4. Owner bookings queries
bookingSchema.index({ ownerId: 1, status: 1, createdAt: -1 });

/**
 * Safe DTO projection for client consumption
 */
bookingSchema.methods.toDTO = function (): BookingDTO {
  return {
    id: this._id.toString(),
    bookingReference: this.bookingReference,
    userId: this.userId.toString(),
    vehicleId: this.vehicleId.toString(),
    ownerId: this.ownerId ? this.ownerId.toString() : undefined,
    vehicle: {
      brand: this.vehicleSnapshot.brand,
      model: this.vehicleSnapshot.model,
      variant: this.vehicleSnapshot.variant || '',
      registrationNumber: this.vehicleSnapshot.registrationNumber || '',
      image: this.vehicleSnapshot.image,
      name: this.vehicleSnapshot.name
    },
    pickupAt: this.pickupAt.toISOString(),
    returnAt: this.returnAt.toISOString(),
    pickupLocation: {
      locationId: this.pickupLocation.locationId || '',
      name: this.pickupLocation.name,
      address: this.pickupLocation.address || ''
    },
    returnLocation: {
      locationId: this.returnLocation.locationId || '',
      name: this.returnLocation.name,
      address: this.returnLocation.address || ''
    },
    status: this.status,
    paymentStatus: this.paymentStatus,
    pricing: {
      currency: this.pricingSnapshot.currency,
      baseAmount: this.pricingSnapshot.baseAmount,
      subtotal: this.pricingSnapshot.subtotal,
      tax: this.pricingSnapshot.tax,
      discount: this.pricingSnapshot.discount,
      fees: this.pricingSnapshot.fees,
      total: this.pricingSnapshot.total,
      pricingVersion: this.pricingSnapshot.pricingVersion
    },
    cancellation: this.cancellation
      ? {
          reason: this.cancellation.reason,
          notes: this.cancellation.notes || '',
          cancelledAt: this.cancellation.cancelledAt.toISOString(),
          cancelledBy: this.cancellation.cancelledBy,
          refundAmount: this.cancellation.refundAmount,
          refundStatus: this.cancellation.refundStatus,
          refundId: this.cancellation.refundId || undefined,
          refundFailureReason: this.cancellation.refundFailureReason || undefined,
          refundProcessedAt: this.cancellation.refundProcessedAt
            ? this.cancellation.refundProcessedAt.toISOString()
            : undefined
        }
      : undefined,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString()
  };
};

export const BookingModel: Model<IBookingDoc> =
  mongoose.models.Booking || mongoose.model<IBookingDoc>('Booking', bookingSchema);

export default BookingModel;
