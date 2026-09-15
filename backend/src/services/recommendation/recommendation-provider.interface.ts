import {
  RecommendationCandidate,
  RecommendationRequestDTO,
  UserPreferencesDTO
} from '../../types/recommendation.types.js';

export interface RecommendationContext {
  request: RecommendationRequestDTO;
  userPreferences?: Partial<UserPreferencesDTO>;
  userBookingHistoryCount?: number;
  userPastCategories?: string[];
  userVerifiedReviewsCount?: number;
}

export interface ProviderRankingResult {
  rankedVehicleIds: string[];
  reasons: Record<string, string>; // vehicleId -> grounded natural explanation
  highlights: Record<string, string[]>; // vehicleId -> key highlight pills
  confidenceScores?: Record<string, number>; // vehicleId -> normalized score 0-100
  providerName: string;
  rawTokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface IRecommendationProvider {
  readonly name: string;
  rankAndExplain(
    candidates: RecommendationCandidate[],
    context: RecommendationContext
  ): Promise<ProviderRankingResult>;
}
