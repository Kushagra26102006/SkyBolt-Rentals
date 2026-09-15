import { Schema, model, Document } from 'mongoose';
import { NotificationType } from './notification.types.js';

export const OutboxStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED'
} as const;
export type OutboxStatus = typeof OutboxStatus[keyof typeof OutboxStatus];

export const OutboxAggregateType = {
  BOOKING: 'BOOKING',
  PAYMENT: 'PAYMENT',
  USER: 'USER',
  FLEET: 'FLEET'
} as const;
export type OutboxAggregateType = typeof OutboxAggregateType[keyof typeof OutboxAggregateType];

export interface INotificationOutbox {
  eventId: string;
  eventType: NotificationType;
  aggregateType: OutboxAggregateType;
  aggregateId: string;
  payload: Record<string, any>;
  status: OutboxStatus;
  attemptCount: number;
  maxAttempts: number;
  processedAt?: Date;
  nextAttemptAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationOutboxDoc extends INotificationOutbox, Document {
  id: string;
}

export type INotificationOutboxDocument = INotificationOutboxDoc;

const notificationOutboxSchema = new Schema<INotificationOutboxDoc>(
  {
    eventId: {
      type: String,
      required: [true, 'Outbox event ID is required'],
      unique: true,
      trim: true,
      index: true
    },
    eventType: {
      type: String,
      required: [true, 'Event type is required'],
      index: true
    },
    aggregateType: {
      type: String,
      enum: ['BOOKING', 'PAYMENT', 'USER', 'FLEET'],
      required: true,
      index: true
    },
    aggregateId: {
      type: String,
      required: true,
      index: true
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'],
      default: 'PENDING',
      index: true
    },
    attemptCount: {
      type: Number,
      default: 0,
      min: 0
    },
    maxAttempts: {
      type: Number,
      default: 5,
      min: 1
    },
    processedAt: {
      type: Date,
      default: null
    },
    nextAttemptAt: {
      type: Date,
      default: () => new Date(),
      index: true
    },
    lastError: {
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

// Worker polling and concurrency lock index
notificationOutboxSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });

export const NotificationOutboxModel = model<INotificationOutboxDoc>(
  'NotificationOutbox',
  notificationOutboxSchema
);
export default NotificationOutboxModel;
