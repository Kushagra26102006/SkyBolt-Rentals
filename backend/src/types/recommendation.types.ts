import { VehicleCategory, VehicleDTO } from './vehicle.types.js';
import { PricingQuoteDTO } from '../pricing/pricing.types.js';

export type RecommendationSource = 'AI' | 'HYBRID' | 'DETERMINISTIC';

export interface RecommendationRequestDTO {
  pickupAt?: string;
  returnAt?: string;
  pickupLocation?: string;
  returnLocation?: string;
  passengers?: number;
  luggageCount?: number;
  budget?: number; // Maximum daily rental budget in INR
  category?: VehicleCategory;
  transmission?: 'MANUAL' | 'AUTOMATIC';
  fuelType?: 'PETROL' | 'DIESEL' | 'ELECTRIC' | 'HYBRID' | 'MANUAL';
  query?: string; // Natural language user trip description
  limit?: number;
}

export interface RecommendationCandidate {
  id: string;
  vehicleCode: string;
  brand: string;
  model: string;
  name: string;
  variant?: string;
  year: number;
  category: VehicleCategory;
  status: string;
  fleetStatus: string;
  seats: number;
  doors?: number;
  transmission: 'MANUAL' | 'AUTOMATIC';
  fuelType: string;
  luggageCapacity?: number;
  baseRate: number;
  currency: string;
  locationName: string;
  locationCity?: string;
  features: string[];
  ratingAverage: number;
  ratingCount: number;
  imageUrl?: string;
}

export interface VehicleRecommendationDTO {
  vehicle: VehicleDTO;
  reason: string;
  highlights: string[];
  score: number;
  availability: {
    available: boolean;
    pickupAt: string;
    returnAt: string;
  };
  pricing: PricingQuoteDTO;
}

export interface RecommendationResponseDTO {
  recommendations: VehicleRecommendationDTO[];
  generatedAt: string;
  source: RecommendationSource;
  candidateCount: number;
  executionTimeMs: number;
  provider: string;
}

export interface UserPreferencesDTO {
  userId: string;
  preferredCategories: VehicleCategory[];
  preferredTransmission?: 'MANUAL' | 'AUTOMATIC';
  preferredFuelType?: string;
  preferredSeatCount?: number;
  preferredPriceRange?: {
    min?: number;
    max?: number;
  };
  preferredFeatures?: string[];
  preferredPickupLocations?: string[];
  updatedAt?: string;
}

export type RecommendationEventType =
  | 'VEHICLE_VIEWED'
  | 'VEHICLE_SEARCHED'
  | 'VEHICLE_SELECTED'
  | 'BOOKING_COMPLETED'
  | 'RECOMMENDATION_CLICKED';

export interface RecommendationEventDTO {
  userId?: string;
  sessionId?: string;
  vehicleId?: string;
  eventType: RecommendationEventType;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface RecommendationFeedbackDTO {
  recommendationId?: string;
  vehicleId: string;
  helpful: boolean;
  feedback?: string;
  userId?: string;
}

export interface RecommendationMetricsDTO {
  totalRequests: number;
  aiSuccessCount: number;
  aiFallbackCount: number;
  cacheHitCount: number;
  cacheMissCount: number;
  averageLatencyMs: number;
  providerErrorCount: number;
  activeProvider: string;
  recentEventsCount: number;
}
