export type NotificationChannel = 'EMAIL' | 'SMS';

export type NotificationType =
  | 'ACCOUNT_WELCOME'
  | 'EMAIL_VERIFICATION'
  | 'PASSWORD_RESET'
  | 'SECURITY_ALERT'
  | 'BOOKING_CREATED'
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_COMPLETED'
  | 'PICKUP_REMINDER'
  | 'RETURN_REMINDER'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REFUNDED'
  | 'VEHICLE_ASSIGNED'
  | 'BOOKING_OPERATIONAL_UPDATE';

export type NotificationStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED';

export interface INotificationPreferences {
  emailBookingUpdates: boolean;
  emailPaymentUpdates: boolean;
  smsBookingUpdates: boolean;
  smsPaymentUpdates: boolean;
  marketingEmail: boolean;
  marketingSms: boolean;
}

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

export interface NotificationStatsDTO {
  total: number;
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  cancelled: number;
  emailTotal: number;
  smsTotal: number;
}

export interface NotificationQueryFilters {
  channel?: NotificationChannel;
  status?: NotificationStatus;
  type?: NotificationType;
  userId?: string;
  bookingId?: string;
  paymentId?: string;
  recipient?: string;
  page?: number;
  limit?: number;
}
