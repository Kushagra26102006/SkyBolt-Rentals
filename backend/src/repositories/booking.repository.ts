import { Types } from 'mongoose';
import { BaseRepository } from './base.repository.js';
import { IBookingDoc, BookingModel } from '../models/booking.model.js';
import { BookingSortField, BookingStatus } from '../types/booking.types.js';

export class BookingRepository extends BaseRepository<IBookingDoc> {
  constructor() {
    super(BookingModel);
  }

  /**
   * Find booking by ID scoped strictly to an authenticated user
   */
  public async findByIdAndUser(
    bookingId: string | Types.ObjectId,
    userId: string | Types.ObjectId
  ): Promise<IBookingDoc | null> {
    const bId = typeof bookingId === 'string' ? new Types.ObjectId(bookingId) : bookingId;
    const uId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

    return this.model
      .findOne({
        _id: bId,
        userId: uId,
        isDeleted: false
      })
      .exec();
  }

  /**
   * Find booking by human-readable reference
   */
  public async findByReference(reference: string): Promise<IBookingDoc | null> {
    return this.model
      .findOne({
        bookingReference: reference.toUpperCase().trim(),
        isDeleted: false
      })
      .exec();
  }

  /**
   * Find all bookings for a user with validated filtering, allowlisted sorting, and bounded pagination
   */
  public async findUserBookings(
    userId: string | Types.ObjectId,
    filters: {
      status?: BookingStatus;
      from?: Date;
      to?: Date;
      vehicleId?: string;
    },
    pagination: {
      page: number;
      limit: number;
    },
    sort: BookingSortField = 'newest'
  ): Promise<{
    bookings: IBookingDoc[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const uId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const query: Record<string, any> = {
      userId: uId,
      isDeleted: false
    };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.vehicleId && Types.ObjectId.isValid(filters.vehicleId)) {
      query.vehicleId = new Types.ObjectId(filters.vehicleId);
    }

    if (filters.from || filters.to) {
      query.pickupAt = {};
      if (filters.from) query.pickupAt.$gte = filters.from;
      if (filters.to) query.pickupAt.$lte = filters.to;
    }

    // Allowlisted sort definitions
    const sortCriteria: Record<string, 1 | -1> = {};
    switch (sort) {
      case 'oldest':
        sortCriteria.createdAt = 1;
        break;
      case 'pickup_soonest':
        sortCriteria.pickupAt = 1;
        break;
      case 'pickup_latest':
        sortCriteria.pickupAt = -1;
        break;
      case 'newest':
      default:
        sortCriteria.createdAt = -1;
        break;
    }

    const page = Math.max(1, pagination.page);
    const limit = Math.min(100, Math.max(1, pagination.limit));
    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      this.model.find(query).sort(sortCriteria).skip(skip).limit(limit).exec(),
      this.model.countDocuments(query).exec()
    ]);

    return {
      bookings,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1
    };
  }
}

export const bookingRepository = new BookingRepository();
export default bookingRepository;
