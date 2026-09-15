import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import { MaintenanceModel } from '../models/maintenance.model.js';
import { VehicleModel } from '../models/vehicle.model.js';
import { vehicleRepository } from '../repositories/vehicle.repository.js';
import { FleetStateMachine } from './fleet-state-machine.js';
import { auditService } from './audit.service.js';
import { ApiError } from '../utils/api-error.js';
import { AuthenticatedUser } from '../types/auth.types.js';
import {
  MaintenanceDTO,
  CreateMaintenanceInput,
  CompleteMaintenanceInput
} from '../types/fleet.types.js';

export class MaintenanceService {
  /**
   * Generates a unique, cryptographically random maintenance number
   * Format: MNT-YYYYMMDD-XXXXXX
   */
  public generateMaintenanceNumber(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();

    return `MNT-${year}${month}${day}-${randomHex}`;
  }

  /**
   * Schedules a maintenance or service appointment for a physical vehicle
   */
  public async scheduleMaintenance(
    input: CreateMaintenanceInput,
    actor: AuthenticatedUser
  ): Promise<MaintenanceDTO> {
    const vehicle = await vehicleRepository.findByIdOrCode(input.vehicleId, true);
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${input.vehicleId}" not found.`);
    }

    if (vehicle.fleetStatus === 'RETIRED') {
      throw new ApiError(409, 'VEHICLE_RETIRED', 'Cannot schedule maintenance for a retired vehicle.');
    }

    const scheduledDate = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
    if (isNaN(scheduledDate.getTime())) {
      throw ApiError.badRequest('Invalid scheduled maintenance date.');
    }

    const isImmediate = !input.scheduledAt || scheduledDate.getTime() <= Date.now() + 60000;

    if (isImmediate) {
      if (vehicle.fleetStatus === 'ACTIVE_RENTAL') {
        throw new ApiError(
          409,
          'VEHICLE_IN_ACTIVE_RENTAL',
          'Cannot commence maintenance on a vehicle currently out on active customer rental.'
        );
      }
      FleetStateMachine.assertTransition(vehicle.fleetStatus || 'AVAILABLE', 'MAINTENANCE');
    }

    const maintenanceNumber = this.generateMaintenanceNumber();
    const actorObjectId = new Types.ObjectId(actor.id);
    const now = new Date();

    const maintenance = await MaintenanceModel.create({
      maintenanceNumber,
      vehicleId: vehicle._id,
      type: input.type,
      description: input.description.trim(),
      status: isImmediate ? 'IN_PROGRESS' : 'SCHEDULED',
      priority: input.priority || 'MEDIUM',
      scheduledAt: scheduledDate,
      startedAt: isImmediate ? now : undefined,
      odometer: input.odometer || vehicle.odometer || 0,
      cost: input.estimatedCost || 0,
      serviceProvider: input.serviceProvider || '',
      notes: input.notes || '',
      createdBy: actorObjectId
    });

    if (isImmediate) {
      vehicle.fleetStatus = 'MAINTENANCE';
      vehicle.status = 'MAINTENANCE';
      vehicle.maintenanceState = {
        inMaintenance: true,
        currentMaintenanceId: new Types.ObjectId(String(maintenance._id)),
        lastServicedAt: vehicle.maintenanceState?.lastServicedAt || null,
        nextServiceOdometer: vehicle.maintenanceState?.nextServiceOdometer || 0
      };
      await vehicle.save();
    }

    await auditService.log(
      actor,
      isImmediate ? 'MAINTENANCE_STARTED' : 'MAINTENANCE_SCHEDULED',
      'MAINTENANCE',
      maintenance.id,
      {
        newState: maintenance.toDTO()
      }
    );

    return maintenance.toDTO();
  }

  /**
   * Starts maintenance work: transitions vehicle immediately to MAINTENANCE status,
   * authoritatively rendering it unrentable.
   */
  public async startMaintenance(
    maintenanceId: string,
    actor: AuthenticatedUser
  ): Promise<MaintenanceDTO> {
    const maintenance = await MaintenanceModel.findById(maintenanceId).exec();
    if (!maintenance || maintenance.isDeleted) {
      throw new ApiError(404, 'MAINTENANCE_NOT_FOUND', `Maintenance job "${maintenanceId}" not found.`);
    }

    if (maintenance.status === 'IN_PROGRESS') {
      return maintenance.toDTO();
    }

    if (maintenance.status === 'COMPLETED' || maintenance.status === 'CANCELLED') {
      throw new ApiError(
        409,
        'MAINTENANCE_INVALID_STATE',
        `Cannot start maintenance in "${maintenance.status}" status.`
      );
    }

    const vehicle = await VehicleModel.findById(maintenance.vehicleId).exec();
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Associated vehicle not found.');
    }

    if (vehicle.fleetStatus === 'ACTIVE_RENTAL') {
      throw new ApiError(
        409,
        'VEHICLE_IN_ACTIVE_RENTAL',
        'Cannot commence maintenance on a vehicle currently out on active customer rental.'
      );
    }

    // 1. Assert state machine transition
    FleetStateMachine.assertTransition(vehicle.fleetStatus || 'AVAILABLE', 'MAINTENANCE');

    // 2. Set vehicle operational status to MAINTENANCE
    vehicle.fleetStatus = 'MAINTENANCE';
    vehicle.status = 'MAINTENANCE';
    vehicle.maintenanceState = {
      inMaintenance: true,
      currentMaintenanceId: new Types.ObjectId(String(maintenance._id)),
      lastServicedAt: vehicle.maintenanceState?.lastServicedAt || null,
      nextServiceOdometer: vehicle.maintenanceState?.nextServiceOdometer || 0
    };
    await vehicle.save();

    // 3. Update maintenance status
    maintenance.status = 'IN_PROGRESS';
    maintenance.startedAt = new Date();
    await maintenance.save();

    await auditService.log(actor, 'MAINTENANCE_STARTED', 'MAINTENANCE', maintenance.id, {
      newState: maintenance.toDTO()
    });

    return maintenance.toDTO();
  }

  /**
   * Completes maintenance work: moves vehicle authoritatively to INSPECTION state
   * (Never directly to AVAILABLE - mandatory physical safety check required)
   */
  public async completeMaintenance(
    maintenanceId: string,
    input: CompleteMaintenanceInput,
    actor: AuthenticatedUser
  ): Promise<MaintenanceDTO> {
    const maintenance = await MaintenanceModel.findById(maintenanceId).exec();
    if (!maintenance || maintenance.isDeleted) {
      throw new ApiError(404, 'MAINTENANCE_NOT_FOUND', `Maintenance job "${maintenanceId}" not found.`);
    }

    if (maintenance.status === 'COMPLETED') {
      return maintenance.toDTO();
    }

    const vehicle = await VehicleModel.findById(maintenance.vehicleId).exec();
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Associated vehicle not found.');
    }

    const now = new Date();

    // 1. Assert transition from MAINTENANCE -> INSPECTION
    FleetStateMachine.assertTransition(vehicle.fleetStatus || 'MAINTENANCE', 'INSPECTION');

    // 2. Transition vehicle to INSPECTION state
    vehicle.fleetStatus = 'INSPECTION';
    vehicle.status = 'ACTIVE';
    vehicle.maintenanceState = {
      inMaintenance: false,
      currentMaintenanceId: null,
      lastServicedAt: now,
      nextServiceOdometer: (vehicle.odometer || 0) + 5000
    };

    if (input.odometer !== undefined && input.odometer >= 0) {
      vehicle.odometer = input.odometer;
    }
    await vehicle.save();

    // 3. Mark maintenance COMPLETED
    maintenance.status = 'COMPLETED';
    maintenance.completedAt = now;
    maintenance.completedBy = new Types.ObjectId(actor.id);
    if (input.cost !== undefined) maintenance.cost = input.cost;
    if (input.odometer !== undefined) maintenance.odometer = input.odometer;
    if (input.serviceProvider) maintenance.serviceProvider = input.serviceProvider;
    if (input.notes) {
      maintenance.notes = `${maintenance.notes ? maintenance.notes + ' | ' : ''}${input.notes}`;
    }
    await maintenance.save();

    await auditService.log(actor, 'MAINTENANCE_COMPLETED', 'MAINTENANCE', maintenance.id, {
      newState: maintenance.toDTO()
    });

    return maintenance.toDTO();
  }

  /**
   * Retrieves maintenance history for a vehicle
   */
  public async getVehicleMaintenance(vehicleId: string): Promise<MaintenanceDTO[]> {
    const isObjectId = mongoose.isValidObjectId(vehicleId);
    let targetVehicleId: Types.ObjectId | null = null;

    if (isObjectId) {
      targetVehicleId = new Types.ObjectId(vehicleId);
    } else {
      const v = await vehicleRepository.findByIdOrCode(vehicleId);
      if (v) targetVehicleId = v._id;
    }

    if (!targetVehicleId) return [];

    const records = await MaintenanceModel.find({ vehicleId: targetVehicleId })
      .sort({ scheduledAt: -1 })
      .exec();

    return records.map((r) => r.toDTO());
  }
}

export const maintenanceService = new MaintenanceService();
export default maintenanceService;
