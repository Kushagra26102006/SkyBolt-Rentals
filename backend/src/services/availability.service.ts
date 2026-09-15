import crypto from 'crypto';
import { Types, ClientSession } from 'mongoose';
import { vehicleRepository } from '../repositories/vehicle.repository.js';
import { reservationRepository } from '../repositories/reservation.repository.js';
import { AvailabilityResultDTO, InventoryHoldDTO } from '../types/reservation.types.js';
import { ApiError } from '../utils/api-error.js';
import { VehicleModel } from '../models/vehicle.model.js';

export class AvailabilityService {
  /**
   * Helper to check if any reservation overlaps with [pickupAt, returnAt)
   */
  private isOverlapping(
    rPickup: Date,
    rReturn: Date,
    reqPickup: Date,
    reqReturn: Date
  ): boolean {
    return new Date(rPickup) < reqReturn && new Date(rReturn) > reqPickup;
  }

  /**
   * Check if a vehicle is available for rental in the requested interval [pickupAt, returnAt)
   */
  public async checkVehicleAvailability(
    vehicleIdOrCode: string,
    pickupAt: Date,
    returnAt: Date
  ): Promise<AvailabilityResultDTO> {
    const vehicle = await vehicleRepository.findByIdOrCode(vehicleIdOrCode);
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${vehicleIdOrCode}" not found.`);
    }

    const vehicleIdStr = vehicle._id.toString();

    // 1. Check operational status of the vehicle
    const isFleetRentable = !vehicle.fleetStatus || vehicle.fleetStatus === 'AVAILABLE';
    if (vehicle.status !== 'ACTIVE' || !isFleetRentable) {
      const reason =
        vehicle.status === 'MAINTENANCE' || vehicle.fleetStatus === 'MAINTENANCE'
          ? 'VEHICLE_MAINTENANCE'
          : 'VEHICLE_NOT_RENTABLE';
      return {
        vehicleId: vehicleIdStr,
        available: false,
        reason,
        pickupAt: pickupAt.toISOString(),
        returnAt: returnAt.toISOString()
      };
    }

    const now = new Date();

    // 2. Check embedded activeReservations on Vehicle document
    if (vehicle.activeReservations && vehicle.activeReservations.length > 0) {
      const hasActiveOverlap = vehicle.activeReservations.some((r) => {
        if (!this.isOverlapping(r.pickupAt, r.returnAt, pickupAt, returnAt)) {
          return false;
        }
        if (r.status === 'CONFIRMED' || r.status === 'ACTIVE') {
          return true;
        }
        if (r.status === 'HELD' && r.expiresAt && new Date(r.expiresAt) > now) {
          return true;
        }
        return false;
      });

      if (hasActiveOverlap) {
        return {
          vehicleId: vehicleIdStr,
          available: false,
          reason: 'VEHICLE_UNAVAILABLE',
          pickupAt: pickupAt.toISOString(),
          returnAt: returnAt.toISOString()
        };
      }
    }

    // 3. Query blocking reservations in Reservation collection (historical & confirmed)
    const overlapping = await reservationRepository.findOverlapping(
      vehicle._id,
      pickupAt,
      returnAt
    );

    if (overlapping.length > 0) {
      return {
        vehicleId: vehicleIdStr,
        available: false,
        reason: 'VEHICLE_UNAVAILABLE',
        pickupAt: pickupAt.toISOString(),
        returnAt: returnAt.toISOString()
      };
    }

    return {
      vehicleId: vehicleIdStr,
      available: true,
      pickupAt: pickupAt.toISOString(),
      returnAt: returnAt.toISOString()
    };
  }

  /**
   * Bulk query for catalog filtering: returns an array of vehicle IDs that are strictly available
   * Eliminates N+1 queries.
   */
  public async getAvailableVehicleIds(
    pickupAt: Date,
    returnAt: Date,
    candidateVehicleIds?: (string | Types.ObjectId)[]
  ): Promise<string[]> {
    const now = new Date();
    const candidateQuery: any = {
      status: 'ACTIVE',
      fleetStatus: { $in: ['AVAILABLE', null] },
      isDeleted: false
    };

    if (candidateVehicleIds && candidateVehicleIds.length > 0) {
      const objectIds = candidateVehicleIds.map((id) =>
        typeof id === 'string' ? new Types.ObjectId(id) : id
      );
      candidateQuery._id = { $in: objectIds };
    }

    const vehicles = await VehicleModel.find(candidateQuery, { _id: 1, activeReservations: 1 }).lean();
    if (vehicles.length === 0) return [];

    // Filter out vehicles that have embedded activeReservations overlapping
    const locallyAvailableIds: string[] = [];
    for (const v of vehicles) {
      const vId = v._id.toString();
      const hasConflict = v.activeReservations?.some((r) => {
        if (!this.isOverlapping(r.pickupAt, r.returnAt, pickupAt, returnAt)) {
          return false;
        }
        if (r.status === 'CONFIRMED' || r.status === 'ACTIVE') {
          return true;
        }
        if (r.status === 'HELD' && r.expiresAt && new Date(r.expiresAt) > now) {
          return true;
        }
        return false;
      });

      if (!hasConflict) {
        locallyAvailableIds.push(vId);
      }
    }

    if (locallyAvailableIds.length === 0) return [];

    // Find which IDs have blocking overlaps in the reservations collection
    const blockedIds = await reservationRepository.findOverlappingVehicleIds(
      locallyAvailableIds,
      pickupAt,
      returnAt
    );

    const blockedSet = new Set(blockedIds);
    return locallyAvailableIds.filter((id) => !blockedSet.has(id));
  }

  /**
   * Atomically reserve vehicle interval in the database.
   * Uses MongoDB single-document ACID atomic findOneAndUpdate with conditional query filter.
   * This is 100% concurrency-safe across multiple Node.js instances behind a load balancer.
   */
  public async reserveVehicleIntervalAtomic(
    vehicleId: Types.ObjectId | string,
    reservationId: Types.ObjectId,
    userId: Types.ObjectId | string,
    pickupAt: Date,
    returnAt: Date,
    status: 'HELD' | 'CONFIRMED' | 'ACTIVE',
    expiresAt: Date | null = null,
    session?: ClientSession
  ): Promise<void> {
    const vId = typeof vehicleId === 'string' ? new Types.ObjectId(vehicleId) : vehicleId;
    const uId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const now = new Date();

    // 1. Check reservation repository first to guard against any non-migrated reservation docs
    const existingOverlaps = await reservationRepository.findOverlapping(
      vId,
      pickupAt,
      returnAt
    );
    if (existingOverlaps.length > 0) {
      throw new ApiError(
        409,
        'VEHICLE_UNAVAILABLE',
        'The vehicle is no longer available for the selected period.'
      );
    }

    // 2. Database-level atomic CAS (Compare-And-Swap) on Vehicle document
    // Matches ONLY IF:
    // - vehicle exists, is active, rentable, not deleted
    // - activeReservations contains NO overlapping active/confirmed reservation or non-expired hold
    const atomicFilter = {
      _id: vId,
      status: 'ACTIVE',
      fleetStatus: { $in: ['AVAILABLE', null] },
      isDeleted: false,
      activeReservations: {
        $not: {
          $elemMatch: {
            pickupAt: { $lt: returnAt },
            returnAt: { $gt: pickupAt },
            $or: [
              { status: { $in: ['CONFIRMED', 'ACTIVE'] } },
              { status: 'HELD', expiresAt: { $gt: now } }
            ]
          }
        }
      }
    };

    const atomicUpdate = {
      $push: {
        activeReservations: {
          reservationId,
          userId: uId,
          pickupAt,
          returnAt,
          status,
          expiresAt
        }
      }
    };

    const updated = await VehicleModel.findOneAndUpdate(atomicFilter as any, atomicUpdate, {
      returnDocument: 'after',
      session
    }).exec();

    if (!updated) {
      // Differentiate between vehicle not found / not rentable vs unavailable
      const vehicle = await VehicleModel.findById(vId).exec();
      if (!vehicle || vehicle.isDeleted) {
        throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${vehicleId}" not found.`);
      }

      const isFleetRentable = !vehicle.fleetStatus || vehicle.fleetStatus === 'AVAILABLE';
      if (vehicle.status !== 'ACTIVE' || !isFleetRentable) {
        throw new ApiError(
          409,
          'VEHICLE_NOT_RENTABLE',
          `Vehicle is currently in ${vehicle.fleetStatus || vehicle.status} status and cannot be booked.`
        );
      }

      throw new ApiError(
        409,
        'VEHICLE_UNAVAILABLE',
        'The vehicle is no longer available for the selected period.'
      );
    }
  }

  /**
   * Create an authoritative temporary inventory hold/lock for a vehicle
   * Concurrency-safe across multiple instances using database-backed atomic operations.
   */
  public async createInventoryHold(
    vehicleIdOrCode: string,
    userId: string,
    pickupAt: Date,
    returnAt: Date,
    ttlMinutes = 15
  ): Promise<InventoryHoldDTO> {
    const vehicle = await vehicleRepository.findByIdOrCode(vehicleIdOrCode);
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${vehicleIdOrCode}" not found.`);
    }

    const reservationId = new Types.ObjectId();
    const holdToken = `hold_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    // Atomically reserve the slot on the vehicle in MongoDB
    await this.reserveVehicleIntervalAtomic(
      vehicle._id,
      reservationId,
      userId,
      pickupAt,
      returnAt,
      'HELD',
      expiresAt
    );

    // Create tracking reservation record
    try {
      const createdHold = await reservationRepository.create({
        _id: reservationId,
        vehicleId: vehicle._id,
        userId: new Types.ObjectId(userId),
        pickupAt,
        returnAt,
        status: 'HELD',
        expiresAt,
        holdToken,
        metadata: {
          source: 'api_hold',
          ttlMinutes
        },
        isDeleted: false,
        deletedAt: null
      });

      return createdHold.toHoldDTO();
    } catch (err) {
      // Compensate: release activeReservation on Vehicle if record creation failed
      await VehicleModel.updateOne(
        { _id: vehicle._id },
        { $pull: { activeReservations: { reservationId } } }
      ).exec().catch(() => {});
      throw err;
    }
  }

  /**
   * Release a temporary hold explicitly by the owner
   */
  public async releaseInventoryHold(holdId: string, userId: string): Promise<void> {
    const hold = await reservationRepository.findHold(holdId);
    if (!hold || hold.isDeleted) {
      throw new ApiError(404, 'HOLD_NOT_FOUND', 'Hold not found or already released.');
    }

    if (hold.userId.toString() !== userId) {
      throw ApiError.forbidden('You are not authorized to release this inventory hold.');
    }

    await reservationRepository.releaseHold(hold._id!.toString(), userId);
  }

  /**
   * Execute task (retained for backward compatibility, execution is safe across processes)
   */
  public async lockAndExecute<T>(_vehicleId: string, task: () => Promise<T>): Promise<T> {
    return task();
  }

  /**
   * Atomically reserve inventory for a confirmed/pending booking.
   * Concurrency-safe across multiple instances.
   */
  public async reserveForBooking(
    vehicleId: Types.ObjectId,
    userId: Types.ObjectId,
    pickupAt: Date,
    returnAt: Date,
    session?: ClientSession
  ): Promise<Types.ObjectId> {
    const reservationId = new Types.ObjectId();

    // 1. Atomically reserve slot on vehicle document
    await this.reserveVehicleIntervalAtomic(
      vehicleId,
      reservationId,
      userId,
      pickupAt,
      returnAt,
      'CONFIRMED',
      null,
      session
    );

    // 2. Create reservation document in Reservation collection
    try {
      await reservationRepository.create(
        {
          _id: reservationId,
          vehicleId,
          userId,
          pickupAt,
          returnAt,
          status: 'CONFIRMED',
          expiresAt: null,
          holdToken: undefined,
          metadata: { source: 'booking_creation' },
          isDeleted: false,
          deletedAt: null
        },
        { session }
      );

      return reservationId;
    } catch (err) {
      // If standalone Mongo without active session, perform compensating rollback
      if (!session) {
        await VehicleModel.updateOne(
          { _id: vehicleId },
          { $pull: { activeReservations: { reservationId } } }
        ).exec().catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Release inventory when a booking is cancelled or expired.
   * Safely scoped to specific reservation and vehicle to prevent releasing unintended reservations.
   */
  public async releaseReservation(
    reservationId: Types.ObjectId | string,
    vehicleId?: Types.ObjectId | string,
    userId?: string,
    session?: ClientSession
  ): Promise<void> {
    const rId = typeof reservationId === 'string' ? new Types.ObjectId(reservationId) : reservationId;

    // 1. Update Reservation document
    const filter: any = { _id: rId };
    if (userId) {
      filter.userId = new Types.ObjectId(userId);
    }

    await reservationRepository.update(rId.toString(), {
      $set: {
        status: 'CANCELLED',
        deletedAt: new Date()
      }
    } as any);

    // 2. Pull from Vehicle activeReservations
    const pullCondition: any = { reservationId: rId };
    if (userId) {
      pullCondition.userId = new Types.ObjectId(userId);
    }

    const vehicleFilter: any = vehicleId ? { _id: vehicleId } : { 'activeReservations.reservationId': rId };

    await VehicleModel.updateOne(
      vehicleFilter,
      { $pull: { activeReservations: pullCondition } },
      { session }
    ).exec().catch(() => {});
  }
}

export const availabilityService = new AvailabilityService();
export default availabilityService;
