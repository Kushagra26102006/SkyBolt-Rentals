import { Job } from 'bullmq';
import { Types } from 'mongoose';
import { BookingModel } from '../../models/booking.model.js';
import { ReviewModel } from '../../models/review.model.js';
import { availabilityService } from '../../services/availability.service.js';
import { notificationService } from '../../notifications/notification.service.js';
import { NotificationType, NotificationChannel, NotificationPriority } from '../../notifications/notification.types.js';
import { config } from '../../config/env.config.js';

export interface BookingJobData {
  type: 'PICKUP_REMINDER' | 'RETURN_REMINDER' | 'EXPIRED_CLEANUP' | 'REVIEW_INVITATION';
  bookingId?: string;
  metadata?: Record<string, any>;
}

export async function processBookingJob(job: Job<BookingJobData>): Promise<any> {
  const { type, bookingId } = job.data;

  if (!config.isTest) {
    console.log(`[SkyBolt Worker] Processing booking job ${job.id} (${type})`);
  }

  switch (type) {
    case 'PICKUP_REMINDER': {
      if (!bookingId || !Types.ObjectId.isValid(bookingId)) {
        return { skipped: true, reason: 'INVALID_BOOKING_ID' };
      }

      const booking = await BookingModel.findById(bookingId).exec();
      if (!booking || booking.isDeleted) {
        return { skipped: true, reason: 'BOOKING_NOT_FOUND' };
      }

      // Stale Job Protection: Only send pickup reminders for CONFIRMED bookings
      if (booking.status !== 'CONFIRMED') {
        if (!config.isTest) {
          console.log(`[SkyBolt Worker] Skipping pickup reminder for booking ${bookingId} in status "${booking.status}"`);
        }
        return { skipped: true, reason: `STALE_STATUS_${booking.status}` };
      }

      // Enqueue pickup reminder notification
      await notificationService.enqueue({
        type: NotificationType.VEHICLE_ASSIGNED,
        userId: booking.userId.toString(),
        bookingId: booking._id.toString(),
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
        priority: NotificationPriority.HIGH,
        templateData: {
          customerName: 'Valued Customer',
          bookingReference: booking.bookingReference,
          vehicleName: booking.vehicleSnapshot?.name || 'Your Reserved Vehicle',
          vehiclePlate: booking.vehicleSnapshot?.registrationNumber || 'Assigned at Hub',
          pickupTime: new Date(booking.pickupAt).toLocaleString(),
          pickupLocation: booking.pickupLocation?.name || 'Designated Hub',
          hubAddress: booking.pickupLocation?.address || 'See confirmation email'
        }
      });

      return { success: true, bookingId, reminder: 'PICKUP_REMINDER' };
    }

    case 'RETURN_REMINDER': {
      if (!bookingId || !Types.ObjectId.isValid(bookingId)) {
        return { skipped: true, reason: 'INVALID_BOOKING_ID' };
      }

      const booking = await BookingModel.findById(bookingId).exec();
      if (!booking || booking.isDeleted) {
        return { skipped: true, reason: 'BOOKING_NOT_FOUND' };
      }

      // Stale Job Protection: Only send return reminders for ACTIVE bookings
      if (booking.status !== 'ACTIVE') {
        if (!config.isTest) {
          console.log(`[SkyBolt Worker] Skipping return reminder for booking ${bookingId} in status "${booking.status}"`);
        }
        return { skipped: true, reason: `STALE_STATUS_${booking.status}` };
      }

      await notificationService.enqueue({
        type: NotificationType.BOOKING_CONFIRMED,
        userId: booking.userId.toString(),
        bookingId: booking._id.toString(),
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
        priority: NotificationPriority.NORMAL,
        templateData: {
          customerName: 'Valued Customer',
          bookingReference: booking.bookingReference,
          returnTime: new Date(booking.returnAt).toLocaleString(),
          returnLocation: booking.returnLocation?.name || 'Designated Return Hub'
        }
      });

      return { success: true, bookingId, reminder: 'RETURN_REMINDER' };
    }

    case 'REVIEW_INVITATION': {
      if (!bookingId || !Types.ObjectId.isValid(bookingId)) {
        return { skipped: true, reason: 'INVALID_BOOKING_ID' };
      }

      const booking = await BookingModel.findById(bookingId).exec();
      if (!booking || booking.isDeleted || booking.status !== 'COMPLETED') {
        return { skipped: true, reason: 'NOT_ELIGIBLE_FOR_REVIEW' };
      }

      // Check if customer has already submitted a review
      const existingReview = await ReviewModel.findOne({
        bookingId: booking._id,
        isDeleted: false
      }).exec();

      if (existingReview) {
        return { skipped: true, reason: 'ALREADY_REVIEWED' };
      }

      await notificationService.enqueue({
        type: NotificationType.BOOKING_COMPLETED,
        userId: booking.userId.toString(),
        bookingId: booking._id.toString(),
        channels: [NotificationChannel.EMAIL],
        priority: NotificationPriority.NORMAL,
        templateData: {
          customerName: 'Valued Customer',
          bookingReference: booking.bookingReference,
          vehicleName: booking.vehicleSnapshot?.name || 'Your Rental Vehicle',
          reviewUrl: `/vehicle-details.html?id=${booking.vehicleId}`
        }
      });

      return { success: true, bookingId, action: 'REVIEW_INVITATION_SENT' };
    }

    case 'EXPIRED_CLEANUP': {
      // Find bookings pending payment whose hold expired
      const staleThreshold = new Date(Date.now() - 15 * 60 * 1000); // 15 mins ago
      const expiredPending = await BookingModel.find({
        status: 'PAYMENT_PENDING',
        createdAt: { $lt: staleThreshold },
        isDeleted: false
      }).limit(50).exec();

      let cleanedCount = 0;
      for (const stale of expiredPending) {
        try {
          stale.status = 'CANCELLED';
          stale.cancellation = {
            cancelledAt: new Date(),
            cancelledBy: stale.userId.toString(),
            reason: 'PAYMENT_TIMEOUT'
          };
          stale.statusHistory.push({
            from: 'PAYMENT_PENDING',
            to: 'CANCELLED',
            changedAt: new Date(),
            changedBy: 'SYSTEM_CLEANUP_WORKER',
            reason: 'Payment window expired'
          });
          await stale.save();

          // Release inventory reservation
          if (stale.reservationId) {
            await availabilityService.releaseReservation(
              stale.reservationId,
              stale.vehicleId,
              stale.userId.toString()
            );
          }
          cleanedCount++;
        } catch (err: any) {
          if (!config.isTest) {
            console.warn(`[SkyBolt Worker] Failed cleaning expired booking ${stale._id}: ${err?.message}`);
          }
        }
      }

      return { success: true, cleanedCount };
    }

    default:
      return { skipped: true, reason: 'UNKNOWN_JOB_TYPE' };
  }
}
