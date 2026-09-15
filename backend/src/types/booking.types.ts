import { Types } from 'mongoose';

export type BookingStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'PAYMENT_PENDING'
  | 'CONFIRMED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export type PaymentStatus =
  | 'UNPAID'
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type CancellationReason =
  | 'CUSTOMER_REQUEST'
  | 'OPERATIONAL'
  | 'PAYMENT_TIMEOUT'
  | 'SYSTEM'
  | 'OTHER';

export interface PricingSnapshot {
  currency: string;
  baseAmount: number;
  subtotal: number;
  tax: number;
  discount: number;
  fees: number;
  total: number;
  pricingVersion: string;
}

export interface VehicleSnapshot {
  brand: string;
  model: string;
  variant?: string;
  registrationNumber?: string;
  image: string;
  name: string;
}

export interface LocationSnapshot {
  locationId?: string;
  name: string;
  address?: string;
}

export interface StatusHistoryItem {
  from: BookingStatus | null;
  to: BookingStatus;
  changedAt: Date;
  changedBy: string; // 'CUSTOMER' | 'SYSTEM' | 'STAFF' | userId
  reason?: string;
}

export interface CancellationDetails {
  reason: CancellationReason;
  notes?: string;
  cancelledAt: Date;
  cancelledBy: string; // userId or 'SYSTEM'
  refundAmount?: number;
  refundStatus?: 'NOT_APPLICABLE' | 'PENDING' | 'PROCESSED' | 'FAILED';
  refundId?: string;
  refundFailureReason?: string;
  refundProcessedAt?: Date;
}

export interface IBooking {
  _id?: Types.ObjectId;
  bookingReference: string;
  userId: Types.ObjectId;
  vehicleId: Types.ObjectId;
  ownerId?: Types.ObjectId | null;
  reservationId?: Types.ObjectId;

  pickupAt: Date;
  returnAt: Date;

  pickupLocation: LocationSnapshot;
  returnLocation: LocationSnapshot;

  status: BookingStatus;
  paymentStatus: PaymentStatus;

  pricingSnapshot: PricingSnapshot;
  vehicleSnapshot: VehicleSnapshot;

  statusHistory: StatusHistoryItem[];
  cancellation?: CancellationDetails;

  metadata?: Record<string, any>;

  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookingDTO {
  id: string;
  bookingReference: string;
  userId: string;
  vehicleId: string;
  ownerId?: string;
  vehicle: VehicleSnapshot;
  pickupAt: string;
  returnAt: string;
  pickupLocation: LocationSnapshot;
  returnLocation: LocationSnapshot;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  pricing: PricingSnapshot;
  cancellation?: {
    reason: CancellationReason;
    notes?: string;
    cancelledAt: string;
    cancelledBy: string;
    refundAmount?: number;
    refundStatus?: string;
    refundId?: string;
    refundFailureReason?: string;
    refundProcessedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateBookingInput {
  vehicleId: string;
  pickupAt: string;
  returnAt: string;
  pickupLocation?: string;
  returnLocation?: string;
  notes?: string;
  couponCode?: string;
}

export interface CancelBookingInput {
  reason?: CancellationReason;
  notes?: string;
}

export type BookingSortField = 'newest' | 'oldest' | 'pickup_soonest' | 'pickup_latest';

export interface BookingListQuery {
  status?: BookingStatus;
  from?: string;
  to?: string;
  vehicleId?: string;
  sort?: BookingSortField;
  page?: number;
  limit?: number;
}
