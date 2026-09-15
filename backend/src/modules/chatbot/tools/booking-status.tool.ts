import { IChatbotTool } from './tool.interface.js';
import { bookingService } from '../../../services/booking.service.js';
import { ChatbotToolContext, ChatbotToolResult, IChatToolDefinition } from '../chatbot.types.js';

export class BookingStatusTool implements IChatbotTool {
  public name = 'get_booking_status';
  public description = 'Check status, dates, vehicle details, and payment state of an existing booking for the authenticated customer.';

  public definition: IChatToolDefinition = {
    type: 'function',
    function: {
      name: 'get_booking_status',
      description: 'Fetch real-time booking status and information by booking reference (e.g. SKY-20260904-XXXXXX) or ID.',
      parameters: {
        type: 'object',
        properties: {
          bookingId: {
            type: 'string',
            description: 'The booking reference (e.g. SKY-YYYYMMDD-XXXXXX) or booking ID.'
          }
        },
        required: ['bookingId'],
        additionalProperties: false
      }
    }
  };

  public async execute(params: any, context: ChatbotToolContext): Promise<ChatbotToolResult> {
    try {
      if (!params?.bookingId) {
        return {
          success: false,
          error: 'Please provide your booking reference code (e.g. SKY-20260904-XXXXXX).'
        };
      }

      // Strict Authentication Requirement
      if (!context.user) {
        return {
          success: false,
          error: 'Authentication required. Please sign in to your SkyBolt account to view your booking details.'
        };
      }

      // BookingService strictly verifies that customer owns this booking
      const booking = await bookingService.getBookingById(params.bookingId.trim(), context.user);

      return {
        success: true,
        data: {
          bookingId: booking.id,
          bookingReference: booking.bookingReference,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          vehicleId: booking.vehicleId,
          vehicleName: booking.vehicle?.name || 'Reserved Vehicle',
          pickupAt: booking.pickupAt,
          returnAt: booking.returnAt,
          totalAmount: booking.pricing?.total || 0,
          currency: booking.pricing?.currency || 'INR',
          pickupLocation: booking.pickupLocation?.name || 'Main Hub',
          returnLocation: booking.returnLocation?.name || 'Main Hub'
        }
      };
    } catch (err: any) {
      if (err.statusCode === 404 || err.code === 'BOOKING_NOT_FOUND') {
        return {
          success: false,
          error: 'Booking not found or does not belong to your account. Please check your reference code.'
        };
      }
      return {
        success: false,
        error: err.message || 'Error fetching booking status.'
      };
    }
  }
}

export const bookingStatusTool = new BookingStatusTool();
