import { z } from 'zod';
import {
  IRecommendationProvider,
  RecommendationContext,
  ProviderRankingResult
} from './recommendation-provider.interface.js';
import { RecommendationCandidate } from '../../types/recommendation.types.js';
import { config } from '../../config/env.config.js';

const geminiOutputSchema = z.object({
  rankings: z.array(
    z.object({
      vehicleId: z.string(),
      reason: z.string().min(1).transform((s) => s.slice(0, 300)),
      highlights: z.array(z.string().transform((s) => s.slice(0, 60))).default([]),
      confidenceScore: z.number().min(0).max(100).optional()
    })
  )
});

export class GeminiRecommendationProvider implements IRecommendationProvider {
  public readonly name = 'gemini_recommendation_provider';
  private apiKey: string;
  private model: string;
  private timeoutMs: number;

  constructor(apiKey?: string, model?: string, timeoutMs?: number) {
    this.apiKey = apiKey || config.recommendations.apiKey || process.env.GEMINI_API_KEY || '';
    const configuredModel = model || config.recommendations.model || 'gemini-3.5-flash-lite';
    this.model =
      configuredModel === 'gemini-1.5-flash' ||
      configuredModel === 'gemini-2.5-flash' ||
      configuredModel === 'gemini-flash-latest'
        ? 'gemini-3.5-flash-lite'
        : configuredModel;
    this.timeoutMs = timeoutMs || config.recommendations.timeoutMs;
  }

  public async rankAndExplain(
    candidates: RecommendationCandidate[],
    context: RecommendationContext
  ): Promise<ProviderRankingResult> {
    if (!this.apiKey) {
      throw new Error('[SkyBolt AI] Gemini API key is not configured.');
    }

    if (!candidates || candidates.length === 0) {
      return {
        rankedVehicleIds: [],
        reasons: {},
        highlights: {},
        confidenceScores: {},
        providerName: this.name
      };
    }

    const validCandidateIds = new Set(candidates.map((c) => c.id));
    const compactCandidates = candidates.map((c) => ({
      id: c.id,
      brand: c.brand,
      model: c.model,
      name: c.name,
      category: c.category,
      seats: c.seats,
      transmission: c.transmission,
      fuelType: c.fuelType,
      baseRatePerDay: c.baseRate,
      ratingAverage: c.ratingAverage,
      ratingCount: c.ratingCount
    }));

    const sanitizedQuery = (context.request.query || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300);

    const promptText = `Rank the provided candidate vehicles for SkyBolt Rentals and provide grounded explanations.
Output strictly valid JSON with format:
{"rankings": [{"vehicleId": "...", "reason": "...", "highlights": ["..."], "confidenceScore": 85}]}
Rules:
1. ONLY recommend vehicles from available candidates list. Never invent IDs.
2. Ground all reasons in facts (seats, category, budget, rating).

Customer Request:
${JSON.stringify({
  passengers: context.request.passengers,
  budget: context.request.budget,
  category: context.request.category,
  transmission: context.request.transmission,
  fuelType: context.request.fuelType,
  query: sanitizedQuery || undefined,
  candidates: compactCandidates
})}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Gemini HTTP ${response.status}: ${await response.text()}`);
      }

      const rawJson = (await response.json()) as any;
      const text = rawJson.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Gemini returned empty response text.');
      }

      const parsed = geminiOutputSchema.parse(JSON.parse(text));
      const rankedVehicleIds: string[] = [];
      const reasons: Record<string, string> = {};
      const highlights: Record<string, string[]> = {};
      const confidenceScores: Record<string, number> = {};

      parsed.rankings.forEach((r) => {
        if (validCandidateIds.has(r.vehicleId) && !rankedVehicleIds.includes(r.vehicleId)) {
          rankedVehicleIds.push(r.vehicleId);
          reasons[r.vehicleId] = r.reason;
          highlights[r.vehicleId] = r.highlights.slice(0, 4);
          if (r.confidenceScore !== undefined) {
            confidenceScores[r.vehicleId] = r.confidenceScore;
          }
        }
      });

      candidates.forEach((c) => {
        if (!rankedVehicleIds.includes(c.id)) {
          rankedVehicleIds.push(c.id);
          reasons[c.id] = `Available for your travel dates with ${c.seats} seats.`;
          highlights[c.id] = ['Available'];
          confidenceScores[c.id] = 50;
        }
      });

      return {
        rankedVehicleIds,
        reasons,
        highlights,
        confidenceScores,
        providerName: this.name
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const geminiRecommendationProvider = new GeminiRecommendationProvider();
export default geminiRecommendationProvider;
