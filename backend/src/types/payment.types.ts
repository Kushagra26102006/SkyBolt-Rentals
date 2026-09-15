import { Types } from 'mongoose';

/**
 * Controlled Payment Lifecycle Statuses
 */
export type PaymentStatus =
  | 'CREATED'
  | 'ORDER_CREATED'
  | 'PENDING'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

/**
 * Safe Payment Method Categorization
 */
export type PaymentMethod =
  | 'card'
  | 'upi'
  | 'netbanking'
  | 'wallet'
  | 'other'
  | 'unknown';

/**
 * Payment Document Schema Interface
 */
export interface IPayment {
  _id: Types.ObjectId;
  paymentReference: string;
  bookingId: Types.ObjectId;
  userId: Types.ObjectId;
  provider: 'RAZORPAY';
  providerOrderId: string;
  providerPaymentId?: string;
  amount: number;             // Amount in standard currency units (e.g. ₹2,770.00)
  amountPaise: number;        // Minor units required by Razorpay API (e.g. 277000)
  currency: string;           // e.g. 'INR'
  status: PaymentStatus;
  method?: PaymentMethod;
  signatureVerified: boolean;
  webhookVerified: boolean;
  failureCode?: string;
  failureReason?: string;
  providerRefundId?: string;
  amountRefunded?: number;
  refundStatus?: 'PENDING' | 'PROCESSED' | 'FAILED' | null;
  refundedAt?: Date | null;
  refunds?: Array<{
    refundId: string;
    amount: number;
    status: string;
    receipt?: string;
    createdAt: Date;
  }>;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Safe Client-facing Payment Data Transfer Object
 */
export interface PaymentDTO {
  id: string;
  paymentReference: string;
  bookingId: string;
  bookingReference?: string;
  provider: string;
  providerOrderId: string;
  providerPaymentId?: string;
  providerRefundId?: string;
  amount: number;
  amountRefunded?: number;
  refundStatus?: string | null;
  currency: string;
  status: PaymentStatus;
  method?: PaymentMethod;
  signatureVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Safe Checkout Initiation DTO for React
 */
export interface CheckoutOrderDTO {
  keyId: string;
  orderId: string;
  amount: number;             // In minor units (paise) as expected by Razorpay checkout
  currency: string;
  bookingId: string;
  bookingReference: string;
  paymentReference: string;
  customerName?: string;
  customerEmail?: string;
  customerContact?: string;
}

/**
 * Inputs
 */
export interface CreatePaymentOrderInput {
  bookingId: string;
}

export interface VerifyPaymentInput {
  bookingId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface PaymentListQuery {
  page?: number;
  limit?: number;
  status?: PaymentStatus;
  bookingId?: string;
}

export interface WebhookEventRecord {
  eventId: string;
  eventType: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  status: 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'IGNORED';
  payloadHash: string;
  receivedAt: Date;
  processedAt: Date;
  error?: string;
}
