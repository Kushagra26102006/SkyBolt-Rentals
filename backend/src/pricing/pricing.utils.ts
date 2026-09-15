import { PricingDuration } from './pricing.types.js';

const MS_PER_HOUR = 60 * 60 * 1000;
const GRACE_PERIOD_HOURS = 1.0; // 1-hour grace window on 24-hour cycle

/**
 * Calculates rental duration according to the platform's 24-hour rental day policy
 * A 1-hour grace tolerance is granted past the 24-hour cycle.
 * Minimum rental period is 1 day.
 */
export function calculateRentalDuration(pickupAt: Date, returnAt: Date): PricingDuration {
  const diffMs = returnAt.getTime() - pickupAt.getTime();
  if (diffMs <= 0) {
    throw new Error('Return timestamp must be strictly after pickup timestamp.');
  }

  const hoursTotal = diffMs / MS_PER_HOUR;
  const fullDays = Math.floor(hoursTotal / 24);
  const remainderHours = hoursTotal % 24;

  let days = fullDays;
  if (remainderHours > GRACE_PERIOD_HOURS) {
    days += 1;
  } else if (days === 0) {
    days = 1;
  }

  return {
    value: Math.max(1, days),
    unit: 'DAY',
    hoursTotal: Math.round(hoursTotal * 100) / 100
  };
}

/**
 * Deterministic monetary rounding to 2 decimal places (paise precision)
 * Eliminates floating point arithmetic drift (e.g. 0.1 + 0.2)
 */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Clamps numeric value between lower and upper bound
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Standard locale currency formatting for INR
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(amount);
}
