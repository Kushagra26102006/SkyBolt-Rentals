import { IChatbotTool } from './tool.interface.js';
import { bookingService } from '../../../services/booking.service.js';
import { pricingService } from '../../../pricing/pricing.service.js';
import { vehicleService } from '../../../services/vehicle.service.js';
import { ChatbotToolContext, ChatbotToolResult, IChatToolDefinition } from '../chatbot.types.js';

export class BookingCreateTool implements IChatbotTool {
  public name = 'create_booking';
  public description = 'Initiate or confirm a vehicle rental reservation with authoritative pricing and availability verification.';

  public definition: IChatToolDefinition = {
    type: 'function',
    function: {
      name: 'create_booking',
      description: 'Create a vehicle booking reservation. Requires vehicle, pickup and return dates, and explicit customer confirmation.',
      parameters: {
        type: 'object',
        properties: {
          vehicleId: {
            type: 'string',
            description: 'The vehicle ID to reserve.'
          },
          pickupAt: {
            type: 'string',
            description: 'Pickup date and time in ISO format or YYYY-MM-DD HH:mm.'
          },
          returnAt: {
            type: 'string',
            description: 'Return date and time in ISO format or YYYY-MM-DD HH:mm.'
          },
          pickupLocation: {
            type: 'string',
            description: 'Pickup hub name or address (default: Main Hub).'
          },
          returnLocation: {
            type: 'string',
            description: 'Return hub name or address (default: Main Hub).'
          },
          couponCode: {
            type: 'string',
            description: 'Optional discount coupon code.'
          },
          confirmed: {
            type: 'boolean',
            description: 'Must be true if the customer has explicitly confirmed they want to proceed with this booking.'
          }
        },
        required: ['vehicleId', 'pickupAt', 'returnAt'],
        additionalProperties: false
      }
    }
  };

  public async execute(params: any, context: ChatbotToolContext): Promise<ChatbotToolResult> {
    try {
      const { vehicleId, pickupAt, returnAt, couponCode, confirmed } = params;

      if (!vehicleId || !pickupAt || !returnAt) {
        return {
          success: false,
          error: 'Vehicle ID, pickup date/time, and return date/time are required.'
        };
      }

      const pickupDate = new Date(pickupAt);
      const returnDate = new Date(returnAt);

      if (isNaN(pickupDate.getTime()) || isNaN(returnDate.getTime())) {
        return {
          success: false,
          error: 'Invalid pickup or return date format.'
        };
      }

      if (returnDate <= pickupDate) {
        return {
          success: false,
          error: 'Return date must be after pickup date.'
        };
      }

      // 1. Verify vehicle existence
      const vehicle = await vehicleService.getVehicleById(vehicleId, 'CUSTOMER');
      if (!vehicle) {
        return { success: false, error: 'The specified vehicle could not be found.' };
      }

      // 2. Stage 1: Generate quote and request explicit confirmation if not yet confirmed
      const quote = await pricingService.generateQuote({
        vehicleId,
        pickupAt: pickupDate.toISOString(),
        returnAt: returnDate.toISOString(),
        couponCode: couponCode ? String(couponCode).trim().toUpperCase() : undefined
      });

      if (!confirmed) {
        const durationText = quote.duration?.unit === 'DAY'
          ? `${quote.duration.value} days`
          : `${Math.ceil((quote.duration?.hoursTotal || 24) / 24)} days`;

        return {
          success: true,
          requiresConfirmation: true,
          promptUser: `Here is your reservation summary for **${vehicle.name}**:\n• Duration: ${durationText} (${pickupDate.toLocaleDateString()} to ${returnDate.toLocaleDateString()})\n• Subtotal: ₹${quote.subtotal}\n• Taxes & Fees: ₹${quote.taxAmount + (quote.feeAmount || 0)}\n• **Total Amount: ₹${quote.total}**\n\nTo reserve this vehicle now, please reply **"Confirm"** or ask any questions.`,
          data: {
            quote,
            vehicle: { id: vehicle.id, name: vehicle.name, category: vehicle.category }
          }
        };
      }

      // 3. Stage 2: Create booking (Requires user authentication)
      if (!context.user) {
        return {
          success: false,
          error: 'You must be signed in to finalize a booking. Please sign in or register, then reply "Confirm" to complete your reservation.'
        };
      }

      const createResult = await bookingService.createBooking(context.user.id, {
        vehicleId,
        pickupAt: pickupDate.toISOString(),
        returnAt: returnDate.toISOString(),
        pickupLocation: params.pickupLocation || 'Main Hub',
        returnLocation: params.returnLocation || 'Main Hub',
        couponCode: couponCode ? String(couponCode).trim().toUpperCase() : undefined,
        notes: 'Booked via SkyBolt AI Assistant'
      });

      const booking = createResult.booking;

      return {
        success: true,
        data: {
          bookingId: booking.id,
          bookingReference: booking.bookingReference,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          totalAmount: booking.pricing?.total || quote.total,
          currency: quote.currency || 'INR',
          checkoutUrl: `/booking.html?id=${booking.id}`
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Error occurred while processing booking.'
      };
    }
  }
}

export const bookingCreateTool = new BookingCreateTool();
