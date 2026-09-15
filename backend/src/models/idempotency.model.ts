import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IIdempotencyDoc extends Document {
  key: string;
  userId: Types.ObjectId;
  requestFingerprint: string;
  responseStatus: number;
  responseBody: Record<string, any>;
  expiresAt: Date;
  createdAt: Date;
}

const idempotencySchema = new Schema<IIdempotencyDoc>(
  {
    key: {
      type: String,
      required: true,
      trim: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    requestFingerprint: {
      type: String,
      required: true
    },
    responseStatus: {
      type: Number,
      required: true
    },
    responseBody: {
      type: Schema.Types.Mixed,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

// Compound uniqueness: user can only have one record per idempotency key
idempotencySchema.index({ key: 1, userId: 1 }, { unique: true });

// Auto-cleanup stale idempotency records via TTL index
idempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IdempotencyModel: Model<IIdempotencyDoc> =
  mongoose.models.Idempotency ||
  mongoose.model<IIdempotencyDoc>('Idempotency', idempotencySchema);

export default IdempotencyModel;
