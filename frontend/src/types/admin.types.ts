import { UserRole, UserStatus } from './auth.types';
import { FleetStatus } from './fleet.types';

export interface OverviewMetrics {
  vehicles: {
    total: number;
    available: number;
    reserved: number;
    activeRental: number;
    maintenance: number;
    inspection: number;
    transfer: number;
    unavailable: number;
    retired: number;
  };
  bookings: {
    total: number;
    active: number;
    confirmed: number;
    pending: number;
    paymentPending: number;
    completed: number;
    cancelled: number;
    refunded: number;
  };
  payments: {
    total: number;
    captured: number;
    pending: number;
    failed: number;
    refunded: number;
    totalRevenueInr: number;
  };
  hubs: {
    total: number;
    active: number;
    inactive: number;
    totalCapacity: number;
    currentVehicleCount: number;
    occupancyPercent: number;
  };
  alerts: OperationalAlert[];
  recentActivity: Array<{
    id: string;
    timestamp: string;
    actorEmail: string;
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string;
  }>;
}

export interface OperationalAlert {
  id: string;
  type:
    | 'VEHICLES_STUCK_IN_MAINTENANCE'
    | 'FAILED_INSPECTIONS'
    | 'TRANSFERS_OVERDUE'
    | 'INACTIVE_HUBS_WITH_VEHICLES'
    | 'PAYMENT_BOOKING_MISMATCHES'
    | 'VEHICLES_WITHOUT_HUBS'
    | 'CAPACITY_OVERFLOW_HUBS';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  message: string;
  count: number;
  entityIds?: string[];
  actionLink?: string;
}

export interface AdminBookingItem {
  id: string;
  bookingReference: string;
  customer: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  } | null;
  vehicle: {
    id: string;
    brand: string;
    model: string;
    variant?: string;
    registrationNumber?: string;
    name: string;
    category: string;
    fleetStatus?: FleetStatus;
  } | null;
  pickupAt: string;
  returnAt: string;
  pickupLocation: string;
  returnLocation: string;
  status: string;
  paymentStatus: string;
  pricing: {
    baseRate: number;
    days: number;
    subtotal: number;
    gst: number;
    securityDeposit: number;
    total: number;
    currency: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string;
  licenseNumber?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
}

export interface AdminPaymentItem {
  id: string;
  paymentReference: string;
  booking: {
    id: string;
    reference: string;
    status: string;
  } | null;
  customer: {
    id: string;
    name: string;
    email: string;
  } | null;
  amountPaise: number;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  providerOrderId: string;
  providerPaymentId?: string;
  failureReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditLogItem {
  id: string;
  actorId: string;
  actorRole: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  previousState?: unknown;
  newState?: unknown;
  reason?: string;
  createdAt: string;
}
