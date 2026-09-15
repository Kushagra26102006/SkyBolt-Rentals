import {
  FleetStatus,
  FleetListQuery,
  VehicleReadinessResult,
  TransferDTO,
  CreateTransferInput,
  MaintenanceDTO,
  CreateMaintenanceInput,
  CompleteMaintenanceInput,
  InspectionDTO,
  CreateInspectionInput,
  PickupBookingInput,
  ReturnBookingInput
} from '../types/fleet.types';
import { VehicleDTO } from '../types/vehicle.types';

const API_BASE_URL =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) ||
  'http://localhost:5001/api/v1';

class ReactFleetService {
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
      const errorMsg = data?.error?.message || response.statusText || 'Fleet request failed';
      throw new Error(errorMsg);
    }

    return data;
  }

  /**
   * Lists physical fleet vehicles with operational filters
   */
  public async getFleet(query: FleetListQuery = {}): Promise<{
    data: VehicleDTO[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const params = new URLSearchParams();
    if (query.fleetStatus) params.append('fleetStatus', query.fleetStatus);
    if (query.hubId) params.append('hubId', query.hubId);
    if (query.category) params.append('category', query.category);
    if (query.search) params.append('search', query.search);
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());

    const queryString = params.toString();
    const endpoint = queryString ? `/fleet?${queryString}` : '/fleet';

    const res = await this.request<{
      success: boolean;
      data: VehicleDTO[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(endpoint, { method: 'GET' });

    return { data: res.data, meta: res.meta };
  }

  /**
   * Retrieves single vehicle fleet details
   */
  public async getVehicleFleetDetails(vehicleId: string): Promise<VehicleDTO> {
    const res = await this.request<{ success: boolean; data: VehicleDTO }>(`/fleet/${vehicleId}`, {
      method: 'GET'
    });
    return res.data;
  }

  /**
   * Authoritatively transitions physical vehicle fleet status
   */
  public async updateStatus(
    vehicleId: string,
    status: FleetStatus,
    reason?: string
  ): Promise<VehicleDTO> {
    const res = await this.request<{ success: boolean; data: VehicleDTO }>(
      `/fleet/${vehicleId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, reason })
      }
    );
    return res.data;
  }

  /**
   * Evaluates authoritative physical vehicle readiness
   */
  public async checkReadiness(
    vehicleId: string,
    pickupAt?: string,
    returnAt?: string
  ): Promise<VehicleReadinessResult> {
    const params = new URLSearchParams();
    if (pickupAt) params.append('pickupAt', pickupAt);
    if (returnAt) params.append('returnAt', returnAt);

    const qs = params.toString();
    const endpoint = qs ? `/fleet/${vehicleId}/readiness?${qs}` : `/fleet/${vehicleId}/readiness`;

    const res = await this.request<{ success: boolean; data: VehicleReadinessResult }>(endpoint, {
      method: 'GET'
    });
    return res.data;
  }

  /**
   * Assigns vehicle to a logistics hub
   */
  public async assignHub(vehicleId: string, hubId: string): Promise<{ vehicle: VehicleDTO }> {
    const res = await this.request<{ success: boolean; data: { vehicle: VehicleDTO } }>(
      `/fleet/${vehicleId}/hub`,
      {
        method: 'POST',
        body: JSON.stringify({ hubId })
      }
    );
    return res.data;
  }

  /**
   * Removes vehicle from current hub
   */
  public async removeHub(vehicleId: string): Promise<VehicleDTO> {
    const res = await this.request<{ success: boolean; data: VehicleDTO }>(
      `/fleet/${vehicleId}/hub`,
      { method: 'DELETE' }
    );
    return res.data;
  }

  /**
   * Initiates vehicle transfer between hubs
   */
  public async initiateTransfer(input: CreateTransferInput): Promise<TransferDTO> {
    const res = await this.request<{ success: boolean; data: TransferDTO }>(
      `/fleet/${input.vehicleId}/transfers`,
      {
        method: 'POST',
        body: JSON.stringify({
          toHubId: input.toHubId,
          reason: input.reason,
          notes: input.notes
        })
      }
    );
    return res.data;
  }

  /**
   * Completes an inter-hub transfer
   */
  public async completeTransfer(transferId: string): Promise<TransferDTO> {
    const res = await this.request<{ success: boolean; data: TransferDTO }>(
      `/transfers/${transferId}/complete`,
      { method: 'PATCH' }
    );
    return res.data;
  }

  /**
   * Cancels an inter-hub transfer
   */
  public async cancelTransfer(transferId: string, reason?: string): Promise<TransferDTO> {
    const res = await this.request<{ success: boolean; data: TransferDTO }>(
      `/transfers/${transferId}/cancel`,
      {
        method: 'PATCH',
        body: JSON.stringify({ reason })
      }
    );
    return res.data;
  }

  /**
   * Schedules vehicle maintenance
   */
  public async scheduleMaintenance(input: CreateMaintenanceInput): Promise<MaintenanceDTO> {
    const res = await this.request<{ success: boolean; data: MaintenanceDTO }>(
      `/fleet/${input.vehicleId}/maintenance`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
    return res.data;
  }

  /**
   * Completes maintenance and moves vehicle to INSPECTION
   */
  public async completeMaintenance(
    maintenanceId: string,
    input: CompleteMaintenanceInput
  ): Promise<MaintenanceDTO> {
    const res = await this.request<{ success: boolean; data: MaintenanceDTO }>(
      `/maintenance/${maintenanceId}/complete`,
      {
        method: 'PATCH',
        body: JSON.stringify(input)
      }
    );
    return res.data;
  }

  /**
   * Records a safety inspection
   */
  public async recordInspection(input: CreateInspectionInput): Promise<InspectionDTO> {
    const res = await this.request<{ success: boolean; data: InspectionDTO }>(
      `/fleet/${input.vehicleId}/inspections`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
    return res.data;
  }

  /**
   * Staff booking handover (pickup)
   */
  public async pickupBooking(
    bookingId: string,
    input: PickupBookingInput = {}
  ): Promise<{ booking: unknown; vehicle: VehicleDTO }> {
    const res = await this.request<{
      success: boolean;
      data: { booking: unknown; vehicle: VehicleDTO };
    }>(`/fleet/bookings/${bookingId}/pickup`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
    return res.data;
  }

  /**
   * Staff booking vehicle return
   */
  public async returnBooking(
    bookingId: string,
    input: ReturnBookingInput = {}
  ): Promise<{ booking: unknown; vehicle: VehicleDTO }> {
    const res = await this.request<{
      success: boolean;
      data: { booking: unknown; vehicle: VehicleDTO };
    }>(`/fleet/bookings/${bookingId}/return`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
    return res.data;
  }
}

export const fleetService = new ReactFleetService();
export default fleetService;
