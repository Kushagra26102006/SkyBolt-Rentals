export type VehicleCategory =
  | 'CAR'
  | 'SUV'
  | 'SEDAN'
  | 'HATCHBACK'
  | 'BIKE'
  | 'SCOOTER'
  | 'EV'
  | 'LUXURY';

export type VehicleStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'MAINTENANCE'
  | 'RETIRED';

export type TransmissionType = 'MANUAL' | 'AUTOMATIC';

export type FuelType = 'PETROL' | 'DIESEL' | 'ELECTRIC' | 'HYBRID' | 'MANUAL';

export interface VehicleSpecifications {
  seats: number;
  doors?: number;
  transmission: TransmissionType;
  fuelType: FuelType;
  engineCC?: number;
  mileage?: string;
  luggageCapacity?: number;
}

export interface VehicleRental {
  baseRate: number; // Base rate in integer minor units or currency standard (e.g. ₹300/day)
  currency: string; // Defaults to 'INR'
  deposit?: number;
}

export interface VehicleLocation {
  name: string;
  city?: string;
  locationId?: string;
}

export interface VehicleImage {
  url: string;
  thumbnailUrl?: string;
  altText?: string;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface VehicleRating {
  average: number;
  count: number;
}

export type FleetStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'ACTIVE_RENTAL'
  | 'MAINTENANCE'
  | 'INSPECTION'
  | 'UNAVAILABLE'
  | 'TRANSFER_PENDING'
  | 'RETIRED';

export interface VehicleReadinessResult {
  ready: boolean;
  vehicleId: string;
  fleetStatus: FleetStatus;
  reasons: string[];
  hubId?: string;
  hubName?: string;
  hubOperational?: boolean;
  checkedAt: string;
}

export interface VehicleDTO {
  id: string;
  vehicleCode: string;
  brand: string;
  model: string;
  name: string;
  variant?: string;
  year: number;
  category: VehicleCategory;
  status: VehicleStatus;
  ownerId?: string;
  fleetStatus?: FleetStatus;
  currentHubId?: string;
  specifications: VehicleSpecifications;
  rental: VehicleRental;
  location: VehicleLocation;
  images: VehicleImage[];
  features: string[];
  description?: string;
  rating: VehicleRating;
  createdAt: string;
  updatedAt: string;
}

export interface AdminVehicleDTO extends VehicleDTO {
  registrationNumber?: string;
  adminNotes?: string;
  vin?: string;
  odometer?: number;
  activeBookingId?: string;
  maintenanceState?: {
    inMaintenance: boolean;
    currentMaintenanceId?: string;
    lastServicedAt?: string;
    nextServiceOdometer?: number;
  };
  inspectionState?: {
    lastInspectionResult?: 'PASSED' | 'FAILED' | 'CONDITIONAL';
    lastInspectedAt?: string;
    lastInspectionId?: string;
  };
}

export interface OwnerStatsDTO {
  totalVehicles: number;
  activeVehicles: number;
  pendingApprovalVehicles: number;
  totalBookings: number;
  upcomingRentals: number;
  completedRentals: number;
  totalEarnings: number;
}

export interface OwnerEarningsDTO {
  totalEarnings: number;
  pendingEarnings: number;
  completedEarnings: number;
  currency: string;
  recentTransactions: Array<{
    bookingReference: string;
    vehicleName: string;
    pickupAt: string;
    returnAt: string;
    bookingStatus: string;
    paymentStatus: string;
    amount: number;
    createdAt: string;
  }>;
}

export interface VehicleQueryFilters {
  search?: string;
  category?: VehicleCategory;
  brand?: string;
  fuelType?: FuelType;
  transmission?: TransmissionType;
  minPrice?: number;
  maxPrice?: number;
  seats?: number;
  location?: string;
  status?: VehicleStatus;
  pickupAt?: string;
  returnAt?: string;
}

export type VehicleSortOption =
  | 'price_asc'
  | 'price_desc'
  | 'rating_desc'
  | 'newest'
  | 'popular';

export interface PaginatedVehiclesResult {
  items: VehicleDTO[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
