import crypto from 'crypto';
import { UserModel } from '../models/user.model.js';
import { config } from '../config/env.config.js';
import {
  INotificationPreferences,
  NotificationChannel,
  NotificationEnqueueJob,
  NotificationPriority,
  NotificationStatus,
  NotificationType
} from './notification.types.js';
import {
  OutboxAggregateType
} from './notification-outbox.model.js';
import {
  getTemplate,
  isValidEmail,
  isValidE164,
  normalizeEmail,
  normalizePhoneNumber
} from './notification.templates.js';
import {
  getEmailProvider,
  getSmsProvider
} from './providers/index.js';
import { notificationRepository } from './notification.repository.js';
import { auditService } from '../services/audit.service.js';
import { AuthenticatedUser } from '../types/auth.types.js';
import { ApiError } from '../utils/api-error.js';
import { isRedisConnected } from '../config/redis.js';

export interface NotificationDispatchResult {
  channel: NotificationChannel;
  notificationId: string;
  success: boolean;
  status: NotificationStatus;
  providerMessageId?: string;
  error?: string;
  isTransient?: boolean;
}

export class NotificationService {
  /**
   * Generates a deterministic idempotency key for an event + channel.
   */
  public generateIdempotencyKey(
    type: NotificationType,
    channel: NotificationChannel,
    identifiers: {
      userId?: string;
      bookingId?: string;
      paymentId?: string;
      customSuffix?: string;
    }
  ): string {
    const parts: string[] = [type.toLowerCase()];

    if (identifiers.bookingId) {
      parts.push(`booking:${identifiers.bookingId}`);
    } else if (identifiers.paymentId) {
      parts.push(`payment:${identifiers.paymentId}`);
    } else if (identifiers.userId) {
      parts.push(`user:${identifiers.userId}`);
    }

    parts.push(channel.toLowerCase());

    if (identifiers.customSuffix) {
      parts.push(identifiers.customSuffix);
    }

    return parts.join(':');
  }

  public async enqueue(job: NotificationEnqueueJob): Promise<{ outboxId: string }> {
    const aggregateType = job.bookingId
      ? OutboxAggregateType.BOOKING
      : job.paymentId
      ? OutboxAggregateType.PAYMENT
      : OutboxAggregateType.USER;

    const outboxEntry = await notificationRepository.createOutboxEntry({
      eventId: crypto.randomUUID(),
      eventType: job.type,
      aggregateType,
      aggregateId: job.bookingId || job.paymentId || job.userId || 'system',
      payload: job
    });

    const outboxId = outboxEntry._id.toString();

    // If BullMQ & Redis are active, dispatch to BullMQ for instantaneous background execution
    if (config.queues.enabled && isRedisConnected()) {
      try {
        const { queueRegistry } = await import('../queues/queue.registry.js');
        const notificationQueue = queueRegistry.getNotificationQueue();
        const deterministicJobId = `notif_${outboxEntry.eventId}`;
        await notificationQueue.add(
          job.type,
          { ...job, outboxId },
          {
            jobId: deterministicJobId,
            priority: job.priority === NotificationPriority.HIGH ? 1 : 2
          }
        );
      } catch (err: any) {
        if (!config.isTest) {
          console.warn(`[SkyBolt Notification] BullMQ enqueue fallback to outbox: ${err?.message}`);
        }
      }
    }

    return { outboxId };
  }

  /**
   * Dispatches a notification job directly (used by outbox worker or direct triggers).
   */
  public async processJob(job: NotificationEnqueueJob): Promise<NotificationDispatchResult[]> {
    const results: NotificationDispatchResult[] = [];

    // 1. Resolve User and contact info
    let recipientEmail = job.recipientEmail;
    let recipientPhone = job.recipientPhone;
    let userPreferences: INotificationPreferences | null = null;

    if (job.userId) {
      const user = await UserModel.findById(job.userId).exec();
      if (user) {
        if (!recipientEmail && user.email) recipientEmail = user.email;
        if (!recipientPhone && user.phone) recipientPhone = user.phone;
        userPreferences = (user as any).notificationPreferences || null;
      }
    }

    // 2. Resolve requested channels
    const channels: NotificationChannel[] = job.channels && job.channels.length > 0
      ? job.channels
      : [NotificationChannel.EMAIL];

    // 3. Process each channel independently
    for (const channel of channels) {
      try {
        const result = await this.dispatchChannel({
          job,
          channel,
          recipientEmail,
          recipientPhone,
          userPreferences
        });
        results.push(result);
      } catch (err: any) {
        results.push({
          channel,
          notificationId: '',
          success: false,
          status: NotificationStatus.FAILED,
          error: err?.message || 'Channel dispatch error',
          isTransient: false
        });
      }
    }

    return results;
  }

  /**
   * Process a single channel delivery with preference checks, idempotency, and retry handling.
   */
  private async dispatchChannel(params: {
    job: NotificationEnqueueJob;
    channel: NotificationChannel;
    recipientEmail?: string;
    recipientPhone?: string;
    userPreferences: INotificationPreferences | null;
  }): Promise<NotificationDispatchResult> {
    const { job, channel, recipientEmail, recipientPhone, userPreferences } = params;

    // Check user preferences
    const allowed = this.isChannelAllowedByPreferences(job.type, channel, userPreferences);
    if (!allowed) {
      return {
        channel,
        notificationId: '',
        success: true,
        status: NotificationStatus.CANCELLED,
        error: 'User preferences opted out of this channel.'
      };
    }

    // Resolve and Normalize Recipient
    let recipient = '';
    if (channel === NotificationChannel.EMAIL) {
      const normalizedEmail = recipientEmail ? normalizeEmail(recipientEmail) : '';
      if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
        return {
          channel,
          notificationId: '',
          success: false,
          status: NotificationStatus.FAILED,
          error: `Invalid email recipient address: ${recipientEmail}`
        };
      }
      recipient = normalizedEmail;
    } else if (channel === NotificationChannel.SMS) {
      const normalizedPhone = recipientPhone ? normalizePhoneNumber(recipientPhone) : '';
      if (!normalizedPhone || !isValidE164(normalizedPhone)) {
        return {
          channel,
          notificationId: '',
          success: false,
          status: NotificationStatus.FAILED,
          error: `Invalid E.164 phone recipient: ${recipientPhone}`
        };
      }
      recipient = normalizedPhone;
    }

    // Resolve Template for this type and channel
    const template = getTemplate(job.type, channel);
    if (!template) {
      return {
        channel,
        notificationId: '',
        success: false,
        status: NotificationStatus.FAILED,
        error: `Template not registered for event type: ${job.type} on channel: ${channel}`
      };
    }

    // Generate Idempotency Key
    const idempotencyKey = job.idempotencyKey || this.generateIdempotencyKey(job.type, channel, {
      userId: job.userId,
      bookingId: job.bookingId,
      paymentId: job.paymentId,
      customSuffix: job.metadata?.customSuffix
    });

    // Render Template
    const templateData = {
      ...job.templateData,
      recipientName: job.templateData?.customerName || job.templateData?.recipientName || 'Valued Customer'
    };
    const rendered = template.render(templateData);

    // Check if notification record already exists for this idempotency key
    let notificationDoc = await notificationRepository.findByIdempotencyKey(idempotencyKey);

    if (notificationDoc) {
      // If already sent, do not re-deliver
      if (notificationDoc.status === NotificationStatus.SENT) {
        return {
          channel,
          notificationId: notificationDoc._id.toString(),
          success: true,
          status: NotificationStatus.SENT,
          providerMessageId: notificationDoc.providerMessageId
        };
      }
    } else {
      // Create new PROCESSING notification document
      try {
        notificationDoc = await notificationRepository.createNotification({
          userId: job.userId,
          bookingId: job.bookingId,
          paymentId: job.paymentId,
          type: job.type,
          channel,
          recipient,
          subject: rendered.subject || '',
          body: rendered.body,
          template: template.name,
          templateVersion: template.version,
          status: NotificationStatus.PROCESSING,
          provider: channel === NotificationChannel.EMAIL ? 'email_provider' : 'sms_provider',
          idempotencyKey,
          priority: job.priority || NotificationPriority.NORMAL,
          metadata: job.metadata || {},
          attemptCount: 0
        });
      } catch (createErr: any) {
        // Handle race condition where another worker inserted the identical idempotencyKey
        if (createErr?.code === 11000) {
          notificationDoc = await notificationRepository.findByIdempotencyKey(idempotencyKey);
          if (notificationDoc && notificationDoc.status === NotificationStatus.SENT) {
            return {
              channel,
              notificationId: notificationDoc._id.toString(),
              success: true,
              status: NotificationStatus.SENT,
              providerMessageId: notificationDoc.providerMessageId
            };
          }
        } else {
          throw createErr;
        }
      }
    }

    if (!notificationDoc) {
      throw new Error('Failed to create or retrieve notification document');
    }

    const notificationId = notificationDoc._id.toString();

    // Send through Provider
    let sendResult;
    if (channel === NotificationChannel.EMAIL) {
      const emailProvider = getEmailProvider();
      sendResult = await emailProvider.send({
        recipient,
        subject: rendered.subject || 'SkyBolt Rentals Notification',
        html: rendered.body,
        text: rendered.textFallback || rendered.body,
        notificationId,
        idempotencyKey,
        metadata: job.metadata
      });
    } else {
      const smsProvider = getSmsProvider();
      sendResult = await smsProvider.send({
        recipient,
        message: rendered.body,
        notificationId,
        idempotencyKey,
        metadata: job.metadata
      });
    }

    // Process provider outcome
    if (sendResult.success) {
      await notificationRepository.recordNotificationAttempt(notificationId, {
        success: true,
        providerMessageId: sendResult.providerMessageId
      });

      return {
        channel,
        notificationId,
        success: true,
        status: NotificationStatus.SENT,
        providerMessageId: sendResult.providerMessageId
      };
    } else {
      // Failure Handling & Exponential Backoff calculation
      const maxRetries = config.notifications.maxRetries;
      const currentAttempts = (notificationDoc.attemptCount || 0) + 1;

      let nextAttemptAt: Date | null = null;

      // Only retry if the error is transient and we haven't reached maxRetries
      if (sendResult.isTransient && currentAttempts < maxRetries) {
        const baseDelay = config.notifications.retryBaseDelayMs;
        const exponentialDelay = baseDelay * Math.pow(2, currentAttempts - 1);
        const jitter = Math.floor(Math.random() * 500); // 0-500ms jitter
        nextAttemptAt = new Date(Date.now() + exponentialDelay + jitter);
      }

      await notificationRepository.recordNotificationAttempt(notificationId, {
        success: false,
        failureCode: sendResult.errorCode || 'PROVIDER_ERROR',
        failureReason: sendResult.errorReason || 'Provider failed to deliver message',
        nextAttemptAt
      });

      return {
        channel,
        notificationId,
        success: false,
        status: nextAttemptAt ? NotificationStatus.PENDING : NotificationStatus.FAILED,
        error: sendResult.errorReason,
        isTransient: sendResult.isTransient
      };
    }
  }

  /**
   * Evaluates if user preferences allow delivery of this event type on this channel.
   * Crucial rule: Critical transactional/security notifications CANNOT be opted out.
   */
  public isChannelAllowedByPreferences(
    type: NotificationType,
    channel: NotificationChannel,
    preferences: INotificationPreferences | null
  ): boolean {
    // If no preferences set, defaults allow all transactional
    if (!preferences) return true;

    // Critical security and legal events cannot be disabled
    const mandatoryEvents: NotificationType[] = [
      NotificationType.PASSWORD_RESET,
      NotificationType.SECURITY_ALERT,
      NotificationType.EMAIL_VERIFICATION,
      NotificationType.ACCOUNT_WELCOME
    ];

    if (mandatoryEvents.includes(type)) {
      return true;
    }

    if (channel === NotificationChannel.EMAIL) {
      if (type.startsWith('BOOKING_') || type.startsWith('PICKUP_') || type.startsWith('RETURN_') || type.startsWith('VEHICLE_')) {
        return preferences.emailBookingUpdates ?? true;
      }
      if (type.startsWith('PAYMENT_')) {
        return preferences.emailPaymentUpdates ?? true;
      }
    }

    if (channel === NotificationChannel.SMS) {
      if (type.startsWith('BOOKING_') || type.startsWith('PICKUP_') || type.startsWith('RETURN_') || type.startsWith('VEHICLE_')) {
        return preferences.smsBookingUpdates ?? true;
      }
      if (type.startsWith('PAYMENT_')) {
        return preferences.smsPaymentUpdates ?? true;
      }
    }

    return true;
  }

  /**
   * Admin-authorized retry of a failed notification.
   */
  public async retryNotification(
    notificationId: string,
    adminUser: AuthenticatedUser
  ): Promise<NotificationDispatchResult> {
    const doc = await notificationRepository.findNotificationById(notificationId);
    if (!doc) {
      throw ApiError.notFound('Notification not found');
    }

    if (doc.status === NotificationStatus.SENT) {
      throw ApiError.badRequest('Notification has already been sent successfully');
    }

    // Set to PROCESSING
    await notificationRepository.updateNotificationStatus(notificationId, {
      status: NotificationStatus.PROCESSING,
      lastAttemptAt: new Date()
    });

    const template = getTemplate(doc.type, doc.channel);
    if (!template) {
      await notificationRepository.updateNotificationStatus(notificationId, {
        status: NotificationStatus.FAILED,
        failureCode: 'TEMPLATE_NOT_FOUND',
        failureReason: 'Template missing during retry'
      });
      throw ApiError.badRequest(`Template not found for type: ${doc.type} and channel: ${doc.channel}`);
    }

    const rendered = template.render(doc.metadata || {});
    let sendResult;

    if (doc.channel === NotificationChannel.EMAIL) {
      const provider = getEmailProvider();
      sendResult = await provider.send({
        recipient: doc.recipient,
        subject: rendered.subject || 'SkyBolt Rentals Notification',
        html: rendered.body,
        text: rendered.textFallback || rendered.body,
        notificationId,
        idempotencyKey: `${doc.idempotencyKey}:retry:${Date.now()}`,
        metadata: doc.metadata
      });
    } else {
      const provider = getSmsProvider();
      sendResult = await provider.send({
        recipient: doc.recipient,
        message: rendered.body,
        notificationId,
        idempotencyKey: `${doc.idempotencyKey}:retry:${Date.now()}`,
        metadata: doc.metadata
      });
    }

    // Audit log this admin action
    await auditService.log(
      adminUser,
      'NOTIFICATION_RETRY',
      doc.bookingId ? 'BOOKING' : doc.paymentId ? 'PAYMENT' : 'USER',
      doc.bookingId?.toString() || doc.paymentId?.toString() || doc.userId?.toString() || notificationId,
      {
        newState: {
          success: sendResult.success,
          channel: doc.channel,
          type: doc.type,
          providerMessageId: sendResult.providerMessageId
        }
      }
    );

    if (sendResult.success) {
      await notificationRepository.recordNotificationAttempt(notificationId, {
        success: true,
        providerMessageId: sendResult.providerMessageId
      });

      return {
        channel: doc.channel,
        notificationId,
        success: true,
        status: NotificationStatus.SENT,
        providerMessageId: sendResult.providerMessageId
      };
    } else {
      await notificationRepository.recordNotificationAttempt(notificationId, {
        success: false,
        failureCode: sendResult.errorCode || 'RETRY_FAILED',
        failureReason: sendResult.errorReason || 'Manual retry failed'
      });

      return {
        channel: doc.channel,
        notificationId,
        success: false,
        status: NotificationStatus.FAILED,
        error: sendResult.errorReason,
        isTransient: sendResult.isTransient
      };
    }
  }

  /**
   * Retrieves notification preferences for a user.
   */
  public async getPreferences(userId: string): Promise<INotificationPreferences> {
    const user = await UserModel.findById(userId).exec();
    if (!user) {
      throw new Error('User not found');
    }

    return (user as any).notificationPreferences || {
      emailBookingUpdates: true,
      emailPaymentUpdates: true,
      smsBookingUpdates: true,
      smsPaymentUpdates: true,
      marketingEmail: false,
      marketingSms: false
    };
  }

  /**
   * Updates notification preferences for a user.
   */
  public async updatePreferences(
    userId: string,
    preferences: Partial<INotificationPreferences>
  ): Promise<INotificationPreferences> {
    const user = await UserModel.findById(userId).exec();
    if (!user) {
      throw new Error('User not found');
    }

    const current = (user as any).notificationPreferences || {};
    const updated: INotificationPreferences = {
      emailBookingUpdates: preferences.emailBookingUpdates !== undefined ? preferences.emailBookingUpdates : (current.emailBookingUpdates ?? true),
      emailPaymentUpdates: preferences.emailPaymentUpdates !== undefined ? preferences.emailPaymentUpdates : (current.emailPaymentUpdates ?? true),
      smsBookingUpdates: preferences.smsBookingUpdates !== undefined ? preferences.smsBookingUpdates : (current.smsBookingUpdates ?? true),
      smsPaymentUpdates: preferences.smsPaymentUpdates !== undefined ? preferences.smsPaymentUpdates : (current.smsPaymentUpdates ?? true),
      marketingEmail: preferences.marketingEmail !== undefined ? preferences.marketingEmail : (current.marketingEmail ?? false),
      marketingSms: preferences.marketingSms !== undefined ? preferences.marketingSms : (current.marketingSms ?? false)
    };

    user.notificationPreferences = updated;
    await user.save();

    return updated;
  }
}

export const notificationService = new NotificationService();
