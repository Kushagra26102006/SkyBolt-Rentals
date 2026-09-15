import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { bookingRateLimiter } from '../middleware/rate-limit.middleware.js';

const bookingRoutes = Router();

// All booking routes require authenticated session
bookingRoutes.use(requireAuth);

/**
 * @route   POST /api/v1/bookings
 * @desc    Create a new booking with inventory locking & idempotency
 * @access  Private (Authenticated User)
 */
bookingRoutes.post('/', bookingRateLimiter, bookingController.createBooking);

/**
 * @route   GET /api/v1/bookings
 * @desc    Get paginated booking history for the authenticated user
 * @access  Private (Authenticated User)
 */
bookingRoutes.get('/', bookingController.getMyBookings);

/**
 * @route   GET /api/v1/bookings/:id
 * @desc    Get booking details by ID or reference (ownership enforced)
 * @access  Private (Authenticated User)
 */
bookingRoutes.get('/:id', bookingController.getBookingDetail);

/**
 * @route   POST /api/v1/bookings/:id/cancel
 * @desc    Cancel a booking and release inventory reservation
 * @access  Private (Authenticated User)
 */
bookingRoutes.post('/:id/cancel', bookingController.cancelBooking);

export default bookingRoutes;
