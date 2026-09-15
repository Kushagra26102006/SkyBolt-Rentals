import { IChatbotTool } from './tool.interface.js';
import { vehicleService } from '../../../services/vehicle.service.js';
import { ChatbotToolContext, ChatbotToolResult, IChatToolDefinition } from '../chatbot.types.js';

export class VehicleSearchTool implements IChatbotTool {
  public name = 'search_vehicles';
  public description = 'Search and filter active rental vehicles by category, budget, transmission, seating capacity, or keyword.';

  public definition: IChatToolDefinition = {
    type: 'function',
    function: {
      name: 'search_vehicles',
      description: 'Search available rental vehicles by category, seating, price, fuel, or keyword.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['SUV', 'SEDAN', 'HATCHBACK', 'LUXURY', 'MOTORCYCLE', 'SCOOTER', 'BIKE', 'CAR', 'EV'],
            description: 'Vehicle type category.'
          },
          search: {
            type: 'string',
            description: 'Free text keyword to search brand or model name.'
          },
          seats: {
            type: 'number',
            description: 'Minimum required passenger seating capacity.'
          },
          transmission: {
            type: 'string',
            enum: ['MANUAL', 'AUTOMATIC'],
            description: 'Transmission preference.'
          },
          fuelType: {
            type: 'string',
            enum: ['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID'],
            description: 'Fuel type preference.'
          },
          minPrice: {
            type: 'number',
            description: 'Minimum daily rental price in INR.'
          },
          maxPrice: {
            type: 'number',
            description: 'Maximum daily rental price in INR.'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of vehicles to return (default 5, max 10).'
          }
        },
        additionalProperties: false
      }
    }
  };

  public async execute(params: any, _context: ChatbotToolContext): Promise<ChatbotToolResult> {
    try {
      const limit = Math.min(Math.max(params?.limit || 5, 1), 10);
      const query: any = {
        limit,
        page: 1,
        status: 'ACTIVE'
      };

      if (params?.category) query.category = params.category;
      if (params?.search) query.search = params.search;
      if (params?.seats) query.seats = Number(params.seats);
      if (params?.transmission) query.transmission = params.transmission;
      if (params?.fuelType) query.fuelType = params.fuelType;
      if (params?.minPrice) query.minPrice = Number(params.minPrice);
      if (params?.maxPrice) query.maxPrice = Number(params.maxPrice);

      const result = await vehicleService.listVehicles(query, 'CUSTOMER');

      const vehicles = (result.items || []).map((v) => ({
        id: v.id,
        vehicleCode: v.vehicleCode,
        name: v.name,
        brand: v.brand,
        model: v.model,
        category: v.category,
        seats: v.specifications?.seats || 4,
        transmission: v.specifications?.transmission || 'MANUAL',
        fuelType: v.specifications?.fuelType || 'PETROL',
        baseRate: v.rental?.baseRate || 0,
        currency: v.rental?.currency || 'INR',
        ratingAverage: v.rating?.average || 4.5,
        ratingCount: v.rating?.count || 0,
        primaryImage: v.images && v.images.length > 0 && v.images[0] ? (v.images.find((img) => img.isPrimary)?.url || v.images[0].url) : null
      }));

      return {
        success: true,
        data: {
          total: result.pagination?.total || vehicles.length,
          vehicles
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed searching vehicles.'
      };
    }
  }
}

export const vehicleSearchTool = new VehicleSearchTool();
