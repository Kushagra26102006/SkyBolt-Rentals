import { HubDTO, CreateHubInput, UpdateHubInput, HubListQuery } from '../types/fleet.types';
import { VehicleDTO } from '../types/vehicle.types';

import { API_BASE_URL } from './api.config';

class ReactHubService {
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
      const errorMsg = data?.error?.message || response.statusText || 'Hub request failed';
      throw new Error(errorMsg);
    }

    return data;
  }

  /**
   * Lists hubs with filtering and pagination
   */
  public async getHubs(query: HubListQuery = {}): Promise<{
    data: HubDTO[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const params = new URLSearchParams();
    if (query.city) params.append('city', query.city);
    if (query.operationalStatus) params.append('operationalStatus', query.operationalStatus);
    if (query.search) params.append('search', query.search);
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());

    const queryString = params.toString();
    const endpoint = queryString ? `/hubs?${queryString}` : '/hubs';

    const res = await this.request<{
      success: boolean;
      data: HubDTO[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(endpoint, { method: 'GET' });

    return { data: res.data, meta: res.meta };
  }

  /**
   * Retrieves single hub by ID or code
   */
  public async getHubById(hubId: string): Promise<HubDTO> {
    const res = await this.request<{ success: boolean; data: HubDTO }>(`/hubs/${hubId}`, {
      method: 'GET'
    });
    return res.data;
  }

  /**
   * Creates new logistics hub
   */
  public async createHub(input: CreateHubInput): Promise<HubDTO> {
    const res = await this.request<{ success: boolean; data: HubDTO }>('/hubs', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    return res.data;
  }

  /**
   * Updates existing hub details
   */
  public async updateHub(hubId: string, input: UpdateHubInput): Promise<HubDTO> {
    const res = await this.request<{ success: boolean; data: HubDTO }>(`/hubs/${hubId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    });
    return res.data;
  }

  /**
   * Lists vehicles stationed at hub
   */
  public async getHubVehicles(hubId: string): Promise<VehicleDTO[]> {
    const res = await this.request<{ success: boolean; data: VehicleDTO[] }>(
      `/hubs/${hubId}/vehicles`,
      { method: 'GET' }
    );
    return res.data;
  }
}

export const hubService = new ReactHubService();
export default hubService;
