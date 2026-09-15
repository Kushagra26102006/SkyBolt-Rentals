import { FleetStatus } from '../types/vehicle.types.js';
import { ApiError } from '../utils/api-error.js';

/**
 * Authoritative Central Fleet State Machine
 * Defines permissible physical vehicle operational state transitions,
 * terminal state invariants, and rental readiness gating.
 */
export class FleetStateMachine {
  private static readonly TRANSITION_MAP: Record<FleetStatus, readonly FleetStatus[]> = {
    AVAILABLE: [
      'RESERVED',
      'ACTIVE_RENTAL',
      'MAINTENANCE',
      'INSPECTION',
      'UNAVAILABLE',
      'TRANSFER_PENDING',
      'RETIRED'
    ],
    RESERVED: ['ACTIVE_RENTAL', 'AVAILABLE', 'UNAVAILABLE', 'RETIRED'],
    ACTIVE_RENTAL: ['INSPECTION', 'AVAILABLE', 'MAINTENANCE', 'UNAVAILABLE'],
    MAINTENANCE: ['INSPECTION', 'RETIRED', 'UNAVAILABLE'],
    INSPECTION: ['AVAILABLE', 'MAINTENANCE', 'RETIRED', 'UNAVAILABLE'],
    TRANSFER_PENDING: ['AVAILABLE', 'UNAVAILABLE'],
    UNAVAILABLE: ['INSPECTION', 'MAINTENANCE', 'AVAILABLE', 'RETIRED'],
    RETIRED: [] // Terminal state: once retired, vehicle cannot be re-activated
  };

  /**
   * Evaluates if a fleet state transition is permitted
   */
  public static canTransition(from: FleetStatus, to: FleetStatus): boolean {
    if (from === to) return true; // Idempotent no-op
    const allowed = this.TRANSITION_MAP[from];
    return Boolean(allowed && allowed.includes(to));
  }

  /**
   * Asserts that a fleet transition is permissible; throws 409 ApiError otherwise
   */
  public static assertTransition(from: FleetStatus, to: FleetStatus): void {
    if (!this.canTransition(from, to)) {
      throw new ApiError(
        409,
        'INVALID_FLEET_TRANSITION',
        `Cannot transition vehicle fleet status from "${from}" to "${to}". Permissible target states: [${(this.TRANSITION_MAP[from] || []).join(', ')}]`
      );
    }
  }

  /**
   * Retrieves list of valid target states from current state
   */
  public static getAllowedNextStates(from: FleetStatus): readonly FleetStatus[] {
    return this.TRANSITION_MAP[from] || [];
  }

  /**
   * Returns true if status physically permits customer rental
   */
  public static isRentable(status: FleetStatus): boolean {
    return status === 'AVAILABLE';
  }

  /**
   * Checks if status is permanently terminal (RETIRED)
   */
  public static isTerminal(status: FleetStatus): boolean {
    return status === 'RETIRED';
  }
}

export default FleetStateMachine;
