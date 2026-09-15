import mongoose, { Types } from 'mongoose';
import { VehicleModel } from '../models/vehicle.model.js';
import { HubModel } from '../models/hub.model.js';
import { vehicleRepository } from '../repositories/vehicle.repository.js';
import { reservationRepository } from '../repositories/reservation.repository.js';
import { FleetStateMachine } from './fleet-state-machine.js';
import { auditService } from './audit.service.js';
import { ApiError } from '../utils/api-error.js';
import { AuthenticatedUser } from '../types/auth.types.js';
import {
  AdminVehicleDTO,
  FleetStatus,
  VehicleReadinessResult
} from '../types/vehicle.types.js';
import { FleetListQuery } from '../types/fleet.types.js';

export class FleetService {
  /**
   * Retrieves paginated fleet inventory with operational filters
   */
  public async listFleet(
    query: FleetListQuery
  ): Promise<{ data: AdminVehicleDTO[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
    const filter: Record<string, unknown> = { isDeleted: false };

    if (query.fleetStatus) {
      filter.fleetStatus = query.fleetStatus;
    }

    if (query.hubId && mongoose.isValidObjectId(query.hubId)) {
      filter.currentHubId = new Types.ObjectId(query.hubId);
    }

    if (query.category) {
      filter.category = query.category;
    }

    if (query.search) {
      const regex = new RegExp(query.search.trim(), 'i');
      filter.$or = [
        { name: regex },
        { brand: regex },
        { model: regex },
        { vehicleCode: regex },
        { registrationNumber: regex }
      ];
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      VehicleModel.find(filter)
        .select('+registrationNumber +adminNotes +vin')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      VehicleModel.countDocuments(filter).exec()
    ]);

    return {
      data: docs.map((doc) => doc.toAdminDTO()),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    };
  }

  /**
   * Authoritative physical vehicle readiness evaluation
   * Gating check used prior to rental initiation, reservation locking, and customer handoff
   */
  public async checkVehicleReadiness(
    vehicleIdOrCode: string,
    pickupAt?: Date,
    returnAt?: Date
  ): Promise<VehicleReadinessResult> {
    const vehicle = await vehicleRepository.findByIdOrCode(vehicleIdOrCode, true);
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${vehicleIdOrCode}" not found.`);
    }

    const reasons: string[] = [];
    const currentFleetStatus = (vehicle.fleetStatus || 'AVAILABLE') as FleetStatus;
    let hubName: string | undefined;
    let hubOperational = false;
    let hubIdStr: string | undefined;

    // 1. Check if permanently decommissioned
    if (currentFleetStatus === 'RETIRED') {
      reasons.push('VEHICLE_RETIRED');
    }

    // 2. Check operational fleet status
    if (currentFleetStatus !== 'AVAILABLE') {
      if (currentFleetStatus === 'MAINTENANCE') {
        reasons.push('VEHICLE_IN_MAINTENANCE');
      } else if (currentFleetStatus === 'INSPECTION') {
        reasons.push('VEHICLE_IN_INSPECTION');
      } else if (currentFleetStatus === 'TRANSFER_PENDING') {
        reasons.push('VEHICLE_UNDER_TRANSFER');
      } else if (currentFleetStatus === 'ACTIVE_RENTAL') {
        reasons.push('VEHICLE_IN_ACTIVE_RENTAL');
      } else {
        reasons.push('VEHICLE_NOT_RENTABLE');
      }
    }

    // 3. Maintenance sub-state check
    if (vehicle.maintenanceState?.inMaintenance && !reasons.includes('VEHICLE_IN_MAINTENANCE')) {
      reasons.push('VEHICLE_IN_MAINTENANCE');
    }

    // 4. Inspection sub-state check
    if (vehicle.inspectionState?.lastInspectionResult === 'FAILED') {
      reasons.push('INSPECTION_FAILED');
    }

    // 5. Operational Hub check
    if (!vehicle.currentHubId) {
      reasons.push('VEHICLE_NO_HUB');
    } else {
      hubIdStr = String(vehicle.currentHubId);
      const hub = await HubModel.findById(vehicle.currentHubId).exec();
      if (!hub || hub.isDeleted) {
        reasons.push('HUB_NOT_FOUND');
      } else {
        hubName = hub.name;
        hubOperational = hub.operationalStatus === 'ACTIVE';
        if (hub.operationalStatus !== 'ACTIVE') {
          reasons.push('HUB_INACTIVE');
        }
      }
    }

    // 6. Check interval availability if requested
    if (pickupAt && returnAt) {
      const overlapping = await reservationRepository.findOverlapping(
        vehicle._id,
        pickupAt,
        returnAt
      );
      if (overlapping.length > 0) {
        reasons.push('RESERVATION_OVERLAP');
      }
    }

    return {
      ready: reasons.length === 0,
      vehicleId: vehicle.id || String(vehicle._id),
      fleetStatus: currentFleetStatus,
      reasons,
      hubId: hubIdStr,
      hubName,
      hubOperational,
      checkedAt: new Date().toISOString()
    };
  }

  /**
   * Authoritative Fleet State Transition with State Machine validation & Audit Logging
   */
  public async updateFleetStatus(
    vehicleIdOrCode: string,
    targetStatus: FleetStatus,
    actor: AuthenticatedUser,
    reason?: string
  ): Promise<AdminVehicleDTO> {
    const vehicle = await vehicleRepository.findByIdOrCode(vehicleIdOrCode, true);
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${vehicleIdOrCode}" not found.`);
    }

    const previousFleetStatus = (vehicle.fleetStatus || 'AVAILABLE') as FleetStatus;

    // 1. Assert valid transition via centralized state machine
    FleetStateMachine.assertTransition(previousFleetStatus, targetStatus);

    // 2. Extra invariant checks when transitioning to AVAILABLE
    if (targetStatus === 'AVAILABLE') {
      // Vehicle cannot be made AVAILABLE if maintenance is active
      if (vehicle.maintenanceState?.inMaintenance) {
        throw new ApiError(
          409,
          'VEHICLE_IN_MAINTENANCE',
          'Cannot mark vehicle AVAILABLE while maintenance is ongoing.'
        );
      }
      // Vehicle cannot be made AVAILABLE if inspection failed
      if (vehicle.inspectionState?.lastInspectionResult === 'FAILED') {
        throw new ApiError(
          409,
          'INSPECTION_FAILED',
          'Cannot mark vehicle AVAILABLE after a failed safety inspection. A passing inspection is required.'
        );
      }
    }

    // 3. Keep catalog status synchronized for public catalog consistency
    if (targetStatus === 'AVAILABLE') {
      vehicle.status = 'ACTIVE';
    } else if (targetStatus === 'MAINTENANCE') {
      vehicle.status = 'MAINTENANCE';
    } else if (targetStatus === 'RETIRED') {
      vehicle.status = 'RETIRED';
    }

    vehicle.fleetStatus = targetStatus;
    await vehicle.save();

    const updatedDTO = vehicle.toAdminDTO();

    // 4. Record audit trail
    await auditService.log(actor, 'VEHICLE_STATUS_CHANGED', 'VEHICLE', vehicle.id, {
      previousState: { fleetStatus: previousFleetStatus },
      newState: { fleetStatus: targetStatus },
      reason: reason || `Transitioned from ${previousFleetStatus} to ${targetStatus}`
    });

    return updatedDTO;
  }

  /**
   * Retrieves vehicle fleet details by ID or code
   */
  public async getVehicleFleetDetails(vehicleIdOrCode: string): Promise<AdminVehicleDTO> {
    const vehicle = await vehicleRepository.findByIdOrCode(vehicleIdOrCode, true);
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${vehicleIdOrCode}" not found.`);
    }
    return vehicle.toAdminDTO();
  }
}

export const fleetService = new FleetService();
export default fleetService;
