import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICouponDoc extends Document {
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  minBookingAmount: number;
  maxDiscountAmount?: number;
  startsAt: Date;
  expiresAt?: Date | null;
  usageLimit: number;
  usageCount: number;
  isActive: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICouponDoc>(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },
    discountType: {
      type: String,
      enum: ['PERCENTAGE', 'FIXED'],
      required: true
    },
    discountValue: {
      type: Number,
      required: true,
      min: [0, 'Discount value cannot be negative']
    },
    minBookingAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    maxDiscountAmount: {
      type: Number,
      default: null
    },
    startsAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true
    },
    usageLimit: {
      type: Number,
      default: 1000
    },
    usageCount: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    description: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

couponSchema.index({ code: 1, isActive: 1 });

export const CouponModel: Model<ICouponDoc> =
  mongoose.models.Coupon || mongoose.model<ICouponDoc>('Coupon', couponSchema);

export default CouponModel;
