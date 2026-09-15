import {
  CheckoutOrderDTO,
  PaymentDTO,
  VerifyPaymentPayload,
  PaymentStatus
} from '../types/payment.types';

import { API_BASE_URL } from './api.config';

class ReactPaymentService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...((options.headers as Record<string, string>) || {})
    };

    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.error?.message || response.statusText || 'Payment request failed';
      throw new Error(errorMsg);
    }

    return data;
  }

  /**
   * Create or fetch existing payment order for a booking
   * Sourced authoritatively on server
   */
  public async createPaymentOrder(bookingId: string): Promise<CheckoutOrderDTO> {
    const res = await this.request<{ success: boolean; data: CheckoutOrderDTO }>(
      '/payments/orders',
      {
        method: 'POST',
        body: JSON.stringify({ bookingId })
      }
    );
    return res.data;
  }

  /**
   * Cryptographically verify payment callback on backend
   */
  public async verifyPayment(payload: VerifyPaymentPayload): Promise<{ booking: any; payment: PaymentDTO }> {
    const res = await this.request<{
      success: boolean;
      data: { booking: any; payment: PaymentDTO };
    }>('/payments/verify', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return res.data;
  }

  /**
   * Fetch payment record by ID
   */
  public async getPayment(paymentId: string): Promise<PaymentDTO> {
    const res = await this.request<{ success: boolean; data: PaymentDTO }>(
      `/payments/${encodeURIComponent(paymentId)}`,
      { method: 'GET' }
    );
    return res.data;
  }

  /**
   * Fetch customer payments list
   */
  public async getUserPayments(params?: {
    page?: number;
    limit?: number;
    status?: PaymentStatus;
    bookingId?: string;
  }): Promise<{ data: PaymentDTO[]; meta: any }> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.bookingId) searchParams.set('bookingId', params.bookingId);

    const queryStr = searchParams.toString();
    const endpoint = `/payments${queryStr ? `?${queryStr}` : ''}`;

    const res = await this.request<{ success: boolean; data: PaymentDTO[]; meta: any }>(
      endpoint,
      { method: 'GET' }
    );
    return { data: res.data, meta: res.meta };
  }
}

export const paymentService = new ReactPaymentService();
export default paymentService;
