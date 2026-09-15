import { IChatbotTool } from './tool.interface.js';
import { vehicleSearchTool } from './vehicle-search.tool.js';
import { vehicleDetailsTool } from './vehicle-details.tool.js';
import { availabilityTool } from './availability.tool.js';
import { pricingTool } from './pricing.tool.js';
import { bookingStatusTool } from './booking-status.tool.js';
import { bookingCreateTool } from './booking-create.tool.js';
import { cancellationTool } from './cancellation.tool.js';
import { couponTool } from './coupon.tool.js';
import { locationTool } from './location.tool.js';
import {
  IChatToolDefinition,
  ChatbotToolContext,
  ChatbotToolResult
} from '../chatbot.types.js';

export class ChatbotToolRegistry {
  private tools: Map<string, IChatbotTool> = new Map();

  constructor() {
    this.registerTool(vehicleSearchTool);
    this.registerTool(vehicleDetailsTool);
    this.registerTool(availabilityTool);
    this.registerTool(pricingTool);
    this.registerTool(bookingStatusTool);
    this.registerTool(bookingCreateTool);
    this.registerTool(cancellationTool);
    this.registerTool(couponTool);
    this.registerTool(locationTool);
  }

  public registerTool(tool: IChatbotTool): void {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): IChatbotTool | undefined {
    return this.tools.get(name);
  }

  public getAllTools(): IChatbotTool[] {
    return Array.from(this.tools.values());
  }

  public getDefinitions(): IChatToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  public async executeTool(
    name: string,
    params: any,
    context: ChatbotToolContext
  ): Promise<ChatbotToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool "${name}" is not registered in SkyBolt AI.`
      };
    }

    try {
      return await tool.execute(params, context);
    } catch (err: any) {
      return {
        success: false,
        error: err.message || `Execution failure in tool "${name}".`
      };
    }
  }
}

export const toolRegistry = new ChatbotToolRegistry();
