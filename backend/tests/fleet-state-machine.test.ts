import { describe, it, expect } from 'vitest';
import { FleetStateMachine } from '../src/services/fleet-state-machine.js';
import { FleetStatus } from '../src/types/vehicle.types.js';
import { ApiError } from '../src/utils/api-error.js';

describe('TASK 11: Production Fleet State Machine Unit Tests', () => {
  it('should allow valid standard rental transitions', () => {
    expect(FleetStateMachine.canTransition('AVAILABLE', 'RESERVED')).toBe(true);
    expect(FleetStateMachine.canTransition('RESERVED', 'ACTIVE_RENTAL')).toBe(true);
    expect(FleetStateMachine.canTransition('ACTIVE_RENTAL', 'INSPECTION')).toBe(true);
    expect(FleetStateMachine.canTransition('ACTIVE_RENTAL', 'AVAILABLE')).toBe(true);
  });

  it('should allow valid maintenance and inspection transitions', () => {
    // Routine/unscheduled service
    expect(FleetStateMachine.canTransition('AVAILABLE', 'MAINTENANCE')).toBe(true);
    // Maintenance must transition to INSPECTION for quality sign-off
    expect(FleetStateMachine.canTransition('MAINTENANCE', 'INSPECTION')).toBe(true);
    // Passed inspection returns to AVAILABLE
    expect(FleetStateMachine.canTransition('INSPECTION', 'AVAILABLE')).toBe(true);
    // Failed inspection returns to MAINTENANCE
    expect(FleetStateMachine.canTransition('INSPECTION', 'MAINTENANCE')).toBe(true);
  });

  it('should allow inter-hub transfer transitions', () => {
    expect(FleetStateMachine.canTransition('AVAILABLE', 'TRANSFER_PENDING')).toBe(true);
    expect(FleetStateMachine.canTransition('TRANSFER_PENDING', 'AVAILABLE')).toBe(true);
  });

  it('should allow retiring vehicles from valid operational states', () => {
    expect(FleetStateMachine.canTransition('AVAILABLE', 'RETIRED')).toBe(true);
    expect(FleetStateMachine.canTransition('MAINTENANCE', 'RETIRED')).toBe(true);
    expect(FleetStateMachine.canTransition('UNAVAILABLE', 'RETIRED')).toBe(true);
    expect(FleetStateMachine.canTransition('INSPECTION', 'RETIRED')).toBe(true);
  });

  it('should reject RETIRED to any other state (RETIRED is strictly terminal)', () => {
    const allStatuses: FleetStatus[] = [
      'AVAILABLE',
      'RESERVED',
      'ACTIVE_RENTAL',
      'MAINTENANCE',
      'INSPECTION',
      'UNAVAILABLE',
      'TRANSFER_PENDING',
      'RETIRED'
    ];

    allStatuses.forEach((target) => {
      if (target !== 'RETIRED') {
        expect(FleetStateMachine.canTransition('RETIRED', target)).toBe(false);
        expect(() => FleetStateMachine.assertTransition('RETIRED', target)).toThrow(ApiError);
      }
    });

    expect(FleetStateMachine.isTerminal('RETIRED')).toBe(true);
    expect(FleetStateMachine.isTerminal('AVAILABLE')).toBe(false);
  });

  it('should strictly reject MAINTENANCE directly to AVAILABLE (must pass INSPECTION first)', () => {
    expect(FleetStateMachine.canTransition('MAINTENANCE', 'AVAILABLE')).toBe(false);
    expect(() => FleetStateMachine.assertTransition('MAINTENANCE', 'AVAILABLE')).toThrow(ApiError);
  });

  it('should reject ACTIVE_RENTAL to RETIRED or TRANSFER_PENDING while in customer custody', () => {
    expect(FleetStateMachine.canTransition('ACTIVE_RENTAL', 'RETIRED')).toBe(false);
    expect(FleetStateMachine.canTransition('ACTIVE_RENTAL', 'TRANSFER_PENDING')).toBe(false);
  });

  it('should correctly evaluate rental capability via isRentable()', () => {
    expect(FleetStateMachine.isRentable('AVAILABLE')).toBe(true);
    expect(FleetStateMachine.isRentable('RESERVED')).toBe(false);
    expect(FleetStateMachine.isRentable('ACTIVE_RENTAL')).toBe(false);
    expect(FleetStateMachine.isRentable('MAINTENANCE')).toBe(false);
    expect(FleetStateMachine.isRentable('INSPECTION')).toBe(false);
    expect(FleetStateMachine.isRentable('TRANSFER_PENDING')).toBe(false);
    expect(FleetStateMachine.isRentable('UNAVAILABLE')).toBe(false);
    expect(FleetStateMachine.isRentable('RETIRED')).toBe(false);
  });

  it('should provide valid next states for any current state', () => {
    const nextForAvailable = FleetStateMachine.getAllowedNextStates('AVAILABLE');
    expect(nextForAvailable).toContain('RESERVED');
    expect(nextForAvailable).toContain('MAINTENANCE');
    expect(nextForAvailable).toContain('TRANSFER_PENDING');
    expect(nextForAvailable).toContain('RETIRED');
    expect(nextForAvailable).toContain('ACTIVE_RENTAL');
  });

  it('should treat self-transition as an idempotent no-op', () => {
    expect(FleetStateMachine.canTransition('AVAILABLE', 'AVAILABLE')).toBe(true);
    expect(() => FleetStateMachine.assertTransition('AVAILABLE', 'AVAILABLE')).not.toThrow();
  });
});
