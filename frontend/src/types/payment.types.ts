/**
 * Frontend Payment Status Types
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

export interface PaymentDTO {
  id: string;
  paymentReference: string;
  bookingId: string;
  bookingReference?: string;
  provider: string;
  providerOrderId: string;
  providerPaymentId?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method?: string;
  signatureVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutOrderDTO {
  keyId: string;
  orderId: string;
  amount: number;             // minor units (paise)
  currency: string;
  bookingId: string;
  bookingReference: string;
  paymentReference: string;
  customerName?: string;
  customerEmail?: string;
  customerContact?: string;
}

export interface VerifyPaymentPayload {
  bookingId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
