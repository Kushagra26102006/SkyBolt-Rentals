import mongoose, { Schema, Document, Model } from 'mongoose';
import { IPayment, PaymentDTO } from '../types/payment.types.js';

export interface IPaymentDoc extends Omit<IPayment, '_id'>, Document {
  toDTO(): PaymentDTO;
}

const paymentSchema = new Schema<IPaymentDoc>(
  {
    paymentReference: {
      type: String,
      required: [true, 'Payment reference is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking reference is required'],
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true
    },
    provider: {
      type: String,
      enum: ['RAZORPAY'],
      default: 'RAZORPAY',
      required: true
    },
    providerOrderId: {
      type: String,
      required: [true, 'Provider order ID is required'],
      unique: true,
      trim: true,
      index: true
    },
    providerPaymentId: {
      type: String,
      trim: true,
      sparse: true,
      index: true
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Payment amount cannot be negative']
    },
    amountPaise: {
      type: Number,
      required: [true, 'Payment amount in paise is required'],
      min: [0, 'Payment amount in paise cannot be negative']
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      default: 'INR',
      uppercase: true,
      trim: true
    },
    status: {
      type: String,
      enum: {
        values: [
          'CREATED',
          'ORDER_CREATED',
          'PENDING',
          'AUTHORIZED',
          'CAPTURED',
          'FAILED',
          'CANCELLED',
          'REFUNDED',
          'PARTIALLY_REFUNDED'
        ],
        message: '{VALUE} is not a valid payment status'
      },
      default: 'ORDER_CREATED',
      required: true,
      index: true
    },
    method: {
      type: String,
      enum: ['card', 'upi', 'netbanking', 'wallet', 'other', 'unknown'],
      default: 'unknown'
    },
    signatureVerified: {
      type: Boolean,
      default: false
    },
    webhookVerified: {
      type: Boolean,
      default: false
    },
    failureCode: {
      type: String,
      default: null
    },
    failureReason: {
      type: String,
      default: null
    },
    providerRefundId: {
      type: String,
      trim: true
    },
    amountRefunded: {
      type: Number,
      default: 0
    },
    refundStatus: {
      type: String,
      enum: ['PENDING', 'PROCESSED', 'FAILED', null],
      default: null
    },
    refundedAt: {
      type: Date,
      default: null
    },
    refunds: {
      type: [
        {
          refundId: { type: String, required: true },
          amount: { type: Number, required: true },
          status: { type: String, required: true },
          receipt: { type: String, default: null },
          createdAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
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
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ bookingId: 1, status: 1 });
paymentSchema.index({ providerRefundId: 1 }, { sparse: true });

/**
 * Safe DTO projection for client consumption
 */
paymentSchema.methods.toDTO = function (): PaymentDTO {
  return {
    id: this._id.toString(),
    paymentReference: this.paymentReference,
    bookingId: this.bookingId.toString(),
    provider: this.provider,
    providerOrderId: this.providerOrderId,
    providerPaymentId: this.providerPaymentId || undefined,
    providerRefundId: this.providerRefundId || undefined,
    amount: this.amount,
    amountRefunded: this.amountRefunded || 0,
    refundStatus: this.refundStatus || undefined,
    currency: this.currency,
    status: this.status,
    method: this.method,
    signatureVerified: this.signatureVerified,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString()
  };
};

export const PaymentModel: Model<IPaymentDoc> =
  mongoose.models.Payment || mongoose.model<IPaymentDoc>('Payment', paymentSchema);

export default PaymentModel;
