import { Types } from 'mongoose';
import { VehicleModel, toSafeVehicle } from '../models/vehicle.model.js';
import { BookingModel } from '../models/booking.model.js';
import { ApiError } from '../utils/api-error.js';
import {
  VehicleDTO,
  OwnerStatsDTO,
  OwnerEarningsDTO
} from '../types/vehicle.types.js';
import {
  CreateOwnerVehicleInput,
  UpdateOwnerVehicleInput
} from '../validators/owner.validator.js';
import { vehicleService } from './vehicle.service.js';

export class OwnerService {
  /**
   * Generates a clean, unique vehicle code for owner listings
   */
  private generateOwnerVehicleCode(category: string): string {
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
    return `OWN-${category.toUpperCase()}-${timestamp}-${randomHex}`;
  }

  /**
   * Create a new vehicle listing by authenticated owner
   * Strict security: ownerId is derived only from authenticated session, status is locked to PENDING_APPROVAL
   */
  public async createVehicle(
    ownerId: string,
    input: CreateOwnerVehicleInput
  ): Promise<VehicleDTO> {
    const ownerObjectId = new Types.ObjectId(ownerId);
    let vehicleCode = this.generateOwnerVehicleCode(input.category);

    // Ensure vehicleCode collision safety
    let collision = await VehicleModel.findOne({ vehicleCode }).exec();
    while (collision) {
      vehicleCode = this.generateOwnerVehicleCode(input.category);
      collision = await VehicleModel.findOne({ vehicleCode }).exec();
    }

    const created = await VehicleModel.create({
      ...input,
      vehicleCode,
      ownerId: ownerObjectId,
      status: 'PENDING_APPROVAL', // Marketplace listings always start in PENDING_APPROVAL
      fleetStatus: 'UNAVAILABLE',
      rating: { average: 0, count: 0 },
      isDeleted: false,
      deletedAt: null
    });

    await vehicleService.invalidateVehicleCaches(String(created._id), created.vehicleCode);

    return toSafeVehicle(created);
  }

  /**
   * List all vehicles owned by authenticated owner
   */
  public async getVehicles(ownerId: string): Promise<VehicleDTO[]> {
    const ownerObjectId = new Types.ObjectId(ownerId);
    const vehicles = await VehicleModel.find({
      ownerId: ownerObjectId,
      isDeleted: false
    })
      .sort({ createdAt: -1 })
      .exec();

    return vehicles.map(toSafeVehicle);
  }

  /**
   * Retrieve a specific vehicle owned by authenticated owner
   */
  public async getVehicleById(ownerId: string, vehicleId: string): Promise<VehicleDTO> {
    const ownerObjectId = new Types.ObjectId(ownerId);
    let query: Record<string, any> = {
      ownerId: ownerObjectId,
      isDeleted: false
    };

    if (Types.ObjectId.isValid(vehicleId)) {
      query._id = vehicleId;
    } else {
      query.vehicleCode = vehicleId.toUpperCase().trim();
    }

    const vehicle = await VehicleModel.findOne(query).exec();
    if (!vehicle) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle listing not found or access denied.');
    }

    return toSafeVehicle(vehicle);
  }

  /**
   * Update an existing vehicle owned by authenticated owner
   * Prevents modifying status, ownerId, vehicleCode, or admin fields
   */
  public async updateVehicle(
    ownerId: string,
    vehicleId: string,
    input: UpdateOwnerVehicleInput
  ): Promise<VehicleDTO> {
    const ownerObjectId = new Types.ObjectId(ownerId);
    const isObjectId = Types.ObjectId.isValid(vehicleId);

    const vehicle = await VehicleModel.findOne({
      ...(isObjectId ? { _id: vehicleId } : { vehicleCode: vehicleId.toUpperCase().trim() }),
      ownerId: ownerObjectId,
      isDeleted: false
    }).exec();

    if (!vehicle) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle listing not found or access denied.');
    }

    // Apply allowed modifications
    if (input.brand) vehicle.brand = input.brand;
    if (input.model) vehicle.set('model', input.model);
    if (input.name) vehicle.name = input.name;
    if (input.variant !== undefined) vehicle.variant = input.variant;
    if (input.year) vehicle.year = input.year;
    if (input.category) vehicle.category = input.category;
    if (input.description !== undefined) vehicle.description = input.description;
    if (input.features) vehicle.features = input.features;
    if (input.images) vehicle.images = input.images as any;

    if (input.specifications) {
      vehicle.specifications = {
        ...vehicle.specifications,
        ...input.specifications
      };
    }

    if (input.rental) {
      vehicle.rental = {
        ...vehicle.rental,
        ...input.rental
      };
    }

    if (input.location) {
      vehicle.location = {
        ...vehicle.location,
        ...input.location
      };
    }

    await vehicle.save();
    await vehicleService.invalidateVehicleCaches(String(vehicle._id), vehicle.vehicleCode);

    return toSafeVehicle(vehicle);
  }

  /**
   * Toggle owner vehicle active/inactive state
   * Note: Owner cannot approve a PENDING_APPROVAL, REJECTED, or SUSPENDED vehicle
   */
  public async toggleVehicleStatus(
    ownerId: string,
    vehicleId: string,
    desiredStatus: 'ACTIVE' | 'INACTIVE'
  ): Promise<VehicleDTO> {
    const ownerObjectId = new Types.ObjectId(ownerId);
    const isObjectId = Types.ObjectId.isValid(vehicleId);

    const vehicle = await VehicleModel.findOne({
      ...(isObjectId ? { _id: vehicleId } : { vehicleCode: vehicleId.toUpperCase().trim() }),
      ownerId: ownerObjectId,
      isDeleted: false
    }).exec();

    if (!vehicle) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle listing not found or access denied.');
    }

    if (vehicle.status === 'PENDING_APPROVAL') {
      throw new ApiError(
        400,
        'APPROVAL_PENDING',
        'This vehicle is pending administrative review. You can only activate it after it is approved.'
      );
    }

    if (vehicle.status === 'REJECTED' || vehicle.status === 'SUSPENDED') {
      throw new ApiError(
        403,
        'LISTING_SUSPENDED',
        `This vehicle has been ${vehicle.status.toLowerCase()} by platform administrators.`
      );
    }

    vehicle.status = desiredStatus;
    vehicle.fleetStatus = desiredStatus === 'ACTIVE' ? 'AVAILABLE' : 'UNAVAILABLE';
    await vehicle.save();

    await vehicleService.invalidateVehicleCaches(String(vehicle._id), vehicle.vehicleCode);

    return toSafeVehicle(vehicle);
  }

  /**
   * Soft-delete vehicle owned by authenticated owner
   */
  public async deleteVehicle(ownerId: string, vehicleId: string): Promise<void> {
    const ownerObjectId = new Types.ObjectId(ownerId);
    const isObjectId = Types.ObjectId.isValid(vehicleId);

    const vehicle = await VehicleModel.findOne({
      ...(isObjectId ? { _id: vehicleId } : { vehicleCode: vehicleId.toUpperCase().trim() }),
      ownerId: ownerObjectId,
      isDeleted: false
    }).exec();

    if (!vehicle) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle listing not found or access denied.');
    }

    // Check for active ongoing bookings
    const activeBooking = await BookingModel.findOne({
      vehicleId: vehicle._id,
      status: { $in: ['CONFIRMED', 'ACTIVE'] },
      isDeleted: false
    }).exec();

    if (activeBooking) {
      throw new ApiError(
        409,
        'ACTIVE_BOOKING_EXISTS',
        'Cannot remove vehicle with active or confirmed customer reservations.'
      );
    }

    vehicle.isDeleted = true;
    vehicle.deletedAt = new Date();
    vehicle.status = 'RETIRED';
    vehicle.fleetStatus = 'RETIRED';
    await vehicle.save();

    await vehicleService.invalidateVehicleCaches(String(vehicle._id), vehicle.vehicleCode);
  }

  /**
   * Get all booking requests / rentals for vehicles belonging to this owner
   */
  public async getBookings(ownerId: string): Promise<any[]> {
    const ownerObjectId = new Types.ObjectId(ownerId);

    // Find all vehicles owned by this owner
    const vehicles = await VehicleModel.find({
      ownerId: ownerObjectId,
      isDeleted: false
    })
      .select('_id name brand model category vehicleCode images rental')
      .exec();

    const vehicleIds = vehicles.map((v) => v._id);
    const vehicleMap = new Map<string, any>();
    vehicles.forEach((v) => vehicleMap.set(String(v._id), v));

    // Find all bookings for these vehicles (or matching ownerId directly)
    const bookings = await BookingModel.find({
      $or: [{ ownerId: ownerObjectId }, { vehicleId: { $in: vehicleIds } }],
      isDeleted: false
    })
      .populate('userId', 'name email phone avatar')
      .sort({ createdAt: -1 })
      .exec();

    return bookings.map((b) => {
      const v = vehicleMap.get(String(b.vehicleId));
      const customer = b.userId as any;
      const rentalAmount = b.pricingSnapshot?.baseAmount || b.pricingSnapshot?.total || 0;
      const ownerEarning = Math.round(rentalAmount * 0.85); // 85% marketplace owner payout

      return {
        id: String(b._id),
        bookingReference: b.bookingReference,
        pickupAt: b.pickupAt.toISOString(),
        returnAt: b.returnAt.toISOString(),
        status: b.status,
        paymentStatus: b.paymentStatus,
        customer: {
          name: customer?.name || 'Customer',
          email: customer?.email || '',
          phone: customer?.phone || ''
        },
        vehicle: {
          id: String(b.vehicleId),
          name: b.vehicleSnapshot?.name || v?.name || 'Vehicle',
          brand: b.vehicleSnapshot?.brand || v?.brand || '',
          model: b.vehicleSnapshot?.model || v?.model || '',
          image: b.vehicleSnapshot?.image || (v?.images?.[0]?.url || 'assets/images/car-tour.webp')
        },
        pricing: {
          total: b.pricingSnapshot?.total || 0,
          currency: b.pricingSnapshot?.currency || 'INR',
          ownerEarning
        },
        createdAt: b.createdAt.toISOString()
      };
    });
  }

  /**
   * Authoritatively calculate owner earnings and transaction history
   */
  public async getEarnings(ownerId: string): Promise<OwnerEarningsDTO> {
    const bookings = await this.getBookings(ownerId);

    let totalEarnings = 0;
    let pendingEarnings = 0;
    let completedEarnings = 0;

    const recentTransactions: OwnerEarningsDTO['recentTransactions'] = [];

    bookings.forEach((b) => {
      const amount = b.pricing.ownerEarning;

      if (b.paymentStatus === 'PAID') {
        totalEarnings += amount;

        if (b.status === 'COMPLETED') {
          completedEarnings += amount;
        } else if (b.status === 'CONFIRMED' || b.status === 'ACTIVE') {
          pendingEarnings += amount;
        }

        recentTransactions.push({
          bookingReference: b.bookingReference,
          vehicleName: b.vehicle.name,
          pickupAt: b.pickupAt,
          returnAt: b.returnAt,
          bookingStatus: b.status,
          paymentStatus: b.paymentStatus,
          amount,
          createdAt: b.createdAt
        });
      }
    });

    return {
      totalEarnings,
      pendingEarnings,
      completedEarnings,
      currency: 'INR',
      recentTransactions: recentTransactions.slice(0, 25)
    };
  }

  /**
   * Overview dashboard metrics for authenticated owner
   */
  public async getDashboardStats(ownerId: string): Promise<OwnerStatsDTO> {
    const ownerObjectId = new Types.ObjectId(ownerId);

    const vehicles = await VehicleModel.find({
      ownerId: ownerObjectId,
      isDeleted: false
    }).exec();

    const totalVehicles = vehicles.length;
    const activeVehicles = vehicles.filter((v) => v.status === 'ACTIVE').length;
    const pendingApprovalVehicles = vehicles.filter((v) => v.status === 'PENDING_APPROVAL').length;

    const bookings = await this.getBookings(ownerId);
    const totalBookings = bookings.length;
    const upcomingRentals = bookings.filter((b) => b.status === 'CONFIRMED').length;
    const completedRentals = bookings.filter((b) => b.status === 'COMPLETED').length;

    const earnings = await this.getEarnings(ownerId);

    return {
      totalVehicles,
      activeVehicles,
      pendingApprovalVehicles,
      totalBookings,
      upcomingRentals,
      completedRentals,
      totalEarnings: earnings.totalEarnings
    };
  }
}

export const ownerService = new OwnerService();
