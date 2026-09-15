import { Types } from 'mongoose';
import { vehicleRepository } from '../repositories/vehicle.repository.js';
import { availabilityService } from './availability.service.js';
import { toSafeVehicle, toAdminVehicle } from '../models/vehicle.model.js';
import { ApiError } from '../utils/api-error.js';
import { escapeRegex } from '../utils/regex.util.js';
import {
  VehicleDTO,
  AdminVehicleDTO,
  PaginatedVehiclesResult
} from '../types/vehicle.types.js';
import { UserRole } from '../types/auth.types.js';
import { cacheService } from './cache.service.js';
import { cacheKeys } from '../utils/cache-keys.js';
import {
  ListVehiclesQueryInput,
  CreateVehicleInput,
  UpdateVehicleInput
} from '../validators/vehicle.validator.js';

export class VehicleService {
  /**
   * Query vehicle catalog with authoritative server-side filtering, sorting & pagination
   */
  public async listVehicles(
    query: ListVehiclesQueryInput,
    userRole?: UserRole
  ): Promise<PaginatedVehiclesResult> {
    const isAdmin = userRole === 'ADMIN' || userRole === 'FLEET_MANAGER';
    const filter: Record<string, any> = { isDeleted: false };

    // 1. Status Filter: Public queries can ONLY see ACTIVE vehicles
    if (!isAdmin) {
      filter.status = 'ACTIVE';
    } else if (query.status) {
      filter.status = query.status;
    }

    // 2. Category Filter
    if (query.category) {
      if (typeof query.category === 'string' && query.category.includes(',')) {
        filter.category = { $in: query.category.split(',').map((c: string) => c.trim()) };
      } else if (query.category === 'CAR') {
        filter.category = { $in: ['CAR', 'SEDAN', 'SUV', 'LUXURY', 'EV', 'HATCHBACK'] };
      } else if (query.category === 'BIKE') {
        filter.category = { $in: ['BIKE', 'MOTORCYCLE'] };
      } else {
        filter.category = query.category;
      }
    }

    // 3. Fuel Type & Transmission Filters
    if (query.fuelType) {
      filter['specifications.fuelType'] = query.fuelType;
    }
    if (query.transmission) {
      filter['specifications.transmission'] = query.transmission;
    }

    // 4. Seats Filter
    if (query.seats) {
      filter['specifications.seats'] = query.seats;
    }

    // 5. Price Range Filter
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filter['rental.baseRate'] = {};
      if (query.minPrice !== undefined) {
        filter['rental.baseRate'].$gte = query.minPrice;
      }
      if (query.maxPrice !== undefined) {
        filter['rental.baseRate'].$lte = query.maxPrice;
      }
    }

    // 6. Brand Filter
    if (query.brand) {
      filter.brand = { $regex: escapeRegex(query.brand.trim()), $options: 'i' };
    }

    // 7. Location Filter
    if (query.location && query.location.toLowerCase() !== 'all') {
      filter['location.name'] = { $regex: escapeRegex(query.location.trim()), $options: 'i' };
    }

    // 8. Keyword Search Filter (name, brand, model)
    if (query.search && query.search.trim()) {
      const escaped = escapeRegex(query.search.trim());
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { brand: { $regex: escaped, $options: 'i' } },
        { model: { $regex: escaped, $options: 'i' } }
      ];
    }

    // 8.5 Date Range Availability Filter (using availabilityService without N+1 queries)
    if (query.pickupAt && query.returnAt) {
      const pickupDate = new Date(query.pickupAt);
      const returnDate = new Date(query.returnAt);
      if (!isNaN(pickupDate.getTime()) && !isNaN(returnDate.getTime()) && pickupDate < returnDate) {
        const availableIds = await availabilityService.getAvailableVehicleIds(pickupDate, returnDate);
        filter._id = { $in: availableIds.map((id) => new Types.ObjectId(id)) };
      }
    }

    // 9. Pagination calculations
    const page = query.page || 1;
    const limit = query.limit || 12;
    const skip = (page - 1) * limit;

    const fetcher = async () => {
      const [total, vehicles] = await Promise.all([
        vehicleRepository.countWithFilters(filter),
        vehicleRepository.findWithFilters(filter, query.sort || 'popular', skip, limit)
      ]);

      const totalPages = Math.ceil(total / limit) || 1;
      const items = vehicles.map((v) => (isAdmin ? toAdminVehicle(v) : toSafeVehicle(v)));

      return {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    };

    if (!isAdmin) {
      return await cacheService.getOrSet(
        cacheKeys.vehicleCatalog(query as Record<string, any>),
        fetcher,
        60 // 60s catalog cache TTL
      );
    }

    return await fetcher();
  }

  /**
   * Invalidate vehicle caches
   */
  public async invalidateVehicleCaches(id: string, code?: string): Promise<void> {
    const keys = [cacheKeys.vehicle(id)];
    if (code) {
      keys.push(cacheKeys.vehicleByCode(code));
      keys.push(cacheKeys.vehicle(code));
    }
    await cacheService.del(keys);
    await cacheService.delByPattern(cacheKeys.patterns.vehicleCatalog());
  }

  /**
   * Retrieve a single vehicle by MongoDB _id or human-readable vehicleCode
   */
  public async getVehicleById(
    idOrCode: string,
    userRole?: UserRole
  ): Promise<VehicleDTO | AdminVehicleDTO> {
    const isAdmin = userRole === 'ADMIN' || userRole === 'FLEET_MANAGER';

    const fetcher = async () => {
      const vehicle = await vehicleRepository.findByIdOrCode(idOrCode, isAdmin);

      if (!vehicle || vehicle.isDeleted) {
        throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${idOrCode}" not found.`);
      }

      // Non-admin cannot view DRAFT, MAINTENANCE, or RETIRED vehicles
      if (!isAdmin && vehicle.status !== 'ACTIVE') {
        throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle is currently unavailable.');
      }

      return isAdmin ? toAdminVehicle(vehicle) : toSafeVehicle(vehicle);
    };

    if (!isAdmin) {
      return await cacheService.getOrSet(
        cacheKeys.vehicle(idOrCode),
        fetcher,
        300 // 5 minutes TTL
      );
    }

    return await fetcher();
  }

  /**
   * Create a new vehicle record (Admin/Fleet Manager only)
   */
  public async createVehicle(
    input: CreateVehicleInput,
    _userRole: UserRole
  ): Promise<AdminVehicleDTO> {
    // 1. Generate unique vehicle code if omitted
    const vehicleCode =
      input.vehicleCode ||
      `SKY-${input.category}-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    // 2. Enforce code uniqueness
    const existingCode = await vehicleRepository.findByIdOrCode(vehicleCode);
    if (existingCode) {
      throw new ApiError(409, 'VEHICLE_ALREADY_EXISTS', `Vehicle with code "${vehicleCode}" already exists.`);
    }

    // 3. Enforce registration number uniqueness if provided
    if (input.registrationNumber) {
      const existingReg = await vehicleRepository.findByRegistrationNumber(
        input.registrationNumber
      );
      if (existingReg) {
        throw new ApiError(
          409,
          'DUPLICATE_REGISTRATION',
          `Vehicle with registration number "${input.registrationNumber}" already exists.`
        );
      }
    }

    // 4. Persist to MongoDB
    const created = await vehicleRepository.create({
      ...input,
      specifications: {
        seats: input.specifications.seats,
        transmission: input.specifications.transmission,
        fuelType: input.specifications.fuelType,
        doors: input.specifications.doors,
        engineCC: input.specifications.engineCC,
        mileage: input.specifications.mileage,
        luggageCapacity: input.specifications.luggageCapacity
      },
      rental: {
        baseRate: input.rental.baseRate,
        currency: input.rental.currency || 'INR',
        deposit: input.rental.deposit || 0
      },
      vehicleCode,
      rating: { average: 0, count: 0 },
      isDeleted: false,
      deletedAt: null
    });

    await this.invalidateVehicleCaches(String(created._id), created.vehicleCode);

    return toAdminVehicle(created);
  }

  /**
   * Update an existing vehicle (Admin/Fleet Manager only)
   */
  public async updateVehicle(
    idOrCode: string,
    input: UpdateVehicleInput,
    userRole: UserRole
  ): Promise<AdminVehicleDTO> {
    const existing = await vehicleRepository.findByIdOrCode(idOrCode, true);
    if (!existing || existing.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${idOrCode}" not found.`);
    }

    // 1. Status transition check: only ADMIN can un-retire a vehicle
    if (input.status === 'ACTIVE' && existing.status === 'RETIRED' && userRole !== 'ADMIN') {
      throw ApiError.forbidden('Only administrators can reactivate a retired vehicle.');
    }

    // 2. Check registration number uniqueness if changing
    if (
      input.registrationNumber &&
      input.registrationNumber.toUpperCase() !== existing.registrationNumber
    ) {
      const dup = await vehicleRepository.findByRegistrationNumber(input.registrationNumber);
      if (dup && String(dup._id) !== String(existing._id)) {
        throw new ApiError(
          409,
          'DUPLICATE_REGISTRATION',
          `Vehicle with registration number "${input.registrationNumber}" already exists.`
        );
      }
    }

    const updated = await vehicleRepository.update(String(existing._id), { $set: input });
    if (!updated) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle could not be updated.');
    }

    await this.invalidateVehicleCaches(String(existing._id), existing.vehicleCode);

    return toAdminVehicle(updated);
  }

  /**
   * Soft-retire a vehicle from service (Admin only)
   */
  public async retireVehicle(idOrCode: string): Promise<AdminVehicleDTO> {
    const existing = await vehicleRepository.findByIdOrCode(idOrCode);
    if (!existing || existing.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${idOrCode}" not found.`);
    }

    const retired = await vehicleRepository.retire(String(existing._id));
    if (!retired) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle could not be retired.');
    }

    await this.invalidateVehicleCaches(String(existing._id), existing.vehicleCode);

    return toAdminVehicle(retired);
  }
}

export const vehicleService = new VehicleService();
