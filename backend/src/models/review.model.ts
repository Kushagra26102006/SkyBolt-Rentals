import mongoose, { Schema, Document, Types, Model } from 'mongoose';
import {
  ReviewStatus,
  ReviewVerificationStatus,
  ReviewModerationStatus,
  ReviewDTO,
  AdminReviewDTO,
  ReviewAuthorDTO
} from '../reviews/review.types.js';

export interface IReview {
  userId: Types.ObjectId | string;
  bookingId: Types.ObjectId | string;
  vehicleId: Types.ObjectId | string;
  rating: number;
  title: string;
  comment: string;
  status: ReviewStatus;
  verificationStatus: ReviewVerificationStatus;
  moderationStatus: ReviewModerationStatus;
  helpfulCount: number;
  reportedCount: number;
  publishedAt: Date;
  editedAt?: Date | null;
  rejectionReason?: string | null;
  moderatedBy?: Types.ObjectId | string | null;
  moderatedAt?: Date | null;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReviewDoc extends IReview, Document {
  id: string;
  toSafeDTO(author?: ReviewAuthorDTO, userHasVotedHelpful?: boolean): ReviewDTO;
  toAdminDTO(author?: ReviewAuthorDTO): AdminReviewDTO;
}

const reviewSchema = new Schema<IReviewDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking ID is required'],
      index: true
    },
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: [true, 'Vehicle ID is required'],
      index: true
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating cannot be less than 1'],
      max: [5, 'Rating cannot be greater than 5'],
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be an integer between 1 and 5'
      },
      index: true
    },
    title: {
      type: String,
      required: [true, 'Review title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [100, 'Title cannot exceed 100 characters']
    },
    comment: {
      type: String,
      required: [true, 'Review comment is required'],
      trim: true,
      minlength: [10, 'Comment must be at least 10 characters'],
      maxlength: [2000, 'Comment cannot exceed 2000 characters']
    },
    status: {
      type: String,
      enum: ['PUBLISHED', 'PENDING', 'HIDDEN', 'REJECTED', 'DELETED'],
      default: 'PUBLISHED',
      index: true
    },
    verificationStatus: {
      type: String,
      enum: ['VERIFIED'],
      default: 'VERIFIED',
      required: true
    },
    moderationStatus: {
      type: String,
      enum: ['APPROVED', 'PENDING', 'FLAGGED', 'REJECTED'],
      default: 'APPROVED',
      index: true
    },
    helpfulCount: {
      type: Number,
      default: 0,
      min: 0
    },
    reportedCount: {
      type: Number,
      default: 0,
      min: 0
    },
    publishedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    editedAt: {
      type: Date,
      default: null
    },
    rejectionReason: {
      type: String,
      default: null
    },
    moderatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    moderatedAt: {
      type: Date,
      default: null
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
      transform: (_doc, ret: Record<string, unknown>) => {
        ret['id'] = String(ret['_id']);
        delete ret['_id'];
        delete ret['__v'];
        return ret;
      }
    }
  }
);

// CRITICAL UNIQUE CONSTRAINT: One review per booking per user
reviewSchema.index({ userId: 1, bookingId: 1 }, { unique: true });

// Compound indexes for public reads and administrative queries
reviewSchema.index({ vehicleId: 1, status: 1, createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 });
reviewSchema.index({ userId: 1, createdAt: -1 });

reviewSchema.methods.toSafeDTO = function (
  author?: ReviewAuthorDTO,
  userHasVotedHelpful?: boolean
): ReviewDTO {
  const authorInfo: ReviewAuthorDTO = author || {
    id: String(this.userId),
    name: 'Verified Customer'
  };

  return {
    id: this.id || String(this._id),
    userId: String(this.userId),
    bookingId: String(this.bookingId),
    vehicleId: String(this.vehicleId),
    rating: this.rating,
    title: this.title,
    comment: this.comment,
    status: this.status,
    verificationStatus: this.verificationStatus,
    helpfulCount: this.helpfulCount || 0,
    author: authorInfo,
    publishedAt: this.publishedAt ? this.publishedAt.toISOString() : undefined,
    editedAt: this.editedAt ? this.editedAt.toISOString() : undefined,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
    userHasVotedHelpful: Boolean(userHasVotedHelpful),
    userVotedHelpful: Boolean(userHasVotedHelpful)
  };
};

reviewSchema.methods.toAdminDTO = function (author?: ReviewAuthorDTO): AdminReviewDTO {
  const safe = this.toSafeDTO(author);
  return {
    ...safe,
    moderationStatus: this.moderationStatus,
    moderatedBy: this.moderatedBy ? String(this.moderatedBy) : undefined,
    moderatedAt: this.moderatedAt ? this.moderatedAt.toISOString() : undefined,
    rejectionReason: this.rejectionReason || undefined,
    reportedCount: this.reportedCount || 0,
    isDeleted: Boolean(this.isDeleted),
    deletedAt: this.deletedAt ? this.deletedAt.toISOString() : undefined
  };
};

export const ReviewModel: Model<IReviewDoc> = mongoose.model<IReviewDoc>('Review', reviewSchema);
export default ReviewModel;
