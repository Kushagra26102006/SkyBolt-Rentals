import { z } from 'zod';
import {
  IRecommendationProvider,
  RecommendationContext,
  ProviderRankingResult
} from './recommendation-provider.interface.js';
import { RecommendationCandidate } from '../../types/recommendation.types.js';
import { config } from '../../config/env.config.js';

const openAiOutputSchema = z.object({
  rankings: z.array(
    z.object({
      vehicleId: z.string(),
      reason: z.string().min(5).max(300),
      highlights: z.array(z.string().max(40)).default([]),
      confidenceScore: z.number().min(0).max(100).optional()
    })
  )
});

export class OpenAIRecommendationProvider implements IRecommendationProvider {
  public readonly name = 'openai_recommendation_provider';
  private apiKey: string;
  private model: string;
  private timeoutMs: number;

  constructor(apiKey?: string, model?: string, timeoutMs?: number) {
    this.apiKey = apiKey || config.recommendations.apiKey;
    this.model = model || config.recommendations.model || 'gpt-4o-mini';
    this.timeoutMs = timeoutMs || config.recommendations.timeoutMs;
  }

  public async rankAndExplain(
    candidates: RecommendationCandidate[],
    context: RecommendationContext
  ): Promise<ProviderRankingResult> {
    if (!this.apiKey) {
      throw new Error('[SkyBolt AI] OpenAI API key is not configured.');
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

    // 1. Build sanitized, privacy-safe candidate payload (Minimal bounded data only)
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
      ratingCount: c.ratingCount,
      features: c.features.slice(0, 5)
    }));

    // 2. Data boundary: sanitize user query (prompt injection protection)
    const sanitizedQuery = (context.request.query || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300);

    const systemPrompt = `You are a vehicle recommendation assistant for SkyBolt Rentals.
Your role is to rank the candidate vehicles provided in the user message based on customer requirements and generate a short, grounded explanation for each recommendation.
CRITICAL SAFETY RULES:
1. You may ONLY recommend vehicles from the provided candidate list. Never invent or introduce external vehicle IDs.
2. Explanations must be grounded strictly in facts from the candidate data (e.g. seat count, transmission, verified rating, base rate).
3. Do not assume or promise anything not in the candidate data.
4. Output MUST be valid JSON adhering exactly to the specified schema:
{"rankings": [{"vehicleId": "...", "reason": "...", "highlights": ["...", "..."], "confidenceScore": 90}]}`;

    const userPromptPayload = {
      customerRequirements: {
        passengers: context.request.passengers || null,
        luggageCount: context.request.luggageCount || null,
        budgetPerDay: context.request.budget || null,
        preferredCategory: context.request.category || null,
        preferredTransmission: context.request.transmission || null,
        preferredFuelType: context.request.fuelType || null,
        userTripDescription: sanitizedQuery || null
      },
      userPersonalization: {
        pastBookedCategories: context.userPastCategories || [],
        userPreferences: context.userPreferences || null
      },
      availableCandidates: compactCandidates
    };

    // 3. Setup timeout with AbortController
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(userPromptPayload) }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 1000
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
      }

      const rawJson = (await response.json()) as any;
      const content = rawJson.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI returned empty message content.');
      }

      // 4. Validate output schema
      const parsed = openAiOutputSchema.parse(JSON.parse(content));

      // 5. Authoritative validation: Discard any unknown / hallucinated IDs
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

      // Include any remaining candidate IDs not ranked by AI at the bottom
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
        providerName: this.name,
        rawTokenUsage: {
          promptTokens: rawJson.usage?.prompt_tokens,
          completionTokens: rawJson.usage?.completion_tokens
        }
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const openAIRecommendationProvider = new OpenAIRecommendationProvider();
export default openAIRecommendationProvider;
