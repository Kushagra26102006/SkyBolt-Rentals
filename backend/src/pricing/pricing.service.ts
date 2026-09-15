import { IVehicleDoc } from '../models/vehicle.model.js';
import { vehicleRepository } from '../repositories/vehicle.repository.js';
import { CouponModel } from '../models/coupon.model.js';
import {
  AuthoritativePricingResult,
  DiscountBreakdown,
  PricingBreakdown,
  PricingQuoteDTO,
  PricingQuoteRequest,
  PricingSnapshotDTO
} from './pricing.types.js';
import { calculateRentalDuration, roundMoney } from './pricing.utils.js';
import {
  evaluateDurationDiscount,
  evaluateBookingFees,
  evaluateTaxes
} from './pricing.rules.js';
import { ApiError } from '../utils/api-error.js';

export const CURRENT_PRICING_VERSION = 'v2_engine';

export class PricingService {
  /**
   * Validates coupon code eligibility against subtotal and active rules
   */
  public async validateCoupon(
    couponCode: string,
    currentSubtotal: number
  ): Promise<DiscountBreakdown> {
    const normalizedCode = couponCode.trim().toUpperCase();
    const coupon = await CouponModel.findOne({
      code: normalizedCode,
      isActive: true
    }).exec();

    if (!coupon) {
      throw new ApiError(422, 'INVALID_COUPON', `Coupon code "${normalizedCode}" is invalid or inactive.`);
    }

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) {
      throw new ApiError(422, 'COUPON_NOT_YET_ACTIVE', 'This coupon is not yet active.');
    }

    if (coupon.expiresAt && coupon.expiresAt <= now) {
      throw new ApiError(422, 'COUPON_EXPIRED', 'This coupon has expired.');
    }

    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      throw new ApiError(422, 'COUPON_USAGE_LIMIT_REACHED', 'This coupon has reached its maximum redemption limit.');
    }

    if (coupon.minBookingAmount && currentSubtotal < coupon.minBookingAmount) {
      throw new ApiError(
        422,
        'COUPON_MINIMUM_SPEND_NOT_MET',
        `A minimum rental amount of ₹${coupon.minBookingAmount} is required to use coupon "${normalizedCode}".`
      );
    }

    let calculatedDiscount = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      calculatedDiscount = roundMoney((currentSubtotal * coupon.discountValue) / 100);
      if (coupon.maxDiscountAmount && calculatedDiscount > coupon.maxDiscountAmount) {
        calculatedDiscount = coupon.maxDiscountAmount;
      }
    } else {
      calculatedDiscount = roundMoney(Math.min(coupon.discountValue, currentSubtotal));
    }

    return {
      type: 'COUPON',
      code: coupon.code,
      name: coupon.description || `Coupon (${coupon.code})`,
      amount: calculatedDiscount,
      ratePercentage: coupon.discountType === 'PERCENTAGE' ? coupon.discountValue : undefined
    };
  }

  /**
   * Authoritatively calculates rental price breakdown, quote, and immutable snapshot
   * Single source of truth across all platforms.
   */
  public async calculatePrice(
    vehicle: IVehicleDoc,
    pickupAt: Date,
    returnAt: Date,
    couponCode?: string
  ): Promise<AuthoritativePricingResult> {
    // 1. Calculate rental duration using platform policy
    const duration = calculateRentalDuration(pickupAt, returnAt);

    // 2. Retrieve authoritative base rate
    const baseRatePerDay = vehicle.rental?.baseRate || 1000;
    if (baseRatePerDay <= 0) {
      throw new ApiError(500, 'VEHICLE_PRICE_UNAVAILABLE', 'Vehicle base rate is invalid or unavailable.');
    }

    // 3. Compute gross base rental amount
    const grossBaseAmount = roundMoney(baseRatePerDay * duration.value);

    // 4. Evaluate discounts
    const discounts: DiscountBreakdown[] = [];

    // 4a. Volume duration discount
    const durationDiscount = evaluateDurationDiscount(duration.value, grossBaseAmount);
    if (durationDiscount) {
      discounts.push(durationDiscount);
    }

    // 4b. Coupon discount
    if (couponCode && couponCode.trim().length > 0) {
      const discountedSoFar = durationDiscount ? durationDiscount.amount : 0;
      const subtotalForCoupon = Math.max(0, grossBaseAmount - discountedSoFar);
      const couponDiscount = await this.validateCoupon(couponCode, subtotalForCoupon);
      discounts.push(couponDiscount);
    }

    // 5. Total discount & clamped taxable subtotal
    const totalDiscount = roundMoney(discounts.reduce((sum, d) => sum + d.amount, 0));
    const taxableSubtotal = roundMoney(Math.max(0, grossBaseAmount - totalDiscount));

    // 6. Taxes
    const { taxes, totalTax } = evaluateTaxes(taxableSubtotal);

    // 7. Fees (Refundable security deposit)
    const fees = evaluateBookingFees();
    const totalFees = roundMoney(fees.reduce((sum, f) => sum + f.amount, 0));

    // 8. Final authoritative total
    const finalTotal = roundMoney(taxableSubtotal + totalTax + totalFees);

    if (finalTotal < 0 || isNaN(finalTotal)) {
      throw new ApiError(500, 'PRICING_CALCULATION_ERROR', 'Calculated pricing total is invalid.');
    }

    const currency = vehicle.rental?.currency || 'INR';

    const breakdown: PricingBreakdown = {
      duration,
      baseRatePerDay,
      grossBaseAmount,
      discounts,
      totalDiscount,
      taxableSubtotal,
      taxes,
      totalTax,
      fees,
      totalFees,
      finalTotal,
      currency
    };

    const calculatedAt = new Date().toISOString();

    const quote: PricingQuoteDTO = {
      vehicleId: vehicle._id.toString(),
      vehicleName: vehicle.name,
      currency,
      duration,
      baseRate: baseRatePerDay,
      baseAmount: grossBaseAmount,
      discountAmount: totalDiscount,
      feeAmount: totalFees,
      taxAmount: totalTax,
      subtotal: taxableSubtotal,
      total: finalTotal,
      breakdown,
      pricingVersion: CURRENT_PRICING_VERSION,
      calculatedAt
    };

    const pricingSnapshot: PricingSnapshotDTO = {
      currency,
      baseAmount: grossBaseAmount,
      subtotal: taxableSubtotal,
      tax: totalTax,
      discount: totalDiscount,
      fees: totalFees,
      total: finalTotal,
      pricingVersion: CURRENT_PRICING_VERSION
    };

    return { quote, pricingSnapshot };
  }

  /**
   * Generates a transparent price quote for customer display without placing holds
   */
  public async generateQuote(input: PricingQuoteRequest): Promise<PricingQuoteDTO> {
    const vehicle = await vehicleRepository.findByIdOrCode(input.vehicleId);
    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${input.vehicleId}" not found.`);
    }

    if (vehicle.status !== 'ACTIVE') {
      throw new ApiError(
        409,
        'VEHICLE_NOT_RENTABLE',
        `Vehicle is currently in "${vehicle.status}" status and cannot be quoted.`
      );
    }

    const pickupAt = new Date(input.pickupAt);
    const returnAt = new Date(input.returnAt);

    if (isNaN(pickupAt.getTime()) || isNaN(returnAt.getTime())) {
      throw ApiError.badRequest('Invalid pickup or return date format.');
    }

    if (pickupAt >= returnAt) {
      throw ApiError.unprocessable('Return timestamp must be strictly after pickup timestamp.');
    }

    const result = await this.calculatePrice(
      vehicle,
      pickupAt,
      returnAt,
      input.couponCode
    );

    return result.quote;
  }
}

export const pricingService = new PricingService();
export default pricingService;
