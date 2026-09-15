import mongoose, { Types } from 'mongoose';
import { BaseRepository } from './base.repository.js';
import { IReservationDoc, ReservationModel } from '../models/reservation.model.js';
import { VehicleModel } from '../models/vehicle.model.js';

export class ReservationRepository extends BaseRepository<IReservationDoc> {
  constructor() {
    super(ReservationModel);
  }

  /**
   * Helper to build the blocking reservation query for an interval [pickupAt, returnAt)
   * Formula: existing.pickupAt < returnAt AND existing.returnAt > pickupAt
   */
  private buildOverlapQuery(
    pickupAt: Date,
    returnAt: Date,
    now: Date = new Date()
  ): Record<string, any> {
    return {
      isDeleted: false,
      pickupAt: { $lt: returnAt },
      returnAt: { $gt: pickupAt },
      $or: [
        { status: { $in: ['CONFIRMED', 'ACTIVE'] } },
        {
          status: 'HELD',
          expiresAt: { $gt: now }
        }
      ]
    };
  }

  /**
   * Find blocking overlapping reservations for a specific vehicle
   */
  public async findOverlapping(
    vehicleId: string | Types.ObjectId,
    pickupAt: Date,
    returnAt: Date,
    excludeReservationId?: string | Types.ObjectId
  ): Promise<IReservationDoc[]> {
    const vId = typeof vehicleId === 'string' ? new Types.ObjectId(vehicleId) : vehicleId;
    const filter: Record<string, any> = {
      vehicleId: vId,
      ...this.buildOverlapQuery(pickupAt, returnAt)
    };

    if (excludeReservationId) {
      const exId =
        typeof excludeReservationId === 'string'
          ? new Types.ObjectId(excludeReservationId)
          : excludeReservationId;
      filter._id = { $ne: exId };
    }

    return this.model.find(filter).lean().exec() as unknown as Promise<IReservationDoc[]>;
  }

  /**
   * Bulk query: identify which vehicle IDs from a list have blocking overlaps
   * Used for catalog availability filtering without N+1 queries.
   */
  public async findOverlappingVehicleIds(
    vehicleIds: (string | Types.ObjectId)[],
    pickupAt: Date,
    returnAt: Date
  ): Promise<string[]> {
    if (!vehicleIds.length) return [];

    const objectIds = vehicleIds.map((id) =>
      typeof id === 'string' ? new Types.ObjectId(id) : id
    );

    const filter = {
      vehicleId: { $in: objectIds },
      ...this.buildOverlapQuery(pickupAt, returnAt)
    };

    const distinctVehicleIds = await this.model.distinct('vehicleId', filter);
    return distinctVehicleIds.map((id) => id.toString());
  }

  /**
   * Find a hold by its ID or unique cryptographically generated holdToken
   */
  public async findHold(idOrToken: string): Promise<IReservationDoc | null> {
    const isObjectId = mongoose.isValidObjectId(idOrToken);
    const filter: Record<string, any> = {
      isDeleted: false,
      ...(isObjectId ? { $or: [{ _id: idOrToken }, { holdToken: idOrToken }] } : { holdToken: idOrToken })
    };

    return this.model.findOne(filter).exec();
  }

  /**
   * Release a temporary hold explicitly by the owner
   */
  public async releaseHold(holdId: string, userId: string): Promise<IReservationDoc | null> {
    const released = await this.model
      .findOneAndUpdate(
        {
          _id: holdId,
          userId,
          status: 'HELD',
          isDeleted: false
        },
        {
          $set: {
            status: 'CANCELLED',
            deletedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      )
      .exec();

    if (released) {
      const holdObjectId = typeof released._id === 'string' ? new Types.ObjectId(released._id) : released._id;
      await VehicleModel.updateOne(
        { _id: released.vehicleId },
        { $pull: { activeReservations: { reservationId: holdObjectId } } }
      ).exec().catch(() => {});
    }

    return released;
  }

  /**
   * Lazily expire stale holds in background
   */
  public async expireStaleHolds(now: Date = new Date()): Promise<number> {
    const result = await this.model.updateMany(
      {
        status: 'HELD',
        expiresAt: { $lte: now },
        isDeleted: false
      },
      {
        $set: { status: 'EXPIRED' }
      }
    );

    await VehicleModel.updateMany(
      {},
      {
        $pull: {
          activeReservations: {
            status: 'HELD',
            expiresAt: { $lte: now }
          }
        }
      }
    ).exec().catch(() => {});

    return result.modifiedCount;
  }
}

export const reservationRepository = new ReservationRepository();
export default reservationRepository;
