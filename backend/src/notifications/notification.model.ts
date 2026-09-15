import { Schema, model, Document, Types } from 'mongoose';
import {
  NotificationChannel,
  NotificationType,
  NotificationStatus,
  NotificationPriority,
  NotificationDTO,
  AdminNotificationDTO
} from './notification.types.js';

export interface INotification {
  userId?: Types.ObjectId | string;
  bookingId?: Types.ObjectId | string;
  paymentId?: Types.ObjectId | string;
  type: NotificationType;
  channel: NotificationChannel;
  priority: NotificationPriority;
  recipient: string;
  subject?: string;
  body?: string;
  template: string;
  templateVersion: string;
  status: NotificationStatus;
  provider: string;
  providerMessageId?: string;
  idempotencyKey: string;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt?: Date;
  nextAttemptAt?: Date;
  sentAt?: Date;
  failedAt?: Date;
  failureCode?: string;
  failureReason?: string;
  isPermanentFailure: boolean;
  isRead?: boolean;
  readAt?: Date | null;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationDoc extends INotification, Document {
  id: string;
  toSafeDTO(): NotificationDTO;
  toAdminDTO(): AdminNotificationDTO;
}

export type INotificationDocument = INotificationDoc;

const notificationSchema = new Schema<INotificationDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
      index: true
    },
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
      index: true
    },
    type: {
      type: String,
      required: [true, 'Notification type is required'],
      index: true
    },
    channel: {
      type: String,
      enum: ['EMAIL', 'SMS'],
      required: [true, 'Notification channel is required'],
      index: true
    },
    priority: {
      type: String,
      enum: ['HIGH', 'NORMAL', 'LOW'],
      default: 'NORMAL',
      index: true
    },
    recipient: {
      type: String,
      required: [true, 'Notification recipient is required'],
      trim: true,
      index: true
    },
    subject: {
      type: String,
      trim: true,
      default: ''
    },
    body: {
      type: String,
      default: ''
    },
    template: {
      type: String,
      required: [true, 'Template name is required']
    },
    templateVersion: {
      type: String,
      required: [true, 'Template version is required'],
      default: '1.0.0'
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED'],
      default: 'PENDING',
      index: true
    },
    provider: {
      type: String,
      required: true,
      default: 'MOCK'
    },
    providerMessageId: {
      type: String,
      default: null
    },
    idempotencyKey: {
      type: String,
      required: [true, 'Idempotency key is required'],
      unique: true,
      trim: true,
      index: true
    },
    attemptCount: {
      type: Number,
      default: 0,
      min: 0
    },
    maxAttempts: {
      type: Number,
      default: 3,
      min: 1
    },
    lastAttemptAt: {
      type: Date,
      default: null
    },
    nextAttemptAt: {
      type: Date,
      default: null,
      index: true
    },
    sentAt: {
      type: Date,
      default: null,
      index: true
    },
    failedAt: {
      type: Date,
      default: null
    },
    failureCode: {
      type: String,
      default: null
    },
    failureReason: {
      type: String,
      default: null
    },
    isPermanentFailure: {
      type: Boolean,
      default: false,
      index: true
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: () => ({})
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

// Indexes for high-throughput operational monitoring and worker queries
notificationSchema.index({ status: 1, nextAttemptAt: 1, isPermanentFailure: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ bookingId: 1, type: 1 });
notificationSchema.index({ status: 1, createdAt: -1 });

notificationSchema.methods.toSafeDTO = function (): NotificationDTO {
  const bodyText = this.body || '';
  const snippet = bodyText.replace(/<[^>]*>/g, '').trim().substring(0, 120);

  return {
    id: this.id || String(this._id),
    userId: String(this.userId),
    bookingId: this.bookingId ? String(this.bookingId) : undefined,
    paymentId: this.paymentId ? String(this.paymentId) : undefined,
    type: this.type,
    channel: this.channel,
    recipient: this.recipient,
    subject: this.subject || undefined,
    bodySnippet: snippet || undefined,
    template: this.template,
    templateVersion: this.templateVersion,
    status: this.status,
    provider: this.provider,
    attemptCount: this.attemptCount,
    sentAt: this.sentAt ? this.sentAt.toISOString() : undefined,
    failedAt: this.failedAt ? this.failedAt.toISOString() : undefined,
    failureCode: this.failureCode || undefined,
    failureReason: this.failureReason || undefined,
    isRead: Boolean(this.isRead),
    readAt: this.readAt ? this.readAt.toISOString() : undefined,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString()
  };
};

notificationSchema.methods.toAdminDTO = function (): AdminNotificationDTO {
  const safeDTO = this.toSafeDTO();

  return {
    ...safeDTO,
    body: this.body,
    idempotencyKey: this.idempotencyKey,
    providerMessageId: this.providerMessageId || undefined,
    lastAttemptAt: this.lastAttemptAt ? this.lastAttemptAt.toISOString() : undefined,
    nextAttemptAt: this.nextAttemptAt ? this.nextAttemptAt.toISOString() : undefined,
    isPermanentFailure: Boolean(this.isPermanentFailure),
    metadata: this.metadata || {}
  };
};

export const NotificationModel = model<INotificationDoc>('Notification', notificationSchema);
export default NotificationModel;
