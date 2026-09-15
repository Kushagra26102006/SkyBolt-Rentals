import mongoose, { Types } from 'mongoose';
import {
  INotificationDocument,
  NotificationModel
} from './notification.model.js';
import {
  INotificationOutbox,
  INotificationOutboxDocument,
  NotificationOutboxModel,
  OutboxStatus
} from './notification-outbox.model.js';
import {
  NotificationChannel,
  NotificationQueryOptions,
  NotificationStatus
} from './notification.types.js';
import { escapeRegex } from '../utils/regex.util.js';

type FilterQuery = Record<string, any>;

export class NotificationRepository {
  /**
   * Create a new notification document.
   */
  public async createNotification(
    doc: Partial<INotificationDocument>
  ): Promise<INotificationDocument> {
    return await NotificationModel.create(doc);
  }

  /**
   * Find notification by unique MongoDB ObjectId.
   */
  public async findNotificationById(
    id: string
  ): Promise<INotificationDocument | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return await NotificationModel.findById(id);
  }

  /**
   * Find notification by deterministic idempotency key.
   */
  public async findByIdempotencyKey(
    key: string
  ): Promise<INotificationDocument | null> {
    return await NotificationModel.findOne({ idempotencyKey: key });
  }

  /**
   * Paginated notification history for a specific customer.
   */
  public async findCustomerNotifications(
    userId: string,
    options: NotificationQueryOptions = {}
  ): Promise<{ notifications: INotificationDocument[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const filter: FilterQuery = { userId };

    if (options.channel) filter.channel = options.channel;
    if (options.status) filter.status = options.status;
    if (options.type) filter.type = options.type;
    if (options.startDate || options.endDate) {
      filter.createdAt = {};
      if (options.startDate) filter.createdAt.$gte = options.startDate;
      if (options.endDate) filter.createdAt.$lte = options.endDate;
    }

    const [notifications, total] = await Promise.all([
      NotificationModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      NotificationModel.countDocuments(filter).exec()
    ]);

    return { notifications, total, page, limit };
  }

  /**
   * Mark customer notification as read with ownership verification.
   */
  public async markNotificationRead(id: string, userId: string): Promise<INotificationDocument | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(userId)) {
      return null;
    }

    return await NotificationModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId)
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );
  }

  /**
   * Paginated admin notification query with advanced filters.
   */
  public async findAdminNotifications(
    options: NotificationQueryOptions = {}
  ): Promise<{ notifications: INotificationDocument[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const filter: FilterQuery = {};

    if (options.userId) filter.userId = options.userId;
    if (options.bookingId) filter.bookingId = options.bookingId;
    if (options.paymentId) filter.paymentId = options.paymentId;
    if (options.channel) filter.channel = options.channel;
    if (options.status) filter.status = options.status;
    if (options.type) filter.type = options.type;
    if (options.recipient) filter.recipient = { $regex: escapeRegex(options.recipient), $options: 'i' };
    if (options.startDate || options.endDate) {
      filter.createdAt = {};
      if (options.startDate) filter.createdAt.$gte = options.startDate;
      if (options.endDate) filter.createdAt.$lte = options.endDate;
    }

    const [notifications, total] = await Promise.all([
      NotificationModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      NotificationModel.countDocuments(filter).exec()
    ]);

    return { notifications, total, page, limit };
  }

  /**
   * Aggregates notification stats across channels and statuses for admin dashboard.
   */
  public async getStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    sent: number;
    failed: number;
    cancelled: number;
    emailTotal: number;
    smsTotal: number;
  }> {
    const [statusStats, channelStats] = await Promise.all([
      NotificationModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      NotificationModel.aggregate([
        { $group: { _id: '$channel', count: { $sum: 1 } } }
      ])
    ]);

    const stats = {
      total: 0,
      pending: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
      emailTotal: 0,
      smsTotal: 0
    };

    statusStats.forEach((group) => {
      stats.total += group.count;
      switch (group._id) {
        case NotificationStatus.PENDING:
          stats.pending = group.count;
          break;
        case NotificationStatus.PROCESSING:
          stats.processing = group.count;
          break;
        case NotificationStatus.SENT:
          stats.sent = group.count;
          break;
        case NotificationStatus.FAILED:
          stats.failed = group.count;
          break;
        case NotificationStatus.CANCELLED:
          stats.cancelled = group.count;
          break;
      }
    });

    channelStats.forEach((group) => {
      if (group._id === NotificationChannel.EMAIL) stats.emailTotal = group.count;
      if (group._id === NotificationChannel.SMS) stats.smsTotal = group.count;
    });

    return stats;
  }

  /**
   * Update notification status and delivery result.
   */
  public async updateNotificationStatus(
    id: string,
    update: {
      status: NotificationStatus;
      providerMessageId?: string;
      failureCode?: string;
      failureReason?: string;
      nextAttemptAt?: Date | null;
      sentAt?: Date | null;
      failedAt?: Date | null;
      lastAttemptAt?: Date;
    }
  ): Promise<INotificationDocument | null> {
    const updatePayload: any = {
      status: update.status,
      updatedAt: new Date()
    };

    if (update.providerMessageId) updatePayload.providerMessageId = update.providerMessageId;
    if (update.failureCode !== undefined) updatePayload.failureCode = update.failureCode;
    if (update.failureReason !== undefined) updatePayload.failureReason = update.failureReason;
    if (update.nextAttemptAt !== undefined) updatePayload.nextAttemptAt = update.nextAttemptAt;
    if (update.sentAt !== undefined) updatePayload.sentAt = update.sentAt;
    if (update.failedAt !== undefined) updatePayload.failedAt = update.failedAt;
    if (update.lastAttemptAt) updatePayload.lastAttemptAt = update.lastAttemptAt;

    return await NotificationModel.findByIdAndUpdate(id, { $set: updatePayload }, { returnDocument: 'after' });
  }

  /**
   * Record an attempt on a notification record.
   */
  public async recordNotificationAttempt(
    id: string,
    params: {
      success: boolean;
      providerMessageId?: string;
      failureCode?: string;
      failureReason?: string;
      nextAttemptAt?: Date | null;
    }
  ): Promise<INotificationDocument | null> {
    const now = new Date();
    const updateDoc: any = {
      $inc: { attemptCount: 1 },
      $set: {
        lastAttemptAt: now,
        updatedAt: now
      }
    };

    if (params.success) {
      updateDoc.$set.status = NotificationStatus.SENT;
      updateDoc.$set.sentAt = now;
      if (params.providerMessageId) {
        updateDoc.$set.providerMessageId = params.providerMessageId;
      }
      updateDoc.$set.nextAttemptAt = null;
      updateDoc.$set.failureCode = null;
      updateDoc.$set.failureReason = null;
    } else {
      updateDoc.$set.status = params.nextAttemptAt ? NotificationStatus.PENDING : NotificationStatus.FAILED;
      if (!params.nextAttemptAt) {
        updateDoc.$set.failedAt = now;
      }
      updateDoc.$set.nextAttemptAt = params.nextAttemptAt || null;
      updateDoc.$set.failureCode = params.failureCode || 'DELIVERY_ERROR';
      updateDoc.$set.failureReason = params.failureReason || 'Failed to deliver notification';
    }

    return await NotificationModel.findByIdAndUpdate(id, updateDoc, { returnDocument: 'after' });
  }

  // ============================================================================
  // Transactional Outbox Methods
  // ============================================================================

  /**
   * Insert entry into outbox queue.
   */
  public async createOutboxEntry(
    entry: Partial<INotificationOutbox>
  ): Promise<INotificationOutboxDocument> {
    return await NotificationOutboxModel.create({
      ...entry,
      status: OutboxStatus.PENDING,
      attemptCount: 0,
      nextAttemptAt: new Date()
    });
  }

  /**
   * Atomically locks the next available pending outbox entry to prevent race conditions.
   */
  public async lockNextPendingOutboxEntry(): Promise<INotificationOutboxDocument | null> {
    const now = new Date();
    return await NotificationOutboxModel.findOneAndUpdate(
      {
        status: OutboxStatus.PENDING,
        nextAttemptAt: { $lte: now }
      },
      {
        $set: {
          status: OutboxStatus.PROCESSING,
          updatedAt: now
        }
      },
      {
        sort: { createdAt: 1 },
        returnDocument: 'after'
      }
    );
  }

  /**
   * Mark outbox record as PROCESSED.
   */
  public async markOutboxProcessed(id: string): Promise<void> {
    await NotificationOutboxModel.findByIdAndUpdate(id, {
      $set: {
        status: OutboxStatus.PROCESSED,
        processedAt: new Date(),
        updatedAt: new Date()
      }
    });
  }

  /**
   * Mark outbox entry as FAILED or schedule next retry.
   */
  public async markOutboxAttempt(
    id: string,
    error: string,
    nextAttemptAt: Date | null
  ): Promise<void> {
    const now = new Date();
    const update: any = {
      $inc: { attemptCount: 1 },
      $set: {
        lastError: error,
        updatedAt: now
      }
    };

    if (nextAttemptAt) {
      update.$set.status = OutboxStatus.PENDING;
      update.$set.nextAttemptAt = nextAttemptAt;
    } else {
      update.$set.status = OutboxStatus.FAILED;
      update.$set.nextAttemptAt = null;
    }

    await NotificationOutboxModel.findByIdAndUpdate(id, update);
  }

  /**
   * Recover outbox entries stuck in PROCESSING due to worker crash/timeout.
   */
  public async unlockStaleOutboxEntries(staleThresholdMs = 60000): Promise<number> {
    const thresholdDate = new Date(Date.now() - staleThresholdMs);
    const result = await NotificationOutboxModel.updateMany(
      {
        status: OutboxStatus.PROCESSING,
        updatedAt: { $lt: thresholdDate }
      },
      {
        $set: {
          status: OutboxStatus.PENDING,
          nextAttemptAt: new Date()
        }
      }
    );
    return result.modifiedCount || 0;
  }
}

export const notificationRepository = new NotificationRepository();
