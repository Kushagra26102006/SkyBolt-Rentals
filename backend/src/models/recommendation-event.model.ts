import { Schema, model, Document, Types } from 'mongoose';
import { RecommendationEventDTO, RecommendationEventType } from '../types/recommendation.types.js';

export interface IRecommendationEvent {
  userId?: Types.ObjectId | null;
  sessionId?: string;
  vehicleId?: Types.ObjectId | null;
  eventType: RecommendationEventType;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface IRecommendationEventDoc extends IRecommendationEvent, Document {
  toDTO(): RecommendationEventDTO;
}

const recommendationEventSchema = new Schema<IRecommendationEventDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    sessionId: {
      type: String,
      trim: true,
      default: ''
    },
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      default: null,
      index: true
    },
    eventType: {
      type: String,
      enum: [
        'VEHICLE_VIEWED',
        'VEHICLE_SEARCHED',
        'VEHICLE_SELECTED',
        'BOOKING_COMPLETED',
        'RECOMMENDATION_CLICKED'
      ],
      required: true,
      index: true
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    },
    createdAt: {
      type: Date,
      default: Date.now,
      // Automatic 30-day TTL index for data minimization & privacy compliance
      expires: 30 * 24 * 60 * 60
    }
  },
  {
    timestamps: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Compound index for analyzing vehicle views & conversions over time
recommendationEventSchema.index({ vehicleId: 1, eventType: 1, createdAt: -1 });

recommendationEventSchema.methods.toDTO = function (): RecommendationEventDTO {
  return {
    userId: this.userId ? String(this.userId) : undefined,
    sessionId: this.sessionId || undefined,
    vehicleId: this.vehicleId ? String(this.vehicleId) : undefined,
    eventType: this.eventType,
    metadata: this.metadata || {},
    createdAt: this.createdAt.toISOString()
  };
};

export const RecommendationEventModel = model<IRecommendationEventDoc>(
  'RecommendationEvent',
  recommendationEventSchema
);
export default RecommendationEventModel;
