import { IChatbotTool } from './tool.interface.js';
import { vehicleService } from '../../../services/vehicle.service.js';
import { ChatbotToolContext, ChatbotToolResult, IChatToolDefinition } from '../chatbot.types.js';

export class VehicleDetailsTool implements IChatbotTool {
  public name = 'get_vehicle_details';
  public description = 'Get comprehensive details, specifications, features, and rates for a specific vehicle by ID or code.';

  public definition: IChatToolDefinition = {
    type: 'function',
    function: {
      name: 'get_vehicle_details',
      description: 'Fetch detailed vehicle specs, features, and rates by vehicle ID or vehicle code.',
      parameters: {
        type: 'object',
        properties: {
          vehicleId: {
            type: 'string',
            description: 'The vehicle ID or vehicle code (e.g. SKY-SED-001 or MongoDB ObjectId).'
          }
        },
        required: ['vehicleId'],
        additionalProperties: false
      }
    }
  };

  public async execute(params: any, _context: ChatbotToolContext): Promise<ChatbotToolResult> {
    try {
      if (!params?.vehicleId) {
        return { success: false, error: 'Vehicle ID is required.' };
      }

      const v = await vehicleService.getVehicleById(params.vehicleId, 'CUSTOMER');
      if (!v) {
        return { success: false, error: `Vehicle "${params.vehicleId}" was not found.` };
      }

      return {
        success: true,
        data: {
          id: v.id,
          vehicleCode: v.vehicleCode,
          name: v.name,
          brand: v.brand,
          model: v.model,
          year: v.year,
          category: v.category,
          seats: v.specifications?.seats || 4,
          transmission: v.specifications?.transmission || 'MANUAL',
          fuelType: v.specifications?.fuelType || 'PETROL',
          mileage: v.specifications?.mileage || '15 km/l',
          baseRate: v.rental?.baseRate || 0,
          currency: v.rental?.currency || 'INR',
          features: v.features || [],
          ratingAverage: v.rating?.average || 4.5,
          ratingCount: v.rating?.count || 0,
          primaryImage: v.images && v.images.length > 0 && v.images[0] ? (v.images.find((img) => img.isPrimary)?.url || v.images[0].url) : null
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed retrieving vehicle details.'
      };
    }
  }
}

export const vehicleDetailsTool = new VehicleDetailsTool();
