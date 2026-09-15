import {
  NotificationDTO,
  AdminNotificationDTO,
  NotificationStatsDTO,
  INotificationPreferences,
  NotificationQueryFilters
} from '../types/notification.types';

const API_BASE_URL =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) ||
  'http://localhost:5001/api/v1';

class ReactNotificationService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(options.headers || {})
    };

    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.error?.message || data?.message || response.statusText || 'Request failed';
      throw new Error(errorMsg);
    }

    return data;
  }

  /**
   * Customer: Fetch current user's paginated notification history
   */
  public async getMyNotifications(
    filters: NotificationQueryFilters = {}
  ): Promise<{ data: NotificationDTO[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
    const query = new URLSearchParams();
    if (filters.channel) query.set('channel', filters.channel);
    if (filters.status) query.set('status', filters.status);
    if (filters.type) query.set('type', filters.type);
    if (filters.page) query.set('page', String(filters.page));
    if (filters.limit) query.set('limit', String(filters.limit));

    const qs = query.toString() ? `?${query.toString()}` : '';
    return await this.request(`/notifications${qs}`, { method: 'GET' });
  }

  /**
   * Customer: Get notification preferences
   */
  public async getPreferences(): Promise<INotificationPreferences> {
    const res = await this.request<{ success: boolean; data: INotificationPreferences }>('/notifications/preferences', {
      method: 'GET'
    });
    return res.data;
  }

  /**
   * Customer: Update notification preferences
   */
  public async updatePreferences(
    preferences: Partial<INotificationPreferences>
  ): Promise<INotificationPreferences> {
    const res = await this.request<{ success: boolean; data: INotificationPreferences }>('/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify(preferences)
    });
    return res.data;
  }

  /**
   * Admin: List all notifications with query filters
   */
  public async getAdminNotifications(
    filters: NotificationQueryFilters = {}
  ): Promise<{ data: AdminNotificationDTO[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
    const query = new URLSearchParams();
    if (filters.channel) query.set('channel', filters.channel);
    if (filters.status) query.set('status', filters.status);
    if (filters.type) query.set('type', filters.type);
    if (filters.userId) query.set('userId', filters.userId);
    if (filters.bookingId) query.set('bookingId', filters.bookingId);
    if (filters.paymentId) query.set('paymentId', filters.paymentId);
    if (filters.recipient) query.set('recipient', filters.recipient);
    if (filters.page) query.set('page', String(filters.page));
    if (filters.limit) query.set('limit', String(filters.limit));

    const qs = query.toString() ? `?${query.toString()}` : '';
    return await this.request(`/admin/notifications${qs}`, { method: 'GET' });
  }

  /**
   * Admin: Get notification aggregate health stats
   */
  public async getAdminStats(): Promise<NotificationStatsDTO> {
    const res = await this.request<{ success: boolean; data: NotificationStatsDTO }>('/admin/notifications/stats', {
      method: 'GET'
    });
    return res.data;
  }

  /**
   * Admin: Get single notification detail by ID
   */
  public async getNotificationDetail(id: string): Promise<AdminNotificationDTO> {
    const res = await this.request<{ success: boolean; data: AdminNotificationDTO }>(`/admin/notifications/${id}`, {
      method: 'GET'
    });
    return res.data;
  }

  /**
   * Admin: Trigger authorized retry of a failed notification
   */
  public async retryNotification(id: string): Promise<{ success: boolean; message: string }> {
    return await this.request(`/admin/notifications/${id}/retry`, {
      method: 'POST'
    });
  }
}

export const notificationService = new ReactNotificationService();
