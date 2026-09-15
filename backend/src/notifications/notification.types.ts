export const NotificationChannel = {
  EMAIL: 'EMAIL',
  SMS: 'SMS'
} as const;
export type NotificationChannel = typeof NotificationChannel[keyof typeof NotificationChannel];

export const NotificationType = {
  // Authentication Events
  ACCOUNT_WELCOME: 'ACCOUNT_WELCOME',
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
  SECURITY_ALERT: 'SECURITY_ALERT',
  // Booking Lifecycle Events
  BOOKING_CREATED: 'BOOKING_CREATED',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  BOOKING_COMPLETED: 'BOOKING_COMPLETED',
  PICKUP_REMINDER: 'PICKUP_REMINDER',
  RETURN_REMINDER: 'RETURN_REMINDER',
  // Payment Lifecycle Events
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_REFUNDED: 'PAYMENT_REFUNDED',
  // Fleet / Operational Events
  VEHICLE_ASSIGNED: 'VEHICLE_ASSIGNED',
  BOOKING_OPERATIONAL_UPDATE: 'BOOKING_OPERATIONAL_UPDATE'
} as const;
export type NotificationType = typeof NotificationType[keyof typeof NotificationType];

export const NotificationStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
} as const;
export type NotificationStatus = typeof NotificationStatus[keyof typeof NotificationStatus];

export const NotificationPriority = {
  HIGH: 'HIGH',
  NORMAL: 'NORMAL',
  LOW: 'LOW'
} as const;
export type NotificationPriority = typeof NotificationPriority[keyof typeof NotificationPriority];

export interface INotificationPreferences {
  emailBookingUpdates: boolean;
  emailPaymentUpdates: boolean;
  smsBookingUpdates: boolean;
  smsPaymentUpdates: boolean;
  marketingEmail: boolean;
  marketingSms: boolean;
}

export const defaultNotificationPreferences: INotificationPreferences = {
  emailBookingUpdates: true,
  emailPaymentUpdates: true,
  smsBookingUpdates: true,
  smsPaymentUpdates: true,
  marketingEmail: false,
  marketingSms: false
};

export interface NotificationDTO {
  id: string;
  userId: string;
  bookingId?: string;
  paymentId?: string;
  type: NotificationType;
  channel: NotificationChannel;
  recipient: string;
  subject?: string;
  bodySnippet?: string;
  template: string;
  templateVersion: string;
  status: NotificationStatus;
  provider: string;
  attemptCount: number;
  sentAt?: string;
  failedAt?: string;
  failureCode?: string;
  failureReason?: string;
  isRead?: boolean;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminNotificationDTO extends NotificationDTO {
  body: string;
  idempotencyKey: string;
  providerMessageId?: string;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  isPermanentFailure: boolean;
  metadata?: Record<string, any>;
}

export interface NotificationEnqueueJob {
  type: NotificationType;
  userId?: string;
  bookingId?: string;
  paymentId?: string;
  channels?: NotificationChannel[];
  priority?: NotificationPriority;
  recipientEmail?: string;
  recipientPhone?: string;
  templateData?: Record<string, any>;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
  outboxId?: string;
}

export interface EnqueueNotificationOptions extends NotificationEnqueueJob {
  data?: Record<string, any>;
}

export interface NotificationQueryOptions {
  userId?: string;
  bookingId?: string;
  paymentId?: string;
  channel?: NotificationChannel;
  status?: NotificationStatus;
  type?: NotificationType;
  recipient?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface NotificationQueryFilters extends NotificationQueryOptions {
  from?: Date | string;
  to?: Date | string;
}
