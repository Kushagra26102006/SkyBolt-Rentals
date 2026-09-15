import { FleetStatus } from './fleet.types';

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
  | 'ACTIVE'
  | 'INACTIVE'
  | 'MAINTENANCE'
  | 'RETIRED';

export type TransmissionType = 'AUTOMATIC' | 'MANUAL';
export type FuelType = 'PETROL' | 'DIESEL' | 'ELECTRIC' | 'HYBRID';

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
  rentalType: 'DAILY' | 'HOURLY' | 'WEEKLY';
  baseRate: number; // Integer minor units (e.g., paise: 120000 = ₹1,200)
  currency: string; // e.g. 'INR'
  deposit?: number;
}

export interface VehicleLocation {
  locationId?: string;
  name: string;
  city: string;
  address?: string;
}

export interface VehicleImage {
  url: string;
  thumbnailUrl?: string;
  altText?: string;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface VehicleDTO {
  id: string;
  vehicleCode: string;
  name: string;
  brand: string;
  model: string;
  variant?: string;
  year: number;
  category: VehicleCategory;
  specifications: VehicleSpecifications;
  rental: VehicleRental;
  location: VehicleLocation;
  images: VehicleImage[];
  features: string[];
  description?: string;
  rating: {
    average: number;
    count: number;
  };
  status: VehicleStatus;
  fleetStatus?: FleetStatus;
  currentHubId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleQueryFilters {
  category?: VehicleCategory;
  brand?: string;
  fuelType?: FuelType;
  transmission?: TransmissionType;
  minPrice?: number;
  maxPrice?: number;
  seats?: number;
  location?: string;
  search?: string;
  sort?: 'price_asc' | 'price_desc' | 'rating_desc' | 'newest' | 'popular';
  page?: number;
  limit?: number;
}

export interface PaginatedVehiclesResult {
  items: VehicleDTO[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
