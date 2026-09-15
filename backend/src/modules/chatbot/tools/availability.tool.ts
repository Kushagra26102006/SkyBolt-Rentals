import { IChatbotTool } from './tool.interface.js';
import { availabilityService } from '../../../services/availability.service.js';
import { vehicleService } from '../../../services/vehicle.service.js';
import { ChatbotToolContext, ChatbotToolResult, IChatToolDefinition } from '../chatbot.types.js';

export class AvailabilityTool implements IChatbotTool {
  public name = 'check_availability';
  public description = 'Check real-time rental availability for a vehicle between specified start and end dates.';

  public definition: IChatToolDefinition = {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Check whether a vehicle is available for rental between specific pickup and return dates.',
      parameters: {
        type: 'object',
        properties: {
          vehicleId: {
            type: 'string',
            description: 'The vehicle ID or code. If omitted, checks the primary matching vehicle.'
          },
          startDate: {
            type: 'string',
            description: 'Pickup date & time in ISO format or YYYY-MM-DD.'
          },
          endDate: {
            type: 'string',
            description: 'Return date & time in ISO format or YYYY-MM-DD.'
          }
        },
        required: ['startDate', 'endDate'],
        additionalProperties: false
      }
    }
  };

  public async execute(params: any, _context: ChatbotToolContext): Promise<ChatbotToolResult> {
    try {
      const { startDate, endDate } = params;
      if (!startDate || !endDate) {
        return { success: false, error: 'Both start date and end date are required to check availability.' };
      }

      const pickupDate = new Date(startDate);
      const returnDate = new Date(endDate);

      if (isNaN(pickupDate.getTime()) || isNaN(returnDate.getTime())) {
        return { success: false, error: 'Invalid date format. Please provide valid dates (e.g. YYYY-MM-DD).' };
      }

      if (returnDate <= pickupDate) {
        return { success: false, error: 'Return date must be strictly after pickup date.' };
      }

      let vehicleId = params?.vehicleId;
      if (!vehicleId) {
        // Find first available active vehicle if none specified
        const list = await vehicleService.listVehicles({ limit: 1, status: 'ACTIVE' }, 'CUSTOMER');
        if (list.items && list.items.length > 0 && list.items[0]) {
          vehicleId = list.items[0].id;
        } else {
          return { success: false, error: 'No active vehicles currently found in fleet.' };
        }
      }

      // Check authoritative availability through AvailabilityService
      const availResult = await availabilityService.checkVehicleAvailability(vehicleId, pickupDate, returnDate);
      const isAvailable = Boolean(availResult.available);

      return {
        success: true,
        data: {
          vehicleId,
          isAvailable,
          pickupDate: pickupDate.toISOString(),
          returnDate: returnDate.toISOString(),
          message: isAvailable
            ? 'Vehicle is available for the selected dates.'
            : 'Vehicle is not available for the selected dates due to existing bookings or maintenance.'
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Error checking vehicle availability.'
      };
    }
  }
}

export const availabilityTool = new AvailabilityTool();
