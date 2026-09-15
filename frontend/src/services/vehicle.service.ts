import {
  VehicleDTO,
  VehicleQueryFilters,
  PaginatedVehiclesResult
} from '../types/vehicle.types';

const API_BASE_URL =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) ||
  'http://localhost:5001/api/v1';

class ReactVehicleService {
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
   * List vehicles with query filters, sorting, and pagination
   */
  public async getVehicles(filters: VehicleQueryFilters = {}): Promise<PaginatedVehiclesResult> {
    const params = new URLSearchParams();

    if (filters.category) params.append('category', filters.category);
    if (filters.brand) params.append('brand', filters.brand);
    if (filters.fuelType) params.append('fuelType', filters.fuelType);
    if (filters.transmission) params.append('transmission', filters.transmission);
    if (filters.minPrice !== undefined) params.append('minPrice', filters.minPrice.toString());
    if (filters.maxPrice !== undefined) params.append('maxPrice', filters.maxPrice.toString());
    if (filters.seats !== undefined) params.append('seats', filters.seats.toString());
    if (filters.location) params.append('location', filters.location);
    if (filters.search) params.append('search', filters.search);
    if (filters.sort) params.append('sort', filters.sort);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());

    const queryString = params.toString();
    const endpoint = queryString ? `/vehicles?${queryString}` : '/vehicles';

    const res = await this.request<{ success: boolean; data: PaginatedVehiclesResult }>(endpoint, {
      method: 'GET'
    });

    return res.data;
  }

  /**
   * Get public vehicle details by MongoDB _id or human-readable vehicleCode
   */
  public async getVehicleById(idOrCode: string): Promise<VehicleDTO> {
    const res = await this.request<{ success: boolean; data: { vehicle: VehicleDTO } }>(
      `/vehicles/${encodeURIComponent(idOrCode)}`,
      { method: 'GET' }
    );
    return res.data.vehicle;
  }
}

export const vehicleService = new ReactVehicleService();
export default vehicleService;
