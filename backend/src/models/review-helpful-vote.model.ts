import mongoose, { Schema, Document, Types, Model } from 'mongoose';

export interface IReviewHelpfulVote {
  reviewId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReviewHelpfulVoteDoc extends IReviewHelpfulVote, Document {
  id: string;
}

const reviewHelpfulVoteSchema = new Schema<IReviewHelpfulVoteDoc>(
  {
    reviewId: {
      type: Schema.Types.ObjectId,
      ref: 'Review',
      required: [true, 'Review ID is required'],
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
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

// Strictly one vote per user per review
reviewHelpfulVoteSchema.index({ reviewId: 1, userId: 1 }, { unique: true });

export const ReviewHelpfulVoteModel: Model<IReviewHelpfulVoteDoc> = mongoose.model<IReviewHelpfulVoteDoc>(
  'ReviewHelpfulVote',
  reviewHelpfulVoteSchema
);
export default ReviewHelpfulVoteModel;
