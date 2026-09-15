import mongoose from 'mongoose';
import { BaseRepository } from './base.repository.js';
import { IVehicleDoc, VehicleModel } from '../models/vehicle.model.js';
import { VehicleSortOption } from '../types/vehicle.types.js';

export class VehicleRepository extends BaseRepository<IVehicleDoc> {
  constructor() {
    super(VehicleModel);
  }

  /**
   * Find vehicle by MongoDB ObjectId or unique human-readable vehicleCode
   */
  public async findByIdOrCode(
    idOrCode: string,
    includeProtectedFields = false
  ): Promise<IVehicleDoc | null> {
    const isObjectId = mongoose.isValidObjectId(idOrCode);
    const upperCode = idOrCode.toUpperCase().trim();
    const numericCode = /^\d+$/.test(idOrCode.trim())
      ? `SKY-VHC-${idOrCode.trim().padStart(3, '0')}`
      : null;

    const codeConditions: Array<Record<string, any>> = [{ vehicleCode: upperCode }];
    if (numericCode) {
      codeConditions.push({ vehicleCode: numericCode });
    }

    const filter: Record<string, any> = {
      isDeleted: false,
      ...(isObjectId
        ? { $or: [{ _id: idOrCode }, ...codeConditions] }
        : { $or: codeConditions })
    };

    const query = this.model.findOne(filter);
    if (includeProtectedFields) {
      query.select('+registrationNumber +adminNotes');
    }

    return query.exec();
  }

  /**
   * Check if a registration number already exists in fleet
   */
  public async findByRegistrationNumber(registrationNumber: string): Promise<IVehicleDoc | null> {
    return this.model
      .findOne({
        registrationNumber: registrationNumber.toUpperCase().trim(),
        isDeleted: false
      })
      .select('+registrationNumber')
      .exec();
  }

  /**
   * Query catalog with filtering, allowlisted sorting, and pagination
   */
  public async findWithFilters(
    filter: Record<string, any>,
    sortOption: VehicleSortOption = 'popular',
    skip = 0,
    limit = 12
  ): Promise<IVehicleDoc[]> {
    const sort = this.resolveSortQuery(sortOption);

    return this.model
      .find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .exec();
  }

  /**
   * Count total vehicles matching filter criteria for pagination metadata
   */
  public async countWithFilters(filter: Record<string, any>): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }

  /**
   * Soft-retire vehicle (sets status to RETIRED without hard-deleting record)
   */
  public async retire(id: string): Promise<IVehicleDoc | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { $set: { status: 'RETIRED' } },
        { returnDocument: 'after' }
      )
      .exec();
  }

  /**
   * Safe allowlisted sort mapping preventing arbitrary field injections
   */
  private resolveSortQuery(sort: VehicleSortOption): Record<string, 1 | -1> {
    switch (sort) {
      case 'price_asc':
        return { 'rental.baseRate': 1, _id: 1 };
      case 'price_desc':
        return { 'rental.baseRate': -1, _id: 1 };
      case 'rating_desc':
        return { 'rating.average': -1, 'rating.count': -1, _id: 1 };
      case 'newest':
        return { year: -1, createdAt: -1, _id: 1 };
      case 'popular':
      default:
        return { 'rating.count': -1, 'rating.average': -1, _id: 1 };
    }
  }
}

export const vehicleRepository = new VehicleRepository();
