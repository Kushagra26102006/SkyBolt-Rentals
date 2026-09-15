import { Types } from 'mongoose';

export type ReservationStatus =
  | 'HELD'
  | 'CONFIRMED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export const BLOCKING_RESERVATION_STATUSES: ReservationStatus[] = [
  'CONFIRMED',
  'ACTIVE',
  'HELD'
];

export const NON_BLOCKING_RESERVATION_STATUSES: ReservationStatus[] = [
  'COMPLETED',
  'CANCELLED',
  'EXPIRED'
];

export interface IReservation {
  _id?: Types.ObjectId;
  vehicleId: Types.ObjectId;
  userId: Types.ObjectId;
  pickupAt: Date;
  returnAt: Date;
  status: ReservationStatus;
  expiresAt?: Date | null;
  holdToken?: string | null;
  metadata?: Record<string, any>;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryHoldDTO {
  id: string;
  holdToken: string;
  vehicleId: string;
  userId: string;
  pickupAt: string;
  returnAt: string;
  expiresAt: string;
  status: ReservationStatus;
  createdAt: string;
}

export interface ReservationDTO {
  id: string;
  vehicleId: string;
  userId: string;
  pickupAt: string;
  returnAt: string;
  status: ReservationStatus;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityCheckQuery {
  pickupAt: Date;
  returnAt: Date;
}

export interface AvailabilityResultDTO {
  vehicleId: string;
  available: boolean;
  reason?: 'VEHICLE_UNAVAILABLE' | 'VEHICLE_NOT_RENTABLE' | 'VEHICLE_MAINTENANCE' | 'INVALID_PERIOD';
  pickupAt: string;
  returnAt: string;
}
