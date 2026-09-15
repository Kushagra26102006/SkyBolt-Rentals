import { RecommendationCandidate } from '../../types/recommendation.types.js';
import {
  RecommendationContext,
  ProviderRankingResult
} from './recommendation-provider.interface.js';

export interface ScoredCandidate {
  candidate: RecommendationCandidate;
  score: number;
  reason: string;
  highlights: string[];
}

export class DeterministicScoringEngine {
  /**
   * Score and rank candidate vehicles using an explainable, multi-factor deterministic algorithm
   */
  public scoreAndRank(
    candidates: RecommendationCandidate[],
    context: RecommendationContext
  ): ScoredCandidate[] {
    const scored = candidates.map((candidate) => {
      const { score, highlights, primaryReason } = this.calculateCandidateScore(
        candidate,
        context
      );
      return {
        candidate,
        score: Math.min(100, Math.max(0, Math.round(score))),
        reason: primaryReason,
        highlights
      };
    });

    // Sort candidates descending by score, then by rating, then by rate ascending
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.candidate.ratingAverage !== a.candidate.ratingAverage) {
        return b.candidate.ratingAverage - a.candidate.ratingAverage;
      }
      return a.candidate.baseRate - b.candidate.baseRate;
    });

    return scored;
  }

  /**
   * Transform scored candidates into standard ProviderRankingResult
   */
  public toProviderRankingResult(
    scored: ScoredCandidate[],
    providerName = 'deterministic_heuristic'
  ): ProviderRankingResult {
    const rankedVehicleIds: string[] = [];
    const reasons: Record<string, string> = {};
    const highlights: Record<string, string[]> = {};
    const confidenceScores: Record<string, number> = {};

    scored.forEach((item) => {
      rankedVehicleIds.push(item.candidate.id);
      reasons[item.candidate.id] = item.reason;
      highlights[item.candidate.id] = item.highlights;
      confidenceScores[item.candidate.id] = item.score;
    });

    return {
      rankedVehicleIds,
      reasons,
      highlights,
      confidenceScores,
      providerName
    };
  }

  /**
   * Compute normalized score (0-100) and identify grounded facts
   */
  private calculateCandidateScore(
    candidate: RecommendationCandidate,
    context: RecommendationContext
  ): { score: number; highlights: string[]; primaryReason: string } {
    const req = context.request;
    const userPrefs = context.userPreferences;
    const pastCats = context.userPastCategories || [];

    let totalScore = 0;
    const highlights: string[] = [];
    const reasonParts: string[] = [];

    // 1. Availability (Candidates reached this point only after passing TASK 07 availability)
    totalScore += 10;
    highlights.push('Available for dates');

    // 2. Category Match & Past Category Personalization (Max 25 pts)
    const targetCategory = req.category || (userPrefs?.preferredCategories && userPrefs.preferredCategories[0]);
    if (targetCategory && candidate.category === targetCategory) {
      totalScore += 25;
      highlights.push(`${candidate.category} Match`);
      reasonParts.push(`Matches your requested ${candidate.category.toLowerCase()} category.`);
    } else if (pastCats.includes(candidate.category)) {
      totalScore += 20;
      highlights.push('Past Favorite');
      reasonParts.push(`Recommended because you previously rented a ${candidate.category.toLowerCase()} with SkyBolt.`);
    } else {
      totalScore += 12; // Base category fit
    }

    // 3. Passenger & Capacity Fit (Max 20 pts)
    if (req.passengers && req.passengers > 0) {
      if (candidate.seats === req.passengers) {
        totalScore += 20;
        highlights.push(`Ideal for ${req.passengers}`);
        reasonParts.push(`Fits your ${req.passengers}-passenger requirement perfectly.`);
      } else if (candidate.seats > req.passengers) {
        const extraSeats = candidate.seats - req.passengers;
        totalScore += Math.max(12, 20 - extraSeats * 2);
        highlights.push(`${candidate.seats} Seats`);
        reasonParts.push(`Spacious with ${candidate.seats} seats for ${req.passengers} passengers.`);
      }
    } else if (userPrefs?.preferredSeatCount && candidate.seats === userPrefs.preferredSeatCount) {
      totalScore += 18;
      highlights.push(`${candidate.seats} Seats`);
      reasonParts.push(`Matches your preferred ${candidate.seats}-seat configuration.`);
    } else {
      totalScore += 15;
    }

    // 4. Budget & Price Fit (Max 20 pts)
    const maxBudget = req.budget || userPrefs?.preferredPriceRange?.max;
    if (maxBudget && maxBudget > 0) {
      if (candidate.baseRate <= maxBudget) {
        // Full score if safely within budget
        const savingsRatio = (maxBudget - candidate.baseRate) / maxBudget;
        totalScore += Math.min(20, 16 + Math.round(savingsRatio * 4));
        highlights.push(`Within Budget`);
        reasonParts.push(`Within your ₹${maxBudget.toLocaleString('en-IN')}/day budget at ₹${candidate.baseRate.toLocaleString('en-IN')}/day.`);
      } else if (candidate.baseRate <= maxBudget * 1.2) {
        // Minor penalty if slightly above budget
        totalScore += 10;
      } else {
        totalScore += 4;
      }
    } else {
      // General affordability curve
      totalScore += 15;
    }

    // 5. Verified Rating & Quality (Max 15 pts)
    if (candidate.ratingAverage > 0) {
      const ratingContribution = (candidate.ratingAverage / 5) * 12;
      const countBonus = Math.min(3, (candidate.ratingCount || 0) * 0.2);
      totalScore += Math.round(ratingContribution + countBonus);

      if (candidate.ratingAverage >= 4.5) {
        highlights.push(`★ ${candidate.ratingAverage.toFixed(1)} Verified`);
        if (candidate.ratingCount >= 5) {
          reasonParts.push(`Highly rated with ${candidate.ratingAverage.toFixed(1)}★ by ${candidate.ratingCount} verified renters.`);
        }
      }
    } else {
      totalScore += 8; // Fresh catalog item
    }

    // 6. Transmission & Fuel Preference (Max 10 pts)
    const reqTransmission = req.transmission || userPrefs?.preferredTransmission;
    if (reqTransmission) {
      if (candidate.transmission === reqTransmission) {
        totalScore += 5;
        highlights.push(candidate.transmission === 'AUTOMATIC' ? 'Automatic' : 'Manual');
        reasonParts.push(`Equipped with ${candidate.transmission.toLowerCase()} transmission.`);
      }
    } else {
      totalScore += 3;
    }

    const reqFuel = req.fuelType || userPrefs?.preferredFuelType;
    if (reqFuel) {
      if (candidate.fuelType.toUpperCase() === reqFuel.toUpperCase()) {
        totalScore += 5;
        highlights.push(candidate.fuelType);
      }
    } else {
      totalScore += 3;
    }

    // Compose primary explainable reason grounded in facts
    let primaryReason = reasonParts.slice(0, 3).join(' ');
    if (!primaryReason || primaryReason.trim().length === 0) {
      primaryReason = `Available for your dates and matches your travel criteria with ${candidate.seats} seats.`;
    }

    return {
      score: totalScore,
      highlights: highlights.slice(0, 4),
      primaryReason
    };
  }
}

export const deterministicScoringEngine = new DeterministicScoringEngine();
export default deterministicScoringEngine;
