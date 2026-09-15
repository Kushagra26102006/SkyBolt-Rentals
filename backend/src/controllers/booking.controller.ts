import { Request, Response, NextFunction } from 'express';
import { bookingService } from '../services/booking.service.js';
import {
  createBookingSchema,
  cancelBookingSchema,
  bookingListQuerySchema,
  bookingIdParamSchema
} from '../validators/booking.validator.js';
import { ApiError } from '../utils/api-error.js';
import { CreateBookingInput } from '../types/booking.types.js';

export class BookingController {
  /**
   * POST /api/v1/bookings
   * Initiates a new booking with mutex availability check and idempotency protection
   */
  public async createBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required.');
      }

      // Discard/ignore any client-supplied userId, status, paymentStatus, or pricingSnapshot
      const validatedInput = createBookingSchema.parse(req.body);
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

      const { booking, isCached } = await bookingService.createBooking(
        req.user.id,
        validatedInput as CreateBookingInput,
        idempotencyKey
      );

      res.status(201).json({
        success: true,
        statusCode: 201,
        message: isCached ? 'Cached booking returned (idempotent)' : 'Booking created successfully',
        data: booking
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/bookings
   * Retrieves paginated bookings owned by the authenticated user
   */
  public async getMyBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required.');
      }

      const validatedQuery = bookingListQuerySchema.parse(req.query);
      const result = await bookingService.getUserBookings(req.user.id, validatedQuery);

      res.status(200).json({
        success: true,
        statusCode: 200,
        data: result.data,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/bookings/:id
   * Retrieves single booking detail with strict ownership protection
   */
  public async getBookingDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required.');
      }

      const { id } = bookingIdParamSchema.parse(req.params);
      const booking = await bookingService.getBookingById(id, req.user);

      res.status(200).json({
        success: true,
        statusCode: 200,
        data: booking
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/bookings/:id/cancel
   * Cancels a booking and releases inventory hold
   */
  public async cancelBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required.');
      }

      const { id } = bookingIdParamSchema.parse(req.params);
      const validatedBody = cancelBookingSchema.parse(req.body);

      const booking = await bookingService.cancelBooking(id, req.user, validatedBody);

      res.status(200).json({
        success: true,
        statusCode: 200,
        message: 'Booking cancelled successfully.',
        data: booking
      });
    } catch (err) {
      next(err);
    }
  }
}

export const bookingController = new BookingController();
export default bookingController;
