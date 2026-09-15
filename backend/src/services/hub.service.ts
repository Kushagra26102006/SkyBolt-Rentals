import { Types } from 'mongoose';
import { HubModel } from '../models/hub.model.js';
import { VehicleModel } from '../models/vehicle.model.js';
import { hubRepository } from '../repositories/hub.repository.js';
import { vehicleRepository } from '../repositories/vehicle.repository.js';
import { auditService } from './audit.service.js';
import { ApiError } from '../utils/api-error.js';
import { cacheService } from './cache.service.js';
import { cacheKeys } from '../utils/cache-keys.js';
import { AuthenticatedUser } from '../types/auth.types.js';
import {
  HubDTO,
  CreateHubInput,
  UpdateHubInput,
  HubListQuery
} from '../types/fleet.types.js';
import { AdminVehicleDTO } from '../types/vehicle.types.js';

export class HubService {
  /**
   * Creates a new logistics hub with unique hub code enforcement
   */
  public async createHub(input: CreateHubInput, actor: AuthenticatedUser): Promise<HubDTO> {
    const codeUpper = input.code.trim().toUpperCase();

    // Check code uniqueness
    const existing = await hubRepository.findByCode(codeUpper);
    if (existing) {
      throw new ApiError(409, 'HUB_CODE_EXISTS', `Hub with code "${codeUpper}" already exists.`);
    }

    if (input.capacity < 1) {
      throw ApiError.badRequest('Hub capacity must be at least 1.');
    }

    const hub = await HubModel.create({
      name: input.name.trim(),
      code: codeUpper,
      address: input.address.trim(),
      city: input.city.trim(),
      state: input.state.trim(),
      country: input.country || 'India',
      postalCode: input.postalCode.trim(),
      coordinates: input.coordinates
        ? { latitude: input.coordinates.latitude, longitude: input.coordinates.longitude }
        : undefined,
      capacity: input.capacity,
      currentVehicleCount: 0,
      operationalStatus: input.operationalStatus || 'ACTIVE',
      contact: input.contact || {},
      timezone: input.timezone || 'Asia/Kolkata'
    });

    await auditService.log(actor, 'HUB_CREATED', 'HUB', hub.id, {
      newState: hub.toDTO()
    });

    await cacheService.del([cacheKeys.hubsAll(), cacheKeys.hub(hub.id), cacheKeys.hub(hub.code)]);

    return hub.toDTO();
  }

  /**
   * Updates an existing hub's details and enforces capacity constraints
   */
  public async updateHub(
    hubId: string,
    input: UpdateHubInput,
    actor: AuthenticatedUser
  ): Promise<HubDTO> {
    const hub = await hubRepository.findByIdOrCode(hubId);
    if (!hub || hub.isDeleted) {
      throw new ApiError(404, 'HUB_NOT_FOUND', `Hub "${hubId}" not found.`);
    }

    const previousState = hub.toDTO();

    // Capacity downscaling check: cannot reduce capacity below currently assigned vehicles
    if (input.capacity !== undefined && input.capacity < hub.currentVehicleCount) {
      throw new ApiError(
        409,
        'CAPACITY_BELOW_CURRENT_INVENTORY',
        `Cannot reduce hub capacity to ${input.capacity} when ${hub.currentVehicleCount} vehicles are currently assigned.`
      );
    }

    if (input.name !== undefined) hub.name = input.name.trim();
    if (input.address !== undefined) hub.address = input.address.trim();
    if (input.city !== undefined) hub.city = input.city.trim();
    if (input.state !== undefined) hub.state = input.state.trim();
    if (input.country !== undefined) hub.country = input.country.trim();
    if (input.postalCode !== undefined) hub.postalCode = input.postalCode.trim();
    if (input.coordinates !== undefined) hub.coordinates = input.coordinates;
    if (input.capacity !== undefined) hub.capacity = input.capacity;
    if (input.operationalStatus !== undefined) hub.operationalStatus = input.operationalStatus;
    if (input.contact !== undefined) hub.contact = input.contact;
    if (input.timezone !== undefined) hub.timezone = input.timezone.trim();

    await hub.save();

    const newState = hub.toDTO();

    await auditService.log(actor, 'HUB_UPDATED', 'HUB', hub.id, {
      previousState,
      newState
    });

    await cacheService.del([cacheKeys.hubsAll(), cacheKeys.hub(hub.id), cacheKeys.hub(hub.code)]);

    return newState;
  }

  /**
   * Retrieves single hub by ID or unique code
   */
  public async getHubById(hubId: string): Promise<HubDTO> {
    return await cacheService.getOrSet(
      cacheKeys.hub(hubId),
      async () => {
        const hub = await hubRepository.findByIdOrCode(hubId);
        if (!hub || hub.isDeleted) {
          throw new ApiError(404, 'HUB_NOT_FOUND', `Hub "${hubId}" not found.`);
        }
        return hub.toDTO();
      },
      600
    );
  }

  /**
   * Retrieves paginated list of hubs with filtering
   */
  public async listHubs(
    query: HubListQuery
  ): Promise<{ data: HubDTO[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
    const result = await hubRepository.findWithFilters(query);
    return {
      data: result.hubs.map((h) => h.toDTO()),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit) || 1
      }
    };
  }

  /**
   * Lists physical vehicles currently assigned to a hub
   */
  public async getHubVehicles(hubId: string): Promise<AdminVehicleDTO[]> {
    const hub = await hubRepository.findByIdOrCode(hubId);
    if (!hub || hub.isDeleted) {
      throw new ApiError(404, 'HUB_NOT_FOUND', `Hub "${hubId}" not found.`);
    }

    const vehicles = await VehicleModel.find({
      currentHubId: new Types.ObjectId(String(hub._id)),
      isDeleted: false
    })
      .select('+registrationNumber +adminNotes +vin')
      .sort({ brand: 1, model: 1 })
      .exec();

    return vehicles.map((v) => v.toAdminDTO());
  }

  /**
   * Concurrency-safe Vehicle-to-Hub assignment
   * Atomically checks hub capacity limit and prevents race-condition over-assignment
   */
  public async assignVehicleToHub(
    vehicleIdOrCode: string,
    targetHubIdOrCode: string,
    actor: AuthenticatedUser
  ): Promise<{ vehicle: AdminVehicleDTO; hub: HubDTO }> {
    const vehicle = await vehicleRepository.findByIdOrCode(vehicleIdOrCode, true);
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${vehicleIdOrCode}" not found.`);
    }

    if (vehicle.fleetStatus === 'RETIRED') {
      throw new ApiError(409, 'VEHICLE_RETIRED', 'Retired vehicles cannot be assigned to hubs.');
    }

    if (vehicle.fleetStatus === 'ACTIVE_RENTAL') {
      throw new ApiError(
        409,
        'VEHICLE_IN_ACTIVE_RENTAL',
        'Cannot reassign hub for a vehicle currently out on active customer rental.'
      );
    }

    if (vehicle.fleetStatus === 'TRANSFER_PENDING') {
      throw new ApiError(
        409,
        'VEHICLE_UNDER_TRANSFER',
        'Vehicle is currently undergoing inter-hub transfer.'
      );
    }

    const targetHub = await hubRepository.findByIdOrCode(targetHubIdOrCode);
    if (!targetHub || targetHub.isDeleted) {
      throw new ApiError(404, 'HUB_NOT_FOUND', `Hub "${targetHubIdOrCode}" not found.`);
    }

    if (targetHub.operationalStatus !== 'ACTIVE') {
      throw new ApiError(
        409,
        'HUB_INACTIVE',
        `Cannot assign vehicle to hub "${targetHub.name}" because it is currently ${targetHub.operationalStatus}.`
      );
    }

    const previousHubId = vehicle.currentHubId ? String(vehicle.currentHubId) : null;
    const targetHubIdStr = targetHub._id.toString();

    // Idempotent assignment to same hub
    if (previousHubId === targetHubIdStr) {
      return { vehicle: vehicle.toAdminDTO(), hub: targetHub.toDTO() };
    }

    // Atomic Capacity Check & Increment:
    // Only increments currentVehicleCount if it is strictly less than capacity.
    // This prevents simultaneous requests from exceeding capacity.
    const capacityClaimedHub = await HubModel.findOneAndUpdate(
      {
        _id: targetHub._id,
        operationalStatus: 'ACTIVE',
        $expr: { $lt: ['$currentVehicleCount', '$capacity'] }
      },
      { $inc: { currentVehicleCount: 1 } },
      { returnDocument: 'after' }
    ).exec();

    if (!capacityClaimedHub) {
      throw new ApiError(
        409,
        'HUB_CAPACITY_REACHED',
        `Hub "${targetHub.name}" has reached its maximum vehicle capacity (${targetHub.capacity}).`
      );
    }

    // Update vehicle's operational hub reference and location metadata
    vehicle.currentHubId = new Types.ObjectId(String(targetHub._id));
    vehicle.location = {
      name: targetHub.name,
      city: targetHub.city,
      locationId: targetHub.id || String(targetHub._id)
    };
    await vehicle.save();

    // Decrement vehicle count from previous hub if existed
    if (previousHubId && Types.ObjectId.isValid(previousHubId)) {
      await HubModel.findOneAndUpdate(
        { _id: new Types.ObjectId(previousHubId), currentVehicleCount: { $gt: 0 } },
        { $inc: { currentVehicleCount: -1 } }
      ).exec();
    }

    await auditService.log(actor, 'VEHICLE_ASSIGNED_HUB', 'VEHICLE', vehicle.id, {
      previousState: { currentHubId: previousHubId },
      newState: { currentHubId: targetHub.id, hubCode: targetHub.code }
    });

    return {
      vehicle: vehicle.toAdminDTO(),
      hub: capacityClaimedHub.toDTO()
    };
  }

  /**
   * Removes a vehicle from its current hub (e.g. for maintenance depot or decommissioning)
   */
  public async removeVehicleFromHub(
    vehicleIdOrCode: string,
    actor: AuthenticatedUser
  ): Promise<AdminVehicleDTO> {
    const vehicle = await vehicleRepository.findByIdOrCode(vehicleIdOrCode, true);
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${vehicleIdOrCode}" not found.`);
    }

    if (vehicle.fleetStatus === 'ACTIVE_RENTAL') {
      throw new ApiError(
        409,
        'VEHICLE_IN_ACTIVE_RENTAL',
        'Cannot unassign a vehicle that is currently out on rental.'
      );
    }

    if (vehicle.fleetStatus === 'TRANSFER_PENDING') {
      throw new ApiError(
        409,
        'VEHICLE_UNDER_TRANSFER',
        'Cannot unassign a vehicle currently in transfer.'
      );
    }

    const previousHubId = vehicle.currentHubId ? String(vehicle.currentHubId) : null;
    if (!previousHubId) {
      return vehicle.toAdminDTO();
    }

    vehicle.currentHubId = null;
    await vehicle.save();

    if (Types.ObjectId.isValid(previousHubId)) {
      await HubModel.findOneAndUpdate(
        { _id: new Types.ObjectId(previousHubId), currentVehicleCount: { $gt: 0 } },
        { $inc: { currentVehicleCount: -1 } }
      ).exec();
    }

    await auditService.log(actor, 'VEHICLE_REMOVED_FROM_HUB', 'VEHICLE', vehicle.id, {
      previousState: { currentHubId: previousHubId },
      newState: { currentHubId: null }
    });

    return vehicle.toAdminDTO();
  }
}

export const hubService = new HubService();
export default hubService;
