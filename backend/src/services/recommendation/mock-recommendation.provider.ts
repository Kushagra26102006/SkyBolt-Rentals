import {
  IRecommendationProvider,
  RecommendationContext,
  ProviderRankingResult
} from './recommendation-provider.interface.js';
import { RecommendationCandidate } from '../../types/recommendation.types.js';
import { deterministicScoringEngine } from './deterministic-scoring.engine.js';

export class MockRecommendationProvider implements IRecommendationProvider {
  public readonly name = 'mock_ai_engine';

  public async rankAndExplain(
    candidates: RecommendationCandidate[],
    context: RecommendationContext
  ): Promise<ProviderRankingResult> {
    // 1. If candidate list is empty, return empty result immediately
    if (!candidates || candidates.length === 0) {
      return {
        rankedVehicleIds: [],
        reasons: {},
        highlights: {},
        confidenceScores: {},
        providerName: this.name
      };
    }

    // 2. Score candidates using deterministic multi-criteria engine
    const scored = deterministicScoringEngine.scoreAndRank(candidates, context);

    // 3. Transform to ProviderRankingResult
    return deterministicScoringEngine.toProviderRankingResult(scored, this.name);
  }
}

export const mockRecommendationProvider = new MockRecommendationProvider();
export default mockRecommendationProvider;
