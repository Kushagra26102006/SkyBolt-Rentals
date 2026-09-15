import mongoose, { ClientSession, Types } from 'mongoose';
import { BaseRepository } from './base.repository.js';
import { IHubDoc, HubModel } from '../models/hub.model.js';
import { HubListQuery } from '../types/fleet.types.js';

export class HubRepository extends BaseRepository<IHubDoc> {
  constructor() {
    super(HubModel);
  }

  /**
   * Find hub by unique code (case-insensitive)
   */
  public async findByCode(code: string): Promise<IHubDoc | null> {
    return this.model
      .findOne({
        code: code.trim().toUpperCase(),
        isDeleted: false
      })
      .exec();
  }

  /**
   * Find active hub by ID or code
   */
  public async findByIdOrCode(idOrCode: string): Promise<IHubDoc | null> {
    const isObjectId = mongoose.isValidObjectId(idOrCode);
    const filter: Record<string, unknown> = {
      isDeleted: false,
      ...(isObjectId
        ? { $or: [{ _id: new Types.ObjectId(idOrCode) }, { code: idOrCode.trim().toUpperCase() }] }
        : { code: idOrCode.trim().toUpperCase() })
    };

    return this.model.findOne(filter).exec();
  }

  /**
   * Query hubs with pagination and filtering
   */
  public async findWithFilters(
    query: HubListQuery
  ): Promise<{ hubs: IHubDoc[]; total: number; page: number; limit: number }> {
    const filter: Record<string, unknown> = { isDeleted: false };

    if (query.city) {
      filter.city = new RegExp(`^${query.city.trim()}$`, 'i');
    }

    if (query.operationalStatus) {
      filter.operationalStatus = query.operationalStatus;
    }

    if (query.search) {
      const regex = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ name: regex }, { code: regex }, { city: regex }, { address: regex }];
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [hubs, total] = await Promise.all([
      this.model.find(filter).sort({ name: 1 }).skip(skip).limit(limit).exec(),
      this.model.countDocuments(filter).exec()
    ]);

    return { hubs, total, page, limit };
  }

  /**
   * Atomically adjust hub vehicle count
   */
  public async adjustVehicleCount(
    hubId: string | Types.ObjectId,
    delta: number,
    session?: ClientSession
  ): Promise<IHubDoc | null> {
    const filter = { _id: hubId };
    const update = { $inc: { currentVehicleCount: delta } };
    const options = { returnDocument: 'after' as const, session };

    return this.model.findOneAndUpdate(filter, update, options).exec();
  }
}

export const hubRepository = new HubRepository();
export default hubRepository;
