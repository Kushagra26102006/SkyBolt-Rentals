import { IChatbotTool } from './tool.interface.js';
import { pricingService } from '../../../pricing/pricing.service.js';
import { vehicleService } from '../../../services/vehicle.service.js';
import { ChatbotToolContext, ChatbotToolResult, IChatToolDefinition } from '../chatbot.types.js';

export class PricingTool implements IChatbotTool {
  public name = 'calculate_pricing';
  public description = 'Calculate an authoritative rental pricing quote including base duration rates, discounts, taxes, and security deposit.';

  public definition: IChatToolDefinition = {
    type: 'function',
    function: {
      name: 'calculate_pricing',
      description: 'Generate an authoritative pricing quote for a vehicle rental period with optional promo coupon code.',
      parameters: {
        type: 'object',
        properties: {
          vehicleId: {
            type: 'string',
            description: 'The vehicle ID or code. If omitted, uses the top available vehicle.'
          },
          startDate: {
            type: 'string',
            description: 'Pickup date & time in ISO format or YYYY-MM-DD.'
          },
          endDate: {
            type: 'string',
            description: 'Return date & time in ISO format or YYYY-MM-DD.'
          },
          couponCode: {
            type: 'string',
            description: 'Optional promotional coupon code to apply.'
          }
        },
        required: ['startDate', 'endDate'],
        additionalProperties: false
      }
    }
  };

  public async execute(params: any, _context: ChatbotToolContext): Promise<ChatbotToolResult> {
    try {
      const { startDate, endDate, couponCode } = params;
      if (!startDate || !endDate) {
        return { success: false, error: 'Pickup date and return date are required to generate a pricing quote.' };
      }

      const pickupAt = new Date(startDate);
      const returnAt = new Date(endDate);

      if (isNaN(pickupAt.getTime()) || isNaN(returnAt.getTime())) {
        return { success: false, error: 'Invalid date format provided for pricing quote.' };
      }

      if (returnAt <= pickupAt) {
        return { success: false, error: 'Return date must be strictly after pickup date.' };
      }

      let vehicleId = params?.vehicleId;
      if (!vehicleId) {
        const list = await vehicleService.listVehicles({ limit: 1, status: 'ACTIVE' }, 'CUSTOMER');
        if (list.items && list.items.length > 0 && list.items[0]) {
          vehicleId = list.items[0].id;
        } else {
          return { success: false, error: 'No active vehicles currently found.' };
        }
      }

      // Generate authoritative quote strictly through PricingService
      const quote = await pricingService.generateQuote({
        vehicleId,
        pickupAt: pickupAt.toISOString(),
        returnAt: returnAt.toISOString(),
        couponCode: couponCode ? String(couponCode).trim().toUpperCase() : undefined
      });

      const durationDays = quote.duration?.unit === 'DAY'
        ? quote.duration.value
        : Math.ceil((quote.duration?.hoursTotal || 24) / 24);

      return {
        success: true,
        data: {
          vehicleId: quote.vehicleId,
          vehicleName: quote.vehicleName,
          pickupAt: pickupAt.toISOString(),
          returnAt: returnAt.toISOString(),
          durationDays,
          durationHours: quote.duration?.hoursTotal || 0,
          grossBaseAmount: quote.baseAmount,
          discountAmount: quote.discountAmount,
          couponCode: couponCode || null,
          subtotal: quote.subtotal,
          taxes: quote.taxAmount,
          fees: quote.feeAmount,
          finalTotal: quote.total,
          currency: quote.currency || 'INR'
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Error calculating rental quote.'
      };
    }
  }
}

export const pricingTool = new PricingTool();
