import {
  BookingDTO,
  CreateBookingRequest,
  CancelBookingRequest,
  BookingListQuery
} from '../types/booking.types';

import { API_BASE_URL } from './api.config';

class ReactBookingService {
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
      const errorMsg = data?.error?.message || response.statusText || 'Request failed';
      throw new Error(errorMsg);
    }

    return data;
  }

  /**
   * Create a new authoritative booking with optional idempotency key
   */
  public async createBooking(
    bookingData: CreateBookingRequest,
    idempotencyKey?: string
  ): Promise<BookingDTO> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const res = await this.request<{ success: boolean; data: BookingDTO }>(
      '/bookings',
      {
        method: 'POST',
        headers,
        body: JSON.stringify(bookingData)
      }
    );

    return res.data;
  }

  /**
   * Retrieve authenticated customer's booking history
   */
  public async getMyBookings(
    query?: BookingListQuery
  ): Promise<{ data: BookingDTO[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
    const searchParams = new URLSearchParams();
    if (query?.status) searchParams.set('status', query.status);
    if (query?.sort) searchParams.set('sort', query.sort);
    if (query?.page) searchParams.set('page', String(query.page));
    if (query?.limit) searchParams.set('limit', String(query.limit));
    if (query?.from) searchParams.set('from', query.from);
    if (query?.to) searchParams.set('to', query.to);

    const queryString = searchParams.toString();
    const endpoint = `/bookings${queryString ? `?${queryString}` : ''}`;

    const res = await this.request<{
      success: boolean;
      data: BookingDTO[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(endpoint, { method: 'GET' });

    return { data: res.data, meta: res.meta };
  }

  /**
   * Retrieve a single booking by ID or reference with ownership protection
   */
  public async getBookingById(bookingIdOrRef: string): Promise<BookingDTO> {
    const res = await this.request<{ success: boolean; data: BookingDTO }>(
      `/bookings/${encodeURIComponent(bookingIdOrRef)}`,
      { method: 'GET' }
    );

    return res.data;
  }

  /**
   * Cancel a booking and release inventory hold
   */
  public async cancelBooking(
    bookingIdOrRef: string,
    cancelData?: CancelBookingRequest
  ): Promise<BookingDTO> {
    const res = await this.request<{ success: boolean; data: BookingDTO }>(
      `/bookings/${encodeURIComponent(bookingIdOrRef)}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify(cancelData || { reason: 'CUSTOMER_REQUEST' })
      }
    );

    return res.data;
  }
}

export const bookingService = new ReactBookingService();
export default bookingService;
