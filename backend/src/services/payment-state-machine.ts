import { PaymentStatus } from '../types/payment.types.js';
import { ApiError } from '../utils/api-error.js';

/**
 * Strict Payment State Machine
 * Centralizes all payment status transitions, invariant enforcement, and terminal controls.
 */
export class PaymentStateMachine {
  // Explicit transition map: Current State -> Set of Allowed Next States
  private static readonly TRANSITION_MAP: Record<PaymentStatus, readonly PaymentStatus[]> = {
    CREATED: ['ORDER_CREATED', 'FAILED'],
    ORDER_CREATED: ['PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED'],
    PENDING: ['AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED'],
    AUTHORIZED: ['CAPTURED', 'FAILED'],
    CAPTURED: ['REFUNDED', 'PARTIALLY_REFUNDED'],
    FAILED: [],            // Terminal state
    CANCELLED: [],         // Terminal state
    REFUNDED: [],          // Terminal state
    PARTIALLY_REFUNDED: ['REFUNDED']
  };

  /**
   * Evaluates whether a transition from currentState to targetState is permitted
   */
  public static canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
    const allowed = this.TRANSITION_MAP[from];
    return Boolean(allowed && allowed.includes(to));
  }

  /**
   * Asserts that a transition is valid; throws domain ApiError if not permitted
   */
  public static assertTransition(from: PaymentStatus, to: PaymentStatus): void {
    if (!this.canTransition(from, to)) {
      throw new ApiError(
        409,
        'INVALID_PAYMENT_STATE_TRANSITION',
        `Cannot transition payment status from "${from}" to "${to}". Allowed next states: [${(this.TRANSITION_MAP[from] || []).join(', ')}]`
      );
    }
  }

  /**
   * Checks if a payment is in a terminal state
   */
  public static isTerminal(status: PaymentStatus): boolean {
    return ['FAILED', 'CANCELLED', 'REFUNDED'].includes(status);
  }

  /**
   * Checks if payment is in a successful, captured state
   */
  public static isCaptured(status: PaymentStatus): boolean {
    return status === 'CAPTURED';
  }
}

export default PaymentStateMachine;
