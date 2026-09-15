import { IChatbotTool } from './tool.interface.js';
import { pricingService } from '../../../pricing/pricing.service.js';
import { CouponModel } from '../../../models/coupon.model.js';
import { ChatbotToolContext, ChatbotToolResult, IChatToolDefinition } from '../chatbot.types.js';

export class CouponTool implements IChatbotTool {
  public name = 'check_coupons';
  public description = 'Check active promotional coupon codes and validate discounts for rental bookings.';

  public definition: IChatToolDefinition = {
    type: 'function',
    function: {
      name: 'check_coupons',
      description: 'Check active discount promo codes or validate a specific coupon code with rental subtotal.',
      parameters: {
        type: 'object',
        properties: {
          couponCode: {
            type: 'string',
            description: 'Optional coupon code to validate (e.g. SKYBOLT10, WELCOME20).'
          },
          subtotal: {
            type: 'number',
            description: 'Optional estimated rental subtotal in INR.'
          }
        },
        additionalProperties: false
      }
    }
  };

  public async execute(params: any, _context: ChatbotToolContext): Promise<ChatbotToolResult> {
    try {
      const code = params?.couponCode ? String(params.couponCode).trim().toUpperCase() : undefined;

      // 1. If code is provided, validate through PricingService
      if (code) {
        const subtotal = Number(params?.subtotal) || 1000;
        try {
          const discount = await pricingService.validateCoupon(code, subtotal);
          return {
            success: true,
            data: {
              code,
              isValid: true,
              discountAmount: discount.amount,
              name: discount.name,
              ratePercentage: discount.ratePercentage,
              message: `Coupon "${code}" is valid! Discount: ₹${discount.amount}.`
            }
          };
        } catch (err: any) {
          return {
            success: false,
            error: err.message || `Coupon "${code}" is invalid or expired.`
          };
        }
      }

      // 2. If no code provided, list active public coupons
      const now = new Date();
      const activeCoupons = await CouponModel.find({
        isActive: true,
        $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }]
      })
        .select('code discountType discountValue minBookingAmount description')
        .limit(5)
        .lean()
        .exec();

      if (!activeCoupons || activeCoupons.length === 0) {
        return {
          success: true,
          data: {
            coupons: [],
            message: 'There are currently no active public promotional codes.'
          }
        };
      }

      return {
        success: true,
        data: {
          coupons: activeCoupons.map((c: any) => ({
            code: c.code,
            discountType: c.discountType,
            discountValue: c.discountValue,
            minBookingAmount: c.minBookingAmount,
            description: c.description || `${c.discountValue}${c.discountType === 'PERCENTAGE' ? '%' : ' INR'} OFF`
          }))
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Error checking coupons.'
      };
    }
  }
}

export const couponTool = new CouponTool();
