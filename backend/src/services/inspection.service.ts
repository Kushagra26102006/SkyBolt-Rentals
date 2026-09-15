import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import { InspectionModel } from '../models/inspection.model.js';
import { HubModel } from '../models/hub.model.js';
import { vehicleRepository } from '../repositories/vehicle.repository.js';
import { FleetStateMachine } from './fleet-state-machine.js';
import { auditService } from './audit.service.js';
import { ApiError } from '../utils/api-error.js';
import { AuthenticatedUser } from '../types/auth.types.js';
import { InspectionDTO, CreateInspectionInput } from '../types/fleet.types.js';

export class InspectionService {
  /**
   * Generates a unique, cryptographically random inspection number
   * Format: INS-YYYYMMDD-XXXXXX
   */
  public generateInspectionNumber(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();

    return `INS-${year}${month}${day}-${randomHex}`;
  }

  /**
   * Records a physical vehicle safety inspection and evaluates subsequent operational readiness
   */
  public async recordInspection(
    input: CreateInspectionInput,
    actor: AuthenticatedUser
  ): Promise<InspectionDTO> {
    const vehicle = await vehicleRepository.findByIdOrCode(input.vehicleId, true);
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${input.vehicleId}" not found.`);
    }

    if (vehicle.fleetStatus === 'RETIRED') {
      throw new ApiError(409, 'VEHICLE_RETIRED', 'Cannot inspect a retired vehicle.');
    }

    const inspectionNumber = this.generateInspectionNumber();
    const actorObjectId = new Types.ObjectId(actor.id);
    const now = new Date();

    const inspection = await InspectionModel.create({
      inspectionNumber,
      vehicleId: vehicle._id,
      inspectionType: input.inspectionType,
      result: input.result,
      inspectedBy: actorObjectId,
      inspectedAt: now,
      odometer: input.odometer || vehicle.odometer || 0,
      notes: input.notes || '',
      issues: input.issues || [],
      checklists: {
        brakes: input.checklists?.brakes ?? true,
        lights: input.checklists?.lights ?? true,
        tires: input.checklists?.tires ?? true,
        fluids: input.checklists?.fluids ?? true,
        bodywork: input.checklists?.bodywork ?? true,
        documents: input.checklists?.documents ?? true
      }
    });

    // Update vehicle inspection telemetry
    vehicle.inspectionState = {
      lastInspectionResult: input.result,
      lastInspectedAt: now,
      lastInspectionId: new Types.ObjectId(String(inspection._id))
    };

    if (input.odometer !== undefined && input.odometer >= 0) {
      vehicle.odometer = Math.max(vehicle.odometer || 0, input.odometer);
    }

    // Business rule:
    // FAILED inspection: vehicle CANNOT become AVAILABLE. Moves to MAINTENANCE or UNAVAILABLE.
    // PASSED inspection: vehicle may become AVAILABLE if all other readiness requirements pass.
    if (input.result === 'FAILED') {
      vehicle.fleetStatus = 'MAINTENANCE';
      vehicle.status = 'MAINTENANCE';
      if (!vehicle.maintenanceState) {
        vehicle.maintenanceState = { inMaintenance: true, currentMaintenanceId: null, lastServicedAt: null, nextServiceOdometer: 0 };
      } else {
        vehicle.maintenanceState.inMaintenance = true;
      }
    } else if (input.result === 'PASSED') {
      // If vehicle was awaiting inspection (e.g. post-maintenance, post-rental),
      // verify operational readiness criteria before returning to AVAILABLE
      if (vehicle.fleetStatus === 'INSPECTION') {
        let canBeAvailable = true;

        if (!vehicle.currentHubId) {
          canBeAvailable = false;
        } else {
          const hub = await HubModel.findById(vehicle.currentHubId).exec();
          if (!hub || hub.operationalStatus !== 'ACTIVE') {
            canBeAvailable = false;
          }
        }

        // If passing post-maintenance/post-rental inspection, inMaintenance flag is cleared
        if (vehicle.maintenanceState) {
          vehicle.maintenanceState.inMaintenance = false;
        }

        if (canBeAvailable) {
          FleetStateMachine.assertTransition(vehicle.fleetStatus, 'AVAILABLE');
          vehicle.fleetStatus = 'AVAILABLE';
          vehicle.status = 'ACTIVE';
        }
      }
    } else if (input.result === 'CONDITIONAL') {
      // Conditional inspection requires operational hold
      if (vehicle.fleetStatus === 'AVAILABLE') {
        vehicle.fleetStatus = 'INSPECTION';
      }
    }

    await vehicle.save();

    await auditService.log(actor, 'INSPECTION_PERFORMED', 'INSPECTION', inspection.id, {
      newState: inspection.toDTO(),
      reason: `Inspection result: ${input.result}`
    });

    return inspection.toDTO();
  }

  /**
   * Retrieves inspection history for a vehicle
   */
  public async getVehicleInspections(vehicleId: string): Promise<InspectionDTO[]> {
    const isObjectId = mongoose.isValidObjectId(vehicleId);
    let targetVehicleId: Types.ObjectId | null = null;

    if (isObjectId) {
      targetVehicleId = new Types.ObjectId(vehicleId);
    } else {
      const v = await vehicleRepository.findByIdOrCode(vehicleId);
      if (v) targetVehicleId = v._id;
    }

    if (!targetVehicleId) return [];

    const records = await InspectionModel.find({ vehicleId: targetVehicleId })
      .sort({ inspectedAt: -1 })
      .exec();

    return records.map((r) => r.toDTO());
  }
}

export const inspectionService = new InspectionService();
export default inspectionService;
