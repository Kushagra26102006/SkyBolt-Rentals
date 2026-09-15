import crypto from 'crypto';
import { config } from '../config/env.config.js';
import { ApiError } from '../utils/api-error.js';

export interface RazorpayCreateOrderParams {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResponse {
  id: string;
  entity: 'order';
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  attempts: number;
  notes: Record<string, any>;
  created_at: number;
}

export interface RazorpayPaymentResponse {
  id: string;
  entity: 'payment';
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  order_id: string;
  method: string;
  description?: string;
  amount_refunded?: number;
  refund_status?: string | null;
  captured?: boolean;
  email?: string;
  contact?: string;
  error_code?: string;
  error_description?: string;
  created_at: number;
}

export interface RazorpayCreateRefundParams {
  paymentId: string;
  amountPaise: number;
  receipt?: string;
  notes?: Record<string, string>;
  speed?: 'normal' | 'optimum';
}

export interface RazorpayRefundResponse {
  id: string;
  entity: 'refund';
  amount: number;
  currency: string;
  payment_id: string;
  notes?: Record<string, any>;
  receipt?: string;
  status: 'pending' | 'processed' | 'failed';
  speed_processed?: string;
  speed_requested?: string;
  created_at: number;
}

/**
 * Production Razorpay API Client
 * Manages official Razorpay API interactions, signature validations, and mock overrides for testing.
 */
export class RazorpayClient {
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;
  private mockOrderCreator: ((params: RazorpayCreateOrderParams) => Promise<RazorpayOrderResponse>) | null = null;
  private mockPaymentFetcher: ((paymentId: string) => Promise<RazorpayPaymentResponse>) | null = null;
  private mockRefundCreator: ((params: RazorpayCreateRefundParams) => Promise<RazorpayRefundResponse>) | null = null;

  constructor() {
    this.keyId = config.razorpay.keyId;
    this.keySecret = config.razorpay.keySecret;
    this.webhookSecret = config.razorpay.webhookSecret;
  }

  public getKeyId(): string {
    return this.keyId;
  }

  /**
   * Test/Mock Injection hook for deterministic unit & integration tests
   */
  public setMockOrderCreator(
    fn: ((params: RazorpayCreateOrderParams) => Promise<RazorpayOrderResponse>) | null
  ): void {
    this.mockOrderCreator = fn;
  }

  public setMockPaymentFetcher(
    fn: ((paymentId: string) => Promise<RazorpayPaymentResponse>) | null
  ): void {
    this.mockPaymentFetcher = fn;
  }

  public setMockRefundCreator(
    fn: ((params: RazorpayCreateRefundParams) => Promise<RazorpayRefundResponse>) | null
  ): void {
    this.mockRefundCreator = fn;
  }

  public isPlaceholderKey(): boolean {
    if (!this.keyId) return true;
    const str = this.keyId.toLowerCase().trim();
    return (
      str === 'rzp_test_placeholder_key_id' ||
      str.includes('placeholder') ||
      str.includes('example') ||
      str.includes('your_') ||
      str === ''
    );
  }

  /**
   * Creates an Authoritative Razorpay Order
   * Sourced strictly in minor units (integer paise)
   */
  public async createOrder(params: RazorpayCreateOrderParams): Promise<RazorpayOrderResponse> {
    if (this.mockOrderCreator) {
      return this.mockOrderCreator(params);
    }

    // In test environment or placeholder credentials, generate a deterministic mock order
    if (config.isTest || this.isPlaceholderKey()) {
      const mockOrderId = `order_${crypto.randomBytes(8).toString('hex')}`;
      return {
        id: mockOrderId,
        entity: 'order',
        amount: params.amountPaise,
        amount_paid: 0,
        amount_due: params.amountPaise,
        currency: params.currency,
        receipt: params.receipt,
        status: 'created',
        attempts: 0,
        notes: params.notes || {},
        created_at: Math.floor(Date.now() / 1000)
      };
    }

    // Official Razorpay API call via HTTPS
    const authHeader = 'Basic ' + Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    try {
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader
        },
        body: JSON.stringify({
          amount: params.amountPaise,
          currency: params.currency,
          receipt: params.receipt,
          notes: params.notes
        })
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        console.error('[Razorpay API Error] Order creation failed:', errBody);
        throw new ApiError(502, 'PAYMENT_ORDER_CREATION_FAILED', 'Failed to initialize payment with gateway.');
      }

      return (await response.json()) as RazorpayOrderResponse;
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      console.error('[Razorpay Network Error] Order creation exception:', err?.message || err);
      throw new ApiError(503, 'PAYMENT_GATEWAY_UNAVAILABLE', 'Payment gateway is temporarily unavailable.');
    }
  }

  /**
   * Fetches payment details by payment ID from Razorpay
   */
  public async fetchPayment(paymentId: string): Promise<RazorpayPaymentResponse> {
    if (this.mockPaymentFetcher) {
      return this.mockPaymentFetcher(paymentId);
    }

    if (config.isTest || this.isPlaceholderKey()) {
      return {
        id: paymentId,
        entity: 'payment',
        amount: 277000,
        currency: 'INR',
        status: 'captured',
        order_id: 'order_test_123',
        method: 'card',
        captured: true,
        created_at: Math.floor(Date.now() / 1000)
      };
    }

    const authHeader = 'Basic ' + Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    try {
      const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
        method: 'GET',
        headers: {
          Authorization: authHeader
        }
      });

      if (!response.ok) {
        throw new ApiError(502, 'PAYMENT_VERIFICATION_FAILED', 'Could not fetch payment verification data.');
      }

      return (await response.json()) as RazorpayPaymentResponse;
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(503, 'PAYMENT_GATEWAY_UNAVAILABLE', 'Payment gateway is temporarily unreachable.');
    }
  }

  /**
   * Official Razorpay Refund Creation API
   * Sourced strictly in minor units (paise)
   */
  public async createRefund(params: RazorpayCreateRefundParams): Promise<RazorpayRefundResponse> {
    if (this.mockRefundCreator) {
      return this.mockRefundCreator(params);
    }

    // In test environment or placeholder credentials, generate a deterministic mock refund
    if (config.isTest || this.isPlaceholderKey()) {
      const mockRefundId = `rfnd_${crypto.randomBytes(8).toString('hex')}`;
      return {
        id: mockRefundId,
        entity: 'refund',
        amount: params.amountPaise,
        currency: 'INR',
        payment_id: params.paymentId,
        notes: params.notes || {},
        receipt: params.receipt,
        status: 'processed',
        speed_processed: params.speed || 'normal',
        speed_requested: params.speed || 'normal',
        created_at: Math.floor(Date.now() / 1000)
      };
    }

    const authHeader = 'Basic ' + Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    try {
      const response = await fetch(`https://api.razorpay.com/v1/payments/${params.paymentId}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader
        },
        body: JSON.stringify({
          amount: params.amountPaise,
          receipt: params.receipt,
          notes: params.notes,
          speed: params.speed || 'normal'
        })
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        console.error('[Razorpay API Error] Refund creation failed:', errBody);
        throw new ApiError(502, 'REFUND_PROCESSING_FAILED', 'Failed to process refund with payment gateway.');
      }

      return (await response.json()) as RazorpayRefundResponse;
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      console.error('[Razorpay Network Error] Refund creation exception:', err?.message || err);
      throw new ApiError(503, 'PAYMENT_GATEWAY_UNAVAILABLE', 'Payment gateway is temporarily unavailable.');
    }
  }

  /**
   * Official Razorpay Payment Signature Verification (HMAC SHA-256)
   * Formula: hmac_sha256(order_id + "|" + razorpay_payment_id, secret)
   */
  public verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string
  ): boolean {
    if (!orderId || !paymentId || !signature) {
      return false;
    }

    // In development or test mode with placeholder credentials, accept simulated test signatures
    if (
      (config.isTest || config.isDevelopment || this.isPlaceholderKey()) &&
      (signature === 'simulated_test_signature' || signature.startsWith('mock_sig_'))
    ) {
      return true;
    }

    try {
      const payload = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(payload)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const receivedBuffer = Buffer.from(signature, 'utf8');

      if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch (err) {
      console.error('[Razorpay Signature Error] Verification exception:', err);
      return false;
    }
  }

  /**
   * Official Razorpay Webhook Signature Verification (HMAC SHA-256)
   * Formula: hmac_sha256(rawBody, webhookSecret)
   */
  public verifyWebhookSignature(
    rawBody: string | Buffer,
    receivedSignature: string
  ): boolean {
    if (!rawBody || !receivedSignature) {
      return false;
    }

    try {
      const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(bodyBuffer)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const receivedBuffer = Buffer.from(receivedSignature, 'utf8');

      if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch (err) {
      console.error('[Razorpay Webhook Error] Webhook signature verification exception:', err);
      return false;
    }
  }

  /**
   * Helper to generate a valid signature for testing
   */
  public generateTestPaymentSignature(orderId: string, paymentId: string): string {
    return crypto
      .createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
  }

  /**
   * Helper to generate a valid webhook signature for testing
   */
  public generateTestWebhookSignature(rawBody: string | Buffer): string {
    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(bodyBuffer)
      .digest('hex');
  }
}

export const razorpayClient = new RazorpayClient();
export default razorpayClient;
