import mongoose, { Schema, Document, Model } from 'mongoose';
import { WebhookEventRecord } from '../types/payment.types.js';

export interface IWebhookEventDoc extends Omit<WebhookEventRecord, 'eventId'>, Document {
  eventId: string;
}

const webhookEventSchema = new Schema<IWebhookEventDoc>(
  {
    eventId: {
      type: String,
      required: [true, 'Webhook Event ID is required'],
      unique: true,
      trim: true,
      index: true
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    providerOrderId: {
      type: String,
      trim: true,
      sparse: true,
      index: true
    },
    providerPaymentId: {
      type: String,
      trim: true,
      sparse: true,
      index: true
    },
    status: {
      type: String,
      enum: ['PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED'],
      default: 'PROCESSING',
      required: true
    },
    payloadHash: {
      type: String,
      required: true
    },
    receivedAt: {
      type: Date,
      default: Date.now
    },
    processedAt: {
      type: Date,
      default: Date.now
    },
    error: {
      type: String,
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

export const WebhookEventModel: Model<IWebhookEventDoc> =
  mongoose.models.WebhookEvent ||
  mongoose.model<IWebhookEventDoc>('WebhookEvent', webhookEventSchema);

export default WebhookEventModel;
