import { IChatbotTool } from './tool.interface.js';
import { hubService } from '../../../services/hub.service.js';
import { ChatbotToolContext, ChatbotToolResult, IChatToolDefinition } from '../chatbot.types.js';

export class LocationTool implements IChatbotTool {
  public name = 'get_locations';
  public description = 'Find SkyBolt rental hubs and vehicle pickup/drop-off locations by city or ID.';

  public definition: IChatToolDefinition = {
    type: 'function',
    function: {
      name: 'get_locations',
      description: 'Get list of available SkyBolt vehicle pickup and return hubs with addresses and contact info.',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: 'Optional city name to filter pickup locations.'
          },
          hubId: {
            type: 'string',
            description: 'Optional specific hub ID.'
          }
        },
        additionalProperties: false
      }
    }
  };

  public async execute(params: any, _context: ChatbotToolContext): Promise<ChatbotToolResult> {
    try {
      if (params?.hubId) {
        const hub = await hubService.getHubById(params.hubId);
        if (!hub) {
          return { success: false, error: `Hub with ID "${params.hubId}" was not found.` };
        }
        return {
          success: true,
          data: {
            hub: {
              id: hub.id,
              name: hub.name,
              code: hub.code,
              city: hub.city,
              address: hub.address,
              operatingHours: '24/7',
              phone: hub.contact?.phone || '+91 1800-SKYBOLT'
            }
          }
        };
      }

      const query: any = { operationalStatus: 'ACTIVE', limit: 10 };
      if (params?.city) {
        query.city = params.city;
      }

      const result = await hubService.listHubs(query);
      const hubs = (result.data || []).map((h) => ({
        id: h.id,
        name: h.name,
        code: h.code,
        city: h.city,
        address: h.address,
        operatingHours: '08:00 AM - 10:00 PM',
        phone: h.contact?.phone || '+91 1800-SKYBOLT'
      }));

      return {
        success: true,
        data: {
          total: result.meta?.total || hubs.length,
          hubs
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Error fetching pickup locations.'
      };
    }
  }
}

export const locationTool = new LocationTool();
