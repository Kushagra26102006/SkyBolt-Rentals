import mongoose, { Types } from 'mongoose';
import { BookingModel } from '../models/booking.model.js';
import { VehicleModel } from '../models/vehicle.model.js';
import { HubModel } from '../models/hub.model.js';
import { BookingStateMachine } from './booking-state-machine.js';
import { FleetStateMachine } from './fleet-state-machine.js';
import { fleetService } from './fleet.service.js';
import { hubRepository } from '../repositories/hub.repository.js';
import { availabilityService } from './availability.service.js';
import { auditService } from './audit.service.js';
import { ApiError } from '../utils/api-error.js';
import { AuthenticatedUser } from '../types/auth.types.js';
import { BookingDTO } from '../types/booking.types.js';
import { AdminVehicleDTO } from '../types/vehicle.types.js';
import { PickupBookingInput, ReturnBookingInput } from '../types/fleet.types.js';
import {
  notificationService,
  NotificationType,
  NotificationChannel
} from '../notifications/index.js';

export class FleetBookingIntegrationService {
  /**
   * Operational Rental Handover / Vehicle Pickup
   * Validates payment/confirmation, enforces physical fleet readiness,
   * transitions vehicle to ACTIVE_RENTAL, and booking to ACTIVE.
   */
  public async onBookingPickup(
    bookingIdOrRef: string,
    input: PickupBookingInput,
    actor: AuthenticatedUser
  ): Promise<{ booking: BookingDTO; vehicle: AdminVehicleDTO }> {
    const isObjectId = mongoose.isValidObjectId(bookingIdOrRef);
    const booking = await BookingModel.findOne(
      isObjectId
        ? { $or: [{ _id: new Types.ObjectId(bookingIdOrRef) }, { bookingReference: bookingIdOrRef }] }
        : { bookingReference: bookingIdOrRef }
    ).exec();

    if (!booking || booking.isDeleted) {
      throw new ApiError(404, 'BOOKING_NOT_FOUND', `Booking "${bookingIdOrRef}" not found.`);
    }

    if (booking.status !== 'CONFIRMED') {
      throw new ApiError(
        409,
        'BOOKING_NOT_CONFIRMED',
        `Cannot initiate physical pickup for booking in "${booking.status}" status. Booking must be CONFIRMED.`
      );
    }

    const vehicle = await VehicleModel.findById(booking.vehicleId).exec();
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Associated vehicle not found.');
    }

    // Authoritative fleet readiness check
    const readiness = await fleetService.checkVehicleReadiness(vehicle.id);
    if (!readiness.ready) {
      throw new ApiError(
        409,
        'VEHICLE_NOT_OPERATIONALLY_READY',
        `Vehicle is not operationally ready for customer pickup: ${readiness.reasons.join(', ')}`
      );
    }

    // 1. Transition Booking state: CONFIRMED -> ACTIVE
    BookingStateMachine.assertTransition(booking.status, 'ACTIVE');
    const prevBookingStatus = booking.status;
    booking.status = 'ACTIVE';
    booking.statusHistory.push({
      from: prevBookingStatus,
      to: 'ACTIVE',
      changedAt: new Date(),
      changedBy: actor.id,
      reason: input.notes || 'Vehicle handed over to customer by operations staff'
    });
    await booking.save();

    // 2. Transition Vehicle fleet status: AVAILABLE/RESERVED -> ACTIVE_RENTAL
    const currentFleetStatus = vehicle.fleetStatus || 'AVAILABLE';
    FleetStateMachine.assertTransition(currentFleetStatus, 'ACTIVE_RENTAL');
    vehicle.fleetStatus = 'ACTIVE_RENTAL';
    vehicle.activeBookingId = new Types.ObjectId(String(booking._id));

    if (input.odometer !== undefined && input.odometer >= 0) {
      vehicle.odometer = Math.max(vehicle.odometer || 0, input.odometer);
    }
    await vehicle.save();

    await auditService.log(actor, 'BOOKING_PICKUP', 'BOOKING', booking.id, {
      previousState: { bookingStatus: prevBookingStatus, fleetStatus: currentFleetStatus },
      newState: { bookingStatus: 'ACTIVE', fleetStatus: 'ACTIVE_RENTAL', odometer: vehicle.odometer }
    });

    // Enqueue vehicle pickup notification
    try {
      await notificationService.enqueue({
        type: NotificationType.VEHICLE_ASSIGNED,
        userId: booking.userId.toString(),
        bookingId: booking._id.toString(),
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
        templateData: {
          customerName: 'Valued Customer',
          bookingReference: booking.bookingReference,
          vehicleName: vehicle.name || 'Your vehicle',
          registrationNumber: vehicle.registrationNumber,
          pickupHub: vehicle.location?.name || 'Assigned Hub'
        }
      });
    } catch (notifyErr) {
      console.warn('[SkyBolt Fleet] Failed to enqueue vehicle assigned notification:', notifyErr);
    }

    return {
      booking: booking.toDTO(),
      vehicle: vehicle.toAdminDTO()
    };
  }

  /**
   * Operational Vehicle Return / Drop-off
   * Transitions booking to COMPLETED, vehicle to INSPECTION,
   * updates odometer, and supports one-way returns to a different hub.
   */
  public async onBookingReturn(
    bookingIdOrRef: string,
    input: ReturnBookingInput,
    actor: AuthenticatedUser
  ): Promise<{ booking: BookingDTO; vehicle: AdminVehicleDTO }> {
    const isObjectId = mongoose.isValidObjectId(bookingIdOrRef);
    const booking = await BookingModel.findOne(
      isObjectId
        ? { $or: [{ _id: new Types.ObjectId(bookingIdOrRef) }, { bookingReference: bookingIdOrRef }] }
        : { bookingReference: bookingIdOrRef }
    ).exec();

    if (!booking || booking.isDeleted) {
      throw new ApiError(404, 'BOOKING_NOT_FOUND', `Booking "${bookingIdOrRef}" not found.`);
    }

    if (booking.status !== 'ACTIVE') {
      throw new ApiError(
        409,
        'BOOKING_NOT_ACTIVE',
        `Cannot return vehicle for booking in "${booking.status}" status. Booking must be ACTIVE.`
      );
    }

    const vehicle = await VehicleModel.findById(booking.vehicleId).exec();
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Associated vehicle not found.');
    }

    // 1. Transition Booking state: ACTIVE -> COMPLETED
    BookingStateMachine.assertTransition(booking.status, 'COMPLETED');
    const prevBookingStatus = booking.status;
    booking.status = 'COMPLETED';
    booking.statusHistory.push({
      from: prevBookingStatus,
      to: 'COMPLETED',
      changedAt: new Date(),
      changedBy: actor.id,
      reason: input.notes || 'Vehicle returned by customer and received by operations staff'
    });
    await booking.save();

    // 2. Transition Vehicle fleet status: ACTIVE_RENTAL -> INSPECTION
    // Every returned vehicle must undergo post-rental inspection before returning to AVAILABLE
    FleetStateMachine.assertTransition(vehicle.fleetStatus || 'ACTIVE_RENTAL', 'INSPECTION');
    vehicle.fleetStatus = 'INSPECTION';
    vehicle.set('activeBookingId', undefined);

    if (input.odometer !== undefined && input.odometer >= 0) {
      vehicle.odometer = input.odometer;
    }

    // 3. Handle Return Hub (if vehicle was returned to a different hub)
    if (input.returnHubId) {
      const returnHub = await hubRepository.findByIdOrCode(input.returnHubId);
      if (returnHub && returnHub.operationalStatus === 'ACTIVE') {
        const prevHubId = vehicle.currentHubId;
        if (!prevHubId || prevHubId.toString() !== returnHub._id.toString()) {
          vehicle.currentHubId = new Types.ObjectId(String(returnHub._id));
          vehicle.location = {
            name: returnHub.name,
            city: returnHub.city,
            locationId: returnHub.id
          };
          // Adjust hub counts
          await HubModel.findByIdAndUpdate(returnHub._id, { $inc: { currentVehicleCount: 1 } });
          if (prevHubId) {
            await HubModel.findOneAndUpdate(
              { _id: new Types.ObjectId(String(prevHubId)), currentVehicleCount: { $gt: 0 } },
              { $inc: { currentVehicleCount: -1 } }
            );
          }
        }
      }
    }

    await vehicle.save();

    // 4. Release underlying reservation
    if (booking.reservationId) {
      await availabilityService.releaseReservation(
        booking.reservationId,
        vehicle._id,
        booking.userId?.toString()
      );
    }

    await auditService.log(actor, 'BOOKING_RETURN', 'BOOKING', booking.id, {
      previousState: { bookingStatus: prevBookingStatus, fleetStatus: 'ACTIVE_RENTAL' },
      newState: { bookingStatus: 'COMPLETED', fleetStatus: 'INSPECTION', odometer: vehicle.odometer }
    });

    // Enqueue transactional booking completed notification
    try {
      await notificationService.enqueue({
        type: NotificationType.BOOKING_COMPLETED,
        userId: booking.userId.toString(),
        bookingId: booking._id.toString(),
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
        templateData: {
          customerName: 'Valued Customer',
          bookingReference: booking.bookingReference,
          vehicleName: vehicle.name || 'Your vehicle',
          dropoffLocation: vehicle.location?.name || booking.returnLocation,
          invoiceUrl: `/dashboard?booking=${booking.bookingReference}`
        }
      });
    } catch (notifyErr) {
      console.warn('[SkyBolt Fleet] Failed to enqueue booking completed notification:', notifyErr);
    }

    return {
      booking: booking.toDTO(),
      vehicle: vehicle.toAdminDTO()
    };
  }
}

export const fleetBookingIntegrationService = new FleetBookingIntegrationService();
export default fleetBookingIntegrationService;
