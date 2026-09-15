import {
  AvailabilityResult,
  InventoryHold,
  AvailabilityQueryParams
} from '../types/availability.types';

const API_BASE_URL =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) ||
  'http://localhost:5001/api/v1';

class ReactAvailabilityService {
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
      const errorMsg = data?.error?.message || response.statusText || 'Request failed';
      throw new Error(errorMsg);
    }

    return data;
  }

  /**
   * Check vehicle availability for requested date range
   */
  public async checkAvailability(
    vehicleId: string,
    params: AvailabilityQueryParams
  ): Promise<AvailabilityResult> {
    const searchParams = new URLSearchParams({
      pickupAt: params.pickupAt,
      returnAt: params.returnAt
    });

    const res = await this.request<{ success: boolean; data: AvailabilityResult }>(
      `/vehicles/${encodeURIComponent(vehicleId)}/availability?${searchParams.toString()}`,
      { method: 'GET' }
    );

    return res.data;
  }

  /**
   * Place an inventory hold on a vehicle
   */
  public async createHold(
    vehicleId: string,
    params: AvailabilityQueryParams
  ): Promise<InventoryHold> {
    const res = await this.request<{ success: boolean; data: { hold: InventoryHold } }>(
      `/vehicles/${encodeURIComponent(vehicleId)}/holds`,
      {
        method: 'POST',
        body: JSON.stringify(params)
      }
    );

    return res.data.hold;
  }

  /**
   * Release an inventory hold
   */
  public async releaseHold(holdId: string): Promise<void> {
    await this.request<{ success: boolean }>(`/holds/${encodeURIComponent(holdId)}`, {
      method: 'DELETE'
    });
  }
}

export const availabilityService = new ReactAvailabilityService();
export default availabilityService;
