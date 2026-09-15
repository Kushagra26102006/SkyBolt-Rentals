import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import { FleetTransferModel } from '../models/fleet-transfer.model.js';
import { VehicleModel } from '../models/vehicle.model.js';
import { HubModel } from '../models/hub.model.js';
import { vehicleRepository } from '../repositories/vehicle.repository.js';
import { hubRepository } from '../repositories/hub.repository.js';
import { FleetStateMachine } from './fleet-state-machine.js';
import { auditService } from './audit.service.js';
import { ApiError } from '../utils/api-error.js';
import { AuthenticatedUser } from '../types/auth.types.js';
import { TransferDTO, CreateTransferInput } from '../types/fleet.types.js';

export class FleetTransferService {
  /**
   * Generates a unique, cryptographically random transfer number
   * Format: TRF-YYYYMMDD-XXXXXX
   */
  public generateTransferNumber(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();

    return `TRF-${year}${month}${day}-${randomHex}`;
  }

  /**
   * Initiates a physical vehicle transfer between hubs with concurrency-safe capacity reservation
   */
  public async initiateTransfer(
    input: CreateTransferInput,
    actor: AuthenticatedUser
  ): Promise<TransferDTO> {
    const vehicle = await vehicleRepository.findByIdOrCode(input.vehicleId, true);
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${input.vehicleId}" not found.`);
    }

    if (vehicle.fleetStatus === 'RETIRED') {
      throw new ApiError(409, 'VEHICLE_RETIRED', 'Cannot transfer a retired vehicle.');
    }

    if (vehicle.fleetStatus === 'ACTIVE_RENTAL') {
      throw new ApiError(
        409,
        'VEHICLE_IN_ACTIVE_RENTAL',
        'Cannot transfer vehicle currently assigned to an active rental.'
      );
    }

    if (vehicle.fleetStatus === 'TRANSFER_PENDING') {
      throw new ApiError(
        409,
        'TRANSFER_CONFLICT',
        'Vehicle is already undergoing an active transfer.'
      );
    }

    if (!vehicle.currentHubId) {
      throw new ApiError(
        409,
        'VEHICLE_NO_HUB',
        'Vehicle must be assigned to an operational hub before initiating transfer.'
      );
    }

    const sourceHubId = vehicle.currentHubId;
    const toHub = await hubRepository.findByIdOrCode(input.toHubId);
    if (!toHub || toHub.isDeleted) {
      throw new ApiError(404, 'HUB_NOT_FOUND', `Destination hub "${input.toHubId}" not found.`);
    }

    if (sourceHubId.toString() === toHub._id.toString()) {
      throw ApiError.badRequest('Source and destination hubs must be different.');
    }

    if (toHub.operationalStatus !== 'ACTIVE') {
      throw new ApiError(
        409,
        'HUB_INACTIVE',
        `Destination hub "${toHub.name}" is currently ${toHub.operationalStatus}.`
      );
    }

    // 1. Concurrency-safe atomic capacity reservation on destination hub
    const reservedDestHub = await HubModel.findOneAndUpdate(
      {
        _id: toHub._id,
        operationalStatus: 'ACTIVE',
        $expr: { $lt: ['$currentVehicleCount', '$capacity'] }
      },
      { $inc: { currentVehicleCount: 1 } },
      { returnDocument: 'after' }
    ).exec();

    if (!reservedDestHub) {
      throw new ApiError(
        409,
        'HUB_CAPACITY_REACHED',
        `Destination hub "${toHub.name}" has reached capacity (${toHub.capacity} vehicles).`
      );
    }

    // 2. Decrement vehicle count from source hub
    await HubModel.findOneAndUpdate(
      { _id: new Types.ObjectId(String(sourceHubId)), currentVehicleCount: { $gt: 0 } },
      { $inc: { currentVehicleCount: -1 } }
    ).exec();

    // 3. Assert fleet state transition: AVAILABLE -> TRANSFER_PENDING
    FleetStateMachine.assertTransition(vehicle.fleetStatus || 'AVAILABLE', 'TRANSFER_PENDING');
    vehicle.fleetStatus = 'TRANSFER_PENDING';
    await vehicle.save();

    // 4. Create Transfer record
    const transferNumber = this.generateTransferNumber();
    const actorObjectId = new Types.ObjectId(actor.id);

    const transfer = await FleetTransferModel.create({
      transferNumber,
      vehicleId: vehicle._id,
      fromHubId: new Types.ObjectId(String(sourceHubId)),
      toHubId: toHub._id,
      initiatedBy: actorObjectId,
      status: 'IN_TRANSIT',
      reason: input.reason || '',
      notes: input.notes || '',
      startedAt: new Date()
    });

    await auditService.log(actor, 'VEHICLE_TRANSFERRED', 'TRANSFER', transfer.id, {
      newState: transfer.toDTO(),
      reason: input.reason
    });

    return transfer.toDTO();
  }

  /**
   * Completes an in-flight transfer, updating destination hub assignment and restoring vehicle readiness
   */
  public async completeTransfer(
    transferId: string,
    actor: AuthenticatedUser
  ): Promise<TransferDTO> {
    const transfer = await FleetTransferModel.findById(transferId).exec();
    if (!transfer || transfer.isDeleted) {
      throw new ApiError(404, 'TRANSFER_NOT_FOUND', `Transfer "${transferId}" not found.`);
    }

    if (transfer.status === 'COMPLETED') {
      return transfer.toDTO();
    }

    if (transfer.status === 'CANCELLED') {
      throw new ApiError(409, 'TRANSFER_ALREADY_CANCELLED', 'Cannot complete a cancelled transfer.');
    }

    const vehicle = await VehicleModel.findById(transfer.vehicleId).exec();
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Associated vehicle not found.');
    }

    const toHub = await HubModel.findById(transfer.toHubId).exec();
    if (!toHub) {
      throw new ApiError(404, 'HUB_NOT_FOUND', 'Destination hub not found.');
    }

    // 1. Update vehicle assignment to destination hub
    vehicle.currentHubId = new Types.ObjectId(String(toHub._id));
    vehicle.location = {
      name: toHub.name,
      city: toHub.city,
      locationId: toHub.id
    };

    // 2. Transition vehicle to AVAILABLE
    FleetStateMachine.assertTransition(vehicle.fleetStatus || 'TRANSFER_PENDING', 'AVAILABLE');
    vehicle.fleetStatus = 'AVAILABLE';
    vehicle.status = 'ACTIVE';
    await vehicle.save();

    // 3. Mark transfer as COMPLETED
    transfer.status = 'COMPLETED';
    transfer.completedAt = new Date();
    transfer.completedBy = new Types.ObjectId(actor.id);
    await transfer.save();

    await auditService.log(actor, 'TRANSFER_COMPLETED', 'TRANSFER', transfer.id, {
      newState: transfer.toDTO()
    });

    return transfer.toDTO();
  }

  /**
   * Cancels a pending or in-transit transfer, reverting vehicle state and hub capacity
   */
  public async cancelTransfer(
    transferId: string,
    actor: AuthenticatedUser,
    reason?: string
  ): Promise<TransferDTO> {
    const transfer = await FleetTransferModel.findById(transferId).exec();
    if (!transfer || transfer.isDeleted) {
      throw new ApiError(404, 'TRANSFER_NOT_FOUND', `Transfer "${transferId}" not found.`);
    }

    if (transfer.status === 'COMPLETED') {
      throw new ApiError(409, 'TRANSFER_ALREADY_COMPLETED', 'Cannot cancel an already completed transfer.');
    }

    if (transfer.status === 'CANCELLED') {
      return transfer.toDTO();
    }

    const vehicle = await VehicleModel.findById(transfer.vehicleId).exec();
    if (vehicle) {
      // Revert vehicle back to AVAILABLE
      vehicle.fleetStatus = 'AVAILABLE';
      vehicle.status = 'ACTIVE';
      await vehicle.save();
    }

    // Revert Hub counts:
    // Decrement reserved destination capacity
    await HubModel.findOneAndUpdate(
      { _id: transfer.toHubId, currentVehicleCount: { $gt: 0 } },
      { $inc: { currentVehicleCount: -1 } }
    ).exec();

    // Increment source hub capacity back
    await HubModel.findByIdAndUpdate(transfer.fromHubId, {
      $inc: { currentVehicleCount: 1 }
    }).exec();

    transfer.status = 'CANCELLED';
    transfer.cancelledAt = new Date();
    transfer.cancelledBy = new Types.ObjectId(actor.id);
    transfer.notes = `${transfer.notes ? transfer.notes + ' | ' : ''}Cancelled: ${reason || 'Staff decision'}`;
    await transfer.save();

    await auditService.log(actor, 'TRANSFER_CANCELLED', 'TRANSFER', transfer.id, {
      newState: transfer.toDTO(),
      reason
    });

    return transfer.toDTO();
  }

  /**
   * Retrieves transfer history for a specific vehicle
   */
  public async getVehicleTransfers(vehicleId: string): Promise<TransferDTO[]> {
    const isObjectId = mongoose.isValidObjectId(vehicleId);
    let targetVehicleId: Types.ObjectId | null = null;

    if (isObjectId) {
      targetVehicleId = new Types.ObjectId(vehicleId);
    } else {
      const v = await vehicleRepository.findByIdOrCode(vehicleId);
      if (v) targetVehicleId = v._id;
    }

    if (!targetVehicleId) return [];

    const transfers = await FleetTransferModel.find({ vehicleId: targetVehicleId })
      .sort({ createdAt: -1 })
      .exec();

    return transfers.map((t) => t.toDTO());
  }
}

export const fleetTransferService = new FleetTransferService();
export default fleetTransferService;
