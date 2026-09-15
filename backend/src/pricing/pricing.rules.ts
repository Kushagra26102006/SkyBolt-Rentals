import {
  DiscountBreakdown,
  FeeBreakdown,
  TaxBreakdown
} from './pricing.types.js';
import { roundMoney } from './pricing.utils.js';

export interface DurationDiscountThreshold {
  minDays: number;
  maxDays?: number;
  percentage: number;
  name: string;
}

export const DURATION_DISCOUNT_RULES: readonly DurationDiscountThreshold[] = [
  { minDays: 14, percentage: 15, name: 'Long-term Rental Discount (15%)' },
  { minDays: 7, maxDays: 13, percentage: 10, name: 'Weekly Rental Discount (10%)' },
  { minDays: 3, maxDays: 6, percentage: 5, name: 'Extended Rental Discount (5%)' }
];

export const STANDARD_GST_RATE = 18; // 18% GST baseline
export const STANDARD_REFUNDABLE_DEPOSIT = 1000; // ₹1,000 refundable security deposit

/**
 * Calculates volume duration discount based on rental days
 */
export function evaluateDurationDiscount(
  days: number,
  grossBaseAmount: number
): DiscountBreakdown | null {
  for (const rule of DURATION_DISCOUNT_RULES) {
    const minMatch = days >= rule.minDays;
    const maxMatch = rule.maxDays ? days <= rule.maxDays : true;

    if (minMatch && maxMatch) {
      const discountAmount = roundMoney((grossBaseAmount * rule.percentage) / 100);
      return {
        type: 'DURATION',
        name: rule.name,
        amount: discountAmount,
        ratePercentage: rule.percentage
      };
    }
  }
  return null;
}

/**
 * Evaluates standard booking fees (e.g. security deposit)
 */
export function evaluateBookingFees(): FeeBreakdown[] {
  return [
    {
      type: 'DEPOSIT',
      name: 'Refundable Security Deposit',
      amount: STANDARD_REFUNDABLE_DEPOSIT,
      isRefundable: true
    }
  ];
}

/**
 * Evaluates taxes on taxable rental subtotal
 */
export function evaluateTaxes(taxableSubtotal: number): {
  taxes: TaxBreakdown[];
  totalTax: number;
} {
  const taxAmount = roundMoney((taxableSubtotal * STANDARD_GST_RATE) / 100);
  const taxes: TaxBreakdown[] = [
    {
      name: `GST (${STANDARD_GST_RATE}%)`,
      ratePercentage: STANDARD_GST_RATE,
      taxableAmount: taxableSubtotal,
      taxAmount
    }
  ];

  return {
    taxes,
    totalTax: taxAmount
  };
}
