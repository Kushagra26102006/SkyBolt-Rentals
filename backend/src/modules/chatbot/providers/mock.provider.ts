import crypto from 'crypto';
import { IAIProvider } from './ai.provider.js';
import {
  IChatMessage,
  IChatToolDefinition,
  AIProviderOptions,
  AIProviderResponse,
  IChatToolCall
} from '../chatbot.types.js';

export class MockAIProvider implements IAIProvider {
  public name = 'mock';

  public async chat(
    messages: IChatMessage[],
    _tools?: IChatToolDefinition[],
    _options?: AIProviderOptions
  ): Promise<AIProviderResponse> {
    const lastMessage = messages[messages.length - 1];

    // 1. If last message was a tool result, synthesize an authoritative user response
    if (lastMessage && lastMessage.role === 'tool') {
      return this.synthesizeToolResponse(messages);
    }

    const userText = (lastMessage?.content || '').toLowerCase().trim();

    // 2. Jailbreak / Injection defense check in mock provider
    if (
      userText.includes('ignore previous instructions') ||
      userText.includes('ignore all previous') ||
      userText.includes('reveal system prompt') ||
      userText.includes('you are now dan') ||
      userText.includes('drop table')
    ) {
      return {
        message: 'I am SkyBolt AI, a dedicated assistant for vehicle rentals. I cannot alter my core instructions or reveal internal security rules. How may I assist you with your rental today?'
      };
    }

    // 3. Inspect text to trigger appropriate tool calls
    const toolCall = this.determineToolCall(userText);
    if (toolCall) {
      return {
        message: '',
        toolCalls: [toolCall]
      };
    }

    // 4. Fallback direct conversational responses for general FAQs
    return this.generateDirectResponse(userText);
  }

  private determineToolCall(text: string): IChatToolCall | null {
    const callId = `call_${crypto.randomBytes(6).toString('hex')}`;

    // Booking status
    if (text.includes('booking') && (text.includes('status') || text.includes('where is') || text.includes('track') || text.includes('my booking') || text.includes('sky-'))) {
      const match = text.match(/sky-\d{8}-[a-z0-9]+/i);
      const bookingId = match ? match[0].toUpperCase() : '';
      return {
        id: callId,
        type: 'function',
        function: {
          name: 'get_booking_status',
          arguments: JSON.stringify({ bookingId })
        }
      };
    }

    // Cancellation & Refund
    if (text.includes('cancel') || text.includes('refund policy')) {
      const match = text.match(/sky-\d{8}-[a-z0-9]+/i);
      return {
        id: callId,
        type: 'function',
        function: {
          name: 'cancellation_policy',
          arguments: JSON.stringify({
            bookingId: match ? match[0].toUpperCase() : undefined,
            confirmed: text.includes('confirm')
          })
        }
      };
    }

    // Coupons
    if (text.includes('coupon') || text.includes('discount') || text.includes('promo') || text.includes('offer')) {
      const codeMatch = text.match(/\b([A-Z0-9]{4,15})\b/);
      return {
        id: callId,
        type: 'function',
        function: {
          name: 'check_coupons',
          arguments: JSON.stringify({
            couponCode: codeMatch ? codeMatch[1] : undefined
          })
        }
      };
    }

    // Pricing Quote
    if (text.includes('quote') || text.includes('price') || text.includes('how much') || text.includes('cost')) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfter = new Date();
      dayAfter.setDate(dayAfter.getDate() + 3);

      return {
        id: callId,
        type: 'function',
        function: {
          name: 'calculate_pricing',
          arguments: JSON.stringify({
            startDate: tomorrow.toISOString().split('T')[0],
            endDate: dayAfter.toISOString().split('T')[0]
          })
        }
      };
    }

    // Hubs / Locations
    if (text.includes('location') || text.includes('hub') || text.includes('pickup point') || text.includes('where to pick') || text.includes('where can i pick')) {
      return {
        id: callId,
        type: 'function',
        function: {
          name: 'get_locations',
          arguments: JSON.stringify({})
        }
      };
    }

    // Availability
    if (text.includes('available') || text.includes('availability')) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfter = new Date();
      dayAfter.setDate(dayAfter.getDate() + 2);

      return {
        id: callId,
        type: 'function',
        function: {
          name: 'check_availability',
          arguments: JSON.stringify({
            startDate: tomorrow.toISOString().split('T')[0],
            endDate: dayAfter.toISOString().split('T')[0]
          })
        }
      };
    }

    // Vehicle Search / Recommendation
    if (
      text.includes('car') ||
      text.includes('suv') ||
      text.includes('sedan') ||
      text.includes('vehicle') ||
      text.includes('scooter') ||
      text.includes('bike') ||
      text.includes('find') ||
      text.includes('search') ||
      text.includes('recommend') ||
      text.includes('rent')
    ) {
      let type: string | undefined = undefined;
      if (text.includes('suv')) type = 'SUV';
      else if (text.includes('sedan')) type = 'SEDAN';
      else if (text.includes('scooter')) type = 'SCOOTER';
      else if (text.includes('bike') || text.includes('motorcycle')) type = 'MOTORCYCLE';

      return {
        id: callId,
        type: 'function',
        function: {
          name: 'search_vehicles',
          arguments: JSON.stringify({
            type,
            search: text.length < 30 ? text : undefined
          })
        }
      };
    }

    return null;
  }

  private synthesizeToolResponse(messages: IChatMessage[]): AIProviderResponse {
    const toolMsg = messages[messages.length - 1];
    if (!toolMsg) {
      return { message: 'No tool results found.' };
    }
    let parsed: any = {};
    try {
      parsed = JSON.parse(toolMsg.content);
    } catch {
      parsed = { raw: toolMsg.content };
    }

    const toolName = toolMsg.name || '';

    if (toolName === 'search_vehicles') {
      if (parsed.success && parsed.data?.vehicles?.length) {
        const vehicles = parsed.data.vehicles;
        const count = vehicles.length;
        const listText = vehicles
          .slice(0, 3)
          .map((v: any) => `• **${v.name}** (${v.category}) — ₹${v.baseRate}/day, ${v.seats} seats, ${v.transmission}`)
          .join('\n');

        return {
          message: `I found ${count} great option${count > 1 ? 's' : ''} for your rental:\n\n${listText}\n\nWould you like me to check real-time availability or calculate a full pricing quote for any of these vehicles?`
        };
      }
      return {
        message: 'I could not find vehicles matching those specific criteria right now. Would you like to check other categories or cities?'
      };
    }

    if (toolName === 'get_vehicle_details') {
      if (parsed.success && parsed.data) {
        const v = parsed.data;
        return {
          message: `Here are the specifications for the **${v.name}** (${v.category}):\n• Base Rate: ₹${v.baseRate}/day\n• Transmission: ${v.transmission}\n• Fuel: ${v.fuelType}\n• Seating: ${v.seats} passengers\n• Key Features: ${(v.features || []).join(', ')}\n\nWould you like to check availability or reserve this vehicle?`
        };
      }
      return {
        message: 'I was unable to find details for that vehicle ID. Please verify the vehicle name or ID.'
      };
    }

    if (toolName === 'calculate_pricing') {
      if (parsed.success && parsed.data) {
        const q = parsed.data;
        return {
          message: `Here is your official SkyBolt rental quote:\n• Gross Rental: ₹${q.grossBaseAmount || q.subtotal}\n• Duration: ${q.durationDays || q.durationHours ? `${q.durationDays || 0} days` : 'standard'}\n• Taxes & Fees: ₹${q.taxes || 0}\n• Security Deposit (Refundable): ₹${q.securityDeposit || 0}\n• **Estimated Total: ₹${q.finalTotal || q.total}**\n\nWould you like to reserve this vehicle? (Reply "Confirm" to proceed to booking).`
        };
      }
      return {
        message: `I could not calculate the pricing quote: ${parsed.error || 'Please specify valid pickup and return dates.'}`
      };
    }

    if (toolName === 'check_availability') {
      if (parsed.success && parsed.data?.isAvailable) {
        return {
          message: `Good news! The vehicle is available for your selected dates. Would you like me to generate an exact price quote for you?`
        };
      }
      return {
        message: `The selected vehicle is currently not available for those dates. Would you like me to suggest alternative vehicles?`
      };
    }

    if (toolName === 'get_booking_status') {
      if (parsed.success && parsed.data) {
        const b = parsed.data;
        return {
          message: `Here is the current status of booking **${b.bookingReference}**:\n• Status: **${b.status}**\n• Payment: ${b.paymentStatus}\n• Vehicle: ${b.vehicleName || 'Reserved Vehicle'}\n• Pickup: ${new Date(b.pickupAt).toLocaleString()}\n• Return: ${new Date(b.returnAt).toLocaleString()}\n• Total: ₹${b.pricingSnapshot?.total || b.totalAmount}`
        };
      }
      return {
        message: parsed.error || 'Could not find booking with that reference. Please ensure you are logged into the account that made the booking.'
      };
    }

    if (toolName === 'create_booking') {
      if (parsed.requiresConfirmation) {
        return {
          message: parsed.promptUser || 'Please confirm your booking details to finalize the reservation.'
        };
      }
      if (parsed.success && parsed.data) {
        const b = parsed.data;
        return {
          message: `🎉 Booking created successfully! Reference: **${b.bookingReference}**. Status: **${b.status}**. Please proceed to the payment page to confirm your reservation.`
        };
      }
      return {
        message: parsed.error || 'Unable to create booking. Please ensure you are signed in and all details are valid.'
      };
    }

    if (toolName === 'cancellation_policy') {
      if (parsed.data?.policy) {
        const p = parsed.data.policy;
        return {
          message: `**SkyBolt Rentals Cancellation Policy**:\n• ${p.rules?.join('\n• ') || 'Free cancellation up to 24 hours prior to pickup.'}\n\nIf you have a confirmed booking you wish to cancel, please provide your booking reference.`
        };
      }
      if (parsed.success && parsed.data?.status === 'CANCELLED') {
        return {
          message: `Your booking **${parsed.data.bookingReference}** has been successfully cancelled. Refund status: ${parsed.data.refundStatus || 'Processing'}.`
        };
      }
      return {
        message: parsed.error || 'Cancellation inquiry could not be completed.'
      };
    }

    if (toolName === 'check_coupons') {
      if (parsed.data?.coupons?.length) {
        const list = parsed.data.coupons
          .map((c: any) => `• **${c.code}**: ${c.discountType === 'PERCENTAGE' ? `${c.discountValue}% OFF` : `₹${c.discountValue} OFF`} (Min: ₹${c.minBookingAmount || 0})`)
          .join('\n');
        return {
          message: `Here are our currently active promotional coupons:\n\n${list}\n\nYou can mention any code during booking quote calculation to apply your discount!`
        };
      }
      return {
        message: parsed.data?.message || 'No active public coupons found at this time. Please check back soon for special offers!'
      };
    }

    if (toolName === 'get_locations') {
      if (parsed.data?.hubs?.length) {
        const list = parsed.data.hubs
          .map((h: any) => `• **${h.name}** — ${h.address}, ${h.city} (${h.operatingHours || '24/7'})`)
          .join('\n');
        return {
          message: `SkyBolt operates at the following convenient pickup & drop-off hubs:\n\n${list}\n\nWhich location would you prefer for pickup?`
        };
      }
      return {
        message: 'SkyBolt operates across major cities. Please visit our website or contact support for local hub directions.'
      };
    }

    return {
      message: parsed.message || 'I have retrieved the requested rental information. Let me know if you need any additional assistance!'
    };
  }

  private generateDirectResponse(text: string): AIProviderResponse {
    if (text.includes('deposit') || text.includes('security deposit')) {
      return {
        message: 'A refundable security deposit is collected at the time of booking confirmation. The deposit amount varies by vehicle category (e.g. ₹2,000 for standard cars, ₹5,000 for premium SUVs) and is fully refunded to your original payment method within 48 hours after vehicle inspection.'
      };
    }

    if (text.includes('license') || text.includes('age') || text.includes('requirement') || text.includes('eligibility')) {
      return {
        message: 'To rent a vehicle with SkyBolt Rentals, you must:\n1. Be at least 21 years of age.\n2. Possess a valid, original Government-issued Driver\'s License.\n3. Provide an official identity proof (Aadhaar or Passport).\n4. Undergo digital KYC verification prior to vehicle handover.'
      };
    }

    if (text.includes('help') || text.includes('support') || text.includes('contact')) {
      return {
        message: 'You can reach SkyBolt customer support 24/7 at **support@skyboltrentals.com** or phone **+91 1800-SKYBOLT**. How can I help you right now?'
      };
    }

    if (text.includes('hello') || text.includes('hi') || text.includes('hey')) {
      return {
        message: 'Hello! I am **SkyBolt AI**, your vehicle rental assistant. I can help you discover cars, check real-time availability, calculate price quotes, explain rental policies, or check your booking status. How can I assist you today?'
      };
    }

    return {
      message: 'I am SkyBolt AI. You can ask me to find cars, check vehicle availability, calculate quotes, or view our rental policies. What kind of vehicle are you looking for?'
    };
  }
}

export const mockAIProvider = new MockAIProvider();
