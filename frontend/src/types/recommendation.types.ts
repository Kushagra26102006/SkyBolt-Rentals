import { VehicleCategory, VehicleDTO } from './vehicle.types.js';
import { PricingQuoteDTO } from './pricing.types.js';

export type RecommendationSource = 'AI' | 'HYBRID' | 'DETERMINISTIC';

export interface RecommendationRequestDTO {
  pickupAt?: string;
  returnAt?: string;
  pickupLocation?: string;
  returnLocation?: string;
  passengers?: number;
  luggageCount?: number;
  budget?: number;
  category?: VehicleCategory;
  transmission?: 'MANUAL' | 'AUTOMATIC';
  fuelType?: 'PETROL' | 'DIESEL' | 'ELECTRIC' | 'HYBRID' | 'MANUAL';
  query?: string;
  limit?: number;
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

export interface RecommendationChatResponseDTO extends RecommendationResponseDTO {
  reply: string;
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
