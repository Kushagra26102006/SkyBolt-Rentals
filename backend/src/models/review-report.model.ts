import mongoose, { Schema, Document, Types, Model } from 'mongoose';
import { ReportReason, ReportStatus, ReviewReportDTO } from '../reviews/review.types.js';

export interface IReviewReport {
  reviewId: Types.ObjectId | string;
  reportedBy: Types.ObjectId | string;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  resolvedBy?: Types.ObjectId | string | null;
  resolvedAt?: Date | null;
  resolutionNotes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReviewReportDoc extends IReviewReport, Document {
  id: string;
  toDTO(): ReviewReportDTO;
}

const reviewReportSchema = new Schema<IReviewReportDoc>(
  {
    reviewId: {
      type: Schema.Types.ObjectId,
      ref: 'Review',
      required: [true, 'Review ID is required'],
      index: true
    },
    reportedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Reporting user ID is required'],
      index: true
    },
    reason: {
      type: String,
      enum: ['SPAM', 'ABUSIVE', 'INAPPROPRIATE', 'FRAUDULENT', 'IRRELEVANT', 'OTHER'],
      required: [true, 'Report reason is required'],
      index: true
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: ''
    },
    status: {
      type: String,
      enum: ['PENDING', 'RESOLVED', 'DISMISSED'],
      default: 'PENDING',
      index: true
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    resolvedAt: {
      type: Date,
      default: null
    },
    resolutionNotes: {
      type: String,
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

// Prevent same customer from reporting the same review multiple times
reviewReportSchema.index({ reviewId: 1, reportedBy: 1 }, { unique: true });
reviewReportSchema.index({ status: 1, createdAt: -1 });

reviewReportSchema.methods.toDTO = function (): ReviewReportDTO {
  return {
    id: this.id || String(this._id),
    reviewId: String(this.reviewId),
    reportedBy: String(this.reportedBy),
    reason: this.reason,
    description: this.description || undefined,
    status: this.status,
    resolvedBy: this.resolvedBy ? String(this.resolvedBy) : undefined,
    resolvedAt: this.resolvedAt ? this.resolvedAt.toISOString() : undefined,
    resolutionNotes: this.resolutionNotes || undefined,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString()
  };
};

export const ReviewReportModel: Model<IReviewReportDoc> = mongoose.model<IReviewReportDoc>(
  'ReviewReport',
  reviewReportSchema
);
export default ReviewReportModel;
