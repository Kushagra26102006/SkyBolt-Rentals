export type DurationUnit = 'DAY' | 'HOUR';

export interface PricingDuration {
  value: number;
  unit: DurationUnit;
  hoursTotal: number;
}

export interface DiscountBreakdown {
  type: 'DURATION' | 'COUPON' | 'PROMOTIONAL';
  code?: string;
  name: string;
  amount: number;
  ratePercentage?: number;
}

export interface FeeBreakdown {
  type: 'DEPOSIT' | 'SERVICE' | 'INSURANCE' | 'DELIVERY';
  name: string;
  amount: number;
  isRefundable: boolean;
}

export interface TaxBreakdown {
  name: string;
  ratePercentage: number;
  taxableAmount: number;
  taxAmount: number;
}

export interface PricingBreakdown {
  duration: PricingDuration;
  baseRatePerDay: number;
  grossBaseAmount: number;
  discounts: DiscountBreakdown[];
  totalDiscount: number;
  taxableSubtotal: number;
  taxes: TaxBreakdown[];
  totalTax: number;
  fees: FeeBreakdown[];
  totalFees: number;
  finalTotal: number;
  currency: string;
}

export interface PricingSnapshotDTO {
  currency: string;
  baseAmount: number;
  subtotal: number;
  tax: number;
  discount: number;
  fees: number;
  total: number;
  pricingVersion: string;
}

export interface PricingQuoteRequest {
  vehicleId: string;
  pickupAt: string;
  returnAt: string;
  couponCode?: string;
  pickupLocation?: string;
  returnLocation?: string;
}

export interface PricingQuoteDTO {
  vehicleId: string;
  vehicleName: string;
  currency: string;
  duration: PricingDuration;
  baseRate: number;
  baseAmount: number;
  discountAmount: number;
  feeAmount: number;
  taxAmount: number;
  subtotal: number;
  total: number;
  breakdown: PricingBreakdown;
  pricingVersion: string;
  calculatedAt: string;
}

export interface AuthoritativePricingResult {
  quote: PricingQuoteDTO;
  pricingSnapshot: PricingSnapshotDTO;
}
