import {
  OverviewMetrics,
  AdminBookingItem,
  AdminUserItem,
  AdminPaymentItem,
  AdminAuditLogItem
} from '../types/admin.types';
import { UserRole, UserStatus } from '../types/auth.types';

import { API_BASE_URL } from './api.config';

class ReactAdminService {
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
      const errorMsg = data?.error?.message || response.statusText || 'Admin request failed';
      throw new Error(errorMsg);
    }

    return data;
  }

  /**
   * Retrieves authoritative real-time overview telemetry & operational health
   */
  public async getOverview(): Promise<OverviewMetrics> {
    const res = await this.request<{ success: boolean; data: OverviewMetrics }>(
      '/admin/dashboard/overview',
      { method: 'GET' }
    );
    return res.data;
  }

  /**
   * Queries paginated bookings across all users
   */
  public async getBookings(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    paymentStatus?: string;
  } = {}): Promise<{
    data: AdminBookingItem[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const params = new URLSearchParams();
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());
    if (query.search) params.append('search', query.search);
    if (query.status) params.append('status', query.status);
    if (query.paymentStatus) params.append('paymentStatus', query.paymentStatus);

    return this.request<{
      data: AdminBookingItem[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/admin/bookings?${params.toString()}`, { method: 'GET' });
  }

  /**
   * Queries user directory (Strictly ADMIN)
   */
  public async getUsers(query: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
  } = {}): Promise<{
    data: AdminUserItem[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const params = new URLSearchParams();
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());
    if (query.search) params.append('search', query.search);
    if (query.role) params.append('role', query.role);
    if (query.status) params.append('status', query.status);

    return this.request<{
      data: AdminUserItem[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/admin/users?${params.toString()}`, { method: 'GET' });
  }

  /**
   * Updates user role with audit logging (ADMIN only)
   */
  public async updateUserRole(userId: string, role: UserRole, reason?: string): Promise<AdminUserItem> {
    const res = await this.request<{ success: boolean; data: AdminUserItem }>(
      `/admin/users/${userId}/role`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role, reason })
      }
    );
    return res.data;
  }

  /**
   * Updates user account status (ACTIVE, SUSPENDED, DEACTIVATED)
   */
  public async updateUserStatus(userId: string, status: UserStatus, reason?: string): Promise<AdminUserItem> {
    const res = await this.request<{ success: boolean; data: AdminUserItem }>(
      `/admin/users/${userId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, reason })
      }
    );
    return res.data;
  }

  /**
   * Queries financial payments ledger with reconciliation anomalies
   */
  public async getPayments(query: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  } = {}): Promise<{
    data: AdminPaymentItem[];
    discrepancies: any[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const params = new URLSearchParams();
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());
    if (query.status) params.append('status', query.status);
    if (query.search) params.append('search', query.search);

    return this.request<{
      data: AdminPaymentItem[];
      discrepancies: any[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/admin/payments?${params.toString()}`, { method: 'GET' });
  }

  /**
   * Inspects detailed vehicle operations dossier
   */
  public async getVehicleDossier(vehicleId: string): Promise<any> {
    const res = await this.request<{ success: boolean; data: any }>(
      `/admin/vehicles/${vehicleId}/operations`,
      { method: 'GET' }
    );
    return res.data;
  }

  /**
   * Queries immutable audit trail
   */
  public async getAuditLogs(query: {
    page?: number;
    limit?: number;
    entityType?: string;
    action?: string;
  } = {}): Promise<{
    data: AdminAuditLogItem[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const params = new URLSearchParams();
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());
    if (query.entityType) params.append('entityType', query.entityType);
    if (query.action) params.append('action', query.action);

    return this.request<{
      data: AdminAuditLogItem[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/admin/audit-logs?${params.toString()}`, { method: 'GET' });
  }
}

export const adminService = new ReactAdminService();
export default adminService;
