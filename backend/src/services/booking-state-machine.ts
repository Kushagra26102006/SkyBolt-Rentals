import { BookingStatus } from '../types/booking.types.js';
import { ApiError } from '../utils/api-error.js';

/**
 * Strict Booking State Machine
 * Centralizes all transition validations, invariant enforcement, and terminal state controls.
 */
export class BookingStateMachine {
  // Explicit transition map: Current State -> Set of Allowed Next States
  private static readonly TRANSITION_MAP: Record<BookingStatus, readonly BookingStatus[]> = {
    DRAFT: ['PENDING'],
    PENDING: ['PAYMENT_PENDING', 'CANCELLED', 'EXPIRED'],
    PAYMENT_PENDING: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
    CONFIRMED: ['ACTIVE', 'CANCELLED'],
    ACTIVE: ['COMPLETED'],
    COMPLETED: [], // Terminal
    CANCELLED: [], // Terminal
    EXPIRED: []    // Terminal
  };

  /**
   * Evaluates whether a transition from currentState to targetState is permitted
   */
  public static canTransition(from: BookingStatus, to: BookingStatus): boolean {
    const allowed = this.TRANSITION_MAP[from];
    return Boolean(allowed && allowed.includes(to));
  }

  /**
   * Asserts that a transition is valid; throws domain ApiError if not permitted
   */
  public static assertTransition(from: BookingStatus, to: BookingStatus): void {
    if (!this.canTransition(from, to)) {
      throw new ApiError(
        409,
        'INVALID_STATE_TRANSITION',
        `Cannot transition booking status from "${from}" to "${to}". Allowed next states: [${(this.TRANSITION_MAP[from] || []).join(', ')}]`
      );
    }
  }

  /**
   * Checks if a booking is in a cancellable state
   */
  public static isCancellable(status: BookingStatus): boolean {
    return ['PENDING', 'PAYMENT_PENDING', 'CONFIRMED'].includes(status);
  }

  /**
   * Checks if a booking status constitutes an active hold or rental blocking vehicle availability
   */
  public static isBlockingInventory(status: BookingStatus): boolean {
    return ['PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'ACTIVE'].includes(status);
  }

  /**
   * Checks if a state is terminal (no further state changes allowed)
   */
  public static isTerminal(status: BookingStatus): boolean {
    return ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(status);
  }
}

export default BookingStateMachine;
