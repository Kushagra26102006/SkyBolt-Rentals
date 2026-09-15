export interface AvailabilityResult {
  vehicleId: string;
  available: boolean;
  reason?: 'VEHICLE_UNAVAILABLE' | 'VEHICLE_NOT_RENTABLE' | 'VEHICLE_MAINTENANCE' | 'INVALID_PERIOD';
  pickupAt: string;
  returnAt: string;
}

export interface InventoryHold {
  id: string;
  holdToken: string;
  vehicleId: string;
  userId: string;
  pickupAt: string;
  returnAt: string;
  expiresAt: string;
  status: 'HELD' | 'CONFIRMED' | 'ACTIVE' | 'CANCELLED' | 'COMPLETED' | 'EXPIRED';
  createdAt: string;
}

export interface AvailabilityQueryParams {
  pickupAt: string; // ISO-8601 string
  returnAt: string; // ISO-8601 string
}
