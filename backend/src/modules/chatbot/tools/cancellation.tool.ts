import { IChatbotTool } from './tool.interface.js';
import { bookingService } from '../../../services/booking.service.js';
import { ChatbotToolContext, ChatbotToolResult, IChatToolDefinition } from '../chatbot.types.js';

export class CancellationTool implements IChatbotTool {
  public name = 'cancellation_policy';
  public description = 'View SkyBolt cancellation and refund rules, or submit an authenticated booking cancellation request.';

  public definition: IChatToolDefinition = {
    type: 'function',
    function: {
      name: 'cancellation_policy',
      description: 'Check cancellation policies or cancel an existing booking for an authenticated user.',
      parameters: {
        type: 'object',
        properties: {
          bookingId: {
            type: 'string',
            description: 'Optional booking reference (e.g. SKY-YYYYMMDD-XXXXXX) to cancel.'
          },
          confirmed: {
            type: 'boolean',
            description: 'Must be true to finalize an actual cancellation.'
          }
        },
        additionalProperties: false
      }
    }
  };

  public async execute(params: any, context: ChatbotToolContext): Promise<ChatbotToolResult> {
    try {
      const { bookingId, confirmed } = params || {};

      // If no bookingId, return general cancellation policies
      if (!bookingId) {
        return {
          success: true,
          data: {
            policy: {
              title: 'SkyBolt Rentals Cancellation & Refund Policy',
              rules: [
                'Full 100% refund for cancellations made at least 24 hours prior to scheduled pickup time.',
                '50% refund for cancellations made within 24 hours of scheduled pickup time.',
                'Non-refundable once scheduled pickup time has arrived or trip has commenced.',
                'Security deposits are 100% refunded for all cancellations regardless of timing.',
                'Approved refunds are credited back to your original payment method within 5-7 business days.'
              ]
            }
          }
        };
      }

      // If bookingId is provided but not confirmed
      if (!confirmed) {
        return {
          success: true,
          requiresConfirmation: true,
          promptUser: `Are you sure you want to cancel booking **${bookingId}**? Depending on the pickup time, cancellation fees may apply. Reply **"Confirm Cancel ${bookingId}"** to proceed.`
        };
      }

      // If confirmed, user must be authenticated
      if (!context.user) {
        return {
          success: false,
          error: 'You must be signed in to cancel a booking.'
        };
      }

      const cancelledBooking = await bookingService.cancelBooking(bookingId.trim(), context.user, {
        reason: 'CUSTOMER_REQUEST',
        notes: 'Cancellation requested via SkyBolt AI Assistant'
      });

      return {
        success: true,
        data: {
          bookingId: cancelledBooking.id,
          bookingReference: cancelledBooking.bookingReference,
          status: cancelledBooking.status,
          refundStatus: 'Processing',
          message: `Booking ${cancelledBooking.bookingReference} has been cancelled successfully.`
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Error processing cancellation.'
      };
    }
  }
}

export const cancellationTool = new CancellationTool();
