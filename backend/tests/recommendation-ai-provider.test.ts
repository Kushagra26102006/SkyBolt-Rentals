import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';
import { recommendationService } from '../src/services/recommendation.service.js';
import { mockRecommendationProvider } from '../src/services/recommendation/mock-recommendation.provider.js';
import { OpenAIRecommendationProvider } from '../src/services/recommendation/openai-recommendation.provider.js';
import { GeminiRecommendationProvider } from '../src/services/recommendation/gemini-recommendation.provider.js';
import { deterministicScoringEngine } from '../src/services/recommendation/deterministic-scoring.engine.js';
import {
  IRecommendationProvider,
  RecommendationContext,
  ProviderRankingResult
} from '../src/services/recommendation/recommendation-provider.interface.js';
import { RecommendationCandidate } from '../src/types/recommendation.types.js';

describe('TASK 16: AI Provider Abstraction, Hallucination Discarding & Timeout Fallback', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    await VehicleModel.syncIndexes();
    await seedVehicles(true);
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  });

  describe('Provider Abstraction & Heuristic Engine', () => {
    it('should correctly rank candidates and produce grounded reasons via MockRecommendationProvider', async () => {
      const candidates: RecommendationCandidate[] = [
        {
          id: 'v1',
          vehicleCode: 'V1',
          brand: 'Hyundai',
          model: 'Creta',
          name: 'Creta SX',
          year: 2023,
          category: 'SUV',
          status: 'ACTIVE',
          fleetStatus: 'AVAILABLE',
          seats: 5,
          transmission: 'AUTOMATIC',
          fuelType: 'PETROL',
          baseRate: 3000,
          currency: 'INR',
          locationName: 'Ludhiana',
          features: ['Sunroof', 'Touchscreen'],
          ratingAverage: 4.8,
          ratingCount: 15
        },
        {
          id: 'v2',
          vehicleCode: 'V2',
          brand: 'Honda',
          model: 'Activa',
          name: 'Activa 6G',
          year: 2022,
          category: 'SCOOTER',
          status: 'ACTIVE',
          fleetStatus: 'AVAILABLE',
          seats: 2,
          transmission: 'AUTOMATIC',
          fuelType: 'PETROL',
          baseRate: 400,
          currency: 'INR',
          locationName: 'Ludhiana',
          features: ['Storage'],
          ratingAverage: 4.2,
          ratingCount: 8
        }
      ];

      const context: RecommendationContext = {
        request: {
          category: 'SUV',
          passengers: 5,
          budget: 3500
        }
      };

      const result = await mockRecommendationProvider.rankAndExplain(candidates, context);

      expect(result.rankedVehicleIds[0]).toBe('v1');
      expect(result.reasons['v1']).toMatch(/suv|5/i);
      expect(result.confidenceScores?.['v1']).toBeGreaterThan(result.confidenceScores?.['v2'] || 0);
    });
  });

  describe('Hallucination & Arbitrary ID Rejection', () => {
    it('should discard any hallucinated vehicle IDs returned by a provider', async () => {
      // Create a rogue provider that hallucinates nonexistent IDs
      const rogueProvider: IRecommendationProvider = {
        name: 'rogue_hallucinating_provider',
        async rankAndExplain(
          candidates: RecommendationCandidate[],
          _context: RecommendationContext
        ): Promise<ProviderRankingResult> {
          return {
            rankedVehicleIds: [
              'fake_id_99999999999999999999', // Hallucinated ID
              candidates[0]?.id || 'v1',      // Real ID
              'another_fake_id_123456789'     // Hallucinated ID
            ],
            reasons: {
              fake_id_99999999999999999999: 'This is a dream car that does not exist in DB',
              [candidates[0]?.id]: 'Valid candidate car',
              another_fake_id_123456789: 'Another phantom car'
            },
            highlights: {},
            providerName: 'rogue_hallucinating_provider'
          };
        }
      };

      // Spy on getProvider to return rogue provider
      const spy = vi.spyOn(recommendationService, 'getProvider').mockReturnValue(rogueProvider);

      const res = await recommendationService.getRecommendations({ category: 'SUV' });

      expect(res.recommendations.length).toBeGreaterThan(0);
      // All returned vehicles MUST exist in authoritative candidate set
      res.recommendations.forEach((rec) => {
        expect(rec.vehicle.id).not.toBe('fake_id_99999999999999999999');
        expect(rec.vehicle.id).not.toBe('another_fake_id_123456789');
      });

      spy.mockRestore();
    });
  });

  describe('Provider Failure & Timeout Fallback', () => {
    it('should fallback to deterministic heuristic ranking if AI provider throws an error', async () => {
      const failingProvider: IRecommendationProvider = {
        name: 'failing_provider',
        async rankAndExplain(): Promise<ProviderRankingResult> {
          throw new Error('Simulated upstream AI provider 500 Outage or Rate Limit');
        }
      };

      const spy = vi.spyOn(recommendationService, 'getProvider').mockReturnValue(failingProvider);

      // Call should succeed without throwing error
      const res = await recommendationService.getRecommendations({ category: 'CAR' });

      expect(res.source).toBe('DETERMINISTIC');
      expect(res.recommendations.length).toBeGreaterThan(0);
      expect(res.provider).toBe('deterministic_fallback');

      spy.mockRestore();
    });

    it('should fallback to deterministic heuristic ranking if AI provider times out', async () => {
      const timingOutProvider: IRecommendationProvider = {
        name: 'timing_out_provider',
        async rankAndExplain(): Promise<ProviderRankingResult> {
          const err = new Error('The operation was aborted due to timeout');
          err.name = 'AbortError';
          throw err;
        }
      };

      const spy = vi.spyOn(recommendationService, 'getProvider').mockReturnValue(timingOutProvider);

      const res = await recommendationService.getRecommendations({ category: 'CAR' });

      expect(res.source).toBe('DETERMINISTIC');
      expect(res.recommendations.length).toBeGreaterThan(0);

      spy.mockRestore();
    });
  });

  describe('OpenAIRecommendationProvider Unit Tests', () => {
    const sampleCandidates: RecommendationCandidate[] = [
      {
        id: 'cand-1',
        vehicleCode: 'C1',
        brand: 'Tata',
        model: 'Nexon EV',
        name: 'Nexon EV Empowered',
        year: 2024,
        category: 'EV',
        status: 'ACTIVE',
        fleetStatus: 'AVAILABLE',
        seats: 5,
        transmission: 'AUTOMATIC',
        fuelType: 'ELECTRIC',
        baseRate: 2500,
        currency: 'INR',
        locationName: 'Ludhiana',
        features: ['Fast Charging', 'Sunroof'],
        ratingAverage: 4.9,
        ratingCount: 22
      },
      {
        id: 'cand-2',
        vehicleCode: 'C2',
        brand: 'Maruti',
        model: 'Swift',
        name: 'Swift ZXi',
        year: 2023,
        category: 'HATCHBACK',
        status: 'ACTIVE',
        fleetStatus: 'AVAILABLE',
        seats: 5,
        transmission: 'MANUAL',
        fuelType: 'PETROL',
        baseRate: 1200,
        currency: 'INR',
        locationName: 'Ludhiana',
        features: ['Bluetooth'],
        ratingAverage: 4.5,
        ratingCount: 40
      }
    ];

    it('should parse valid OpenAI response, extract rankings and token usage, and filter phantom IDs', async () => {
      const provider = new OpenAIRecommendationProvider('test-api-key', 'gpt-4o-mini', 3000);

      const mockOpenAiPayload = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                rankings: [
                  {
                    vehicleId: 'cand-1',
                    reason: 'Eco-friendly electric vehicle with top 4.9 star rating.',
                    highlights: ['EV', 'Fast Charging'],
                    confidenceScore: 92
                  },
                  {
                    vehicleId: 'hallucinated-phantom-car-999',
                    reason: 'A car that does not exist in candidate list',
                    highlights: ['Phantom']
                  }
                ]
              })
            }
          }
        ],
        usage: {
          prompt_tokens: 150,
          completion_tokens: 65
        }
      };

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockOpenAiPayload
      } as any);

      try {
        const res = await provider.rankAndExplain(sampleCandidates, {
          request: { category: 'EV', passengers: 5 }
        });

        expect(res.rankedVehicleIds[0]).toBe('cand-1');
        expect(res.rankedVehicleIds).not.toContain('hallucinated-phantom-car-999');
        // Unranked candidate cand-2 should be safely appended
        expect(res.rankedVehicleIds).toContain('cand-2');
        expect(res.reasons['cand-1']).toContain('Eco-friendly');
        expect(res.rawTokenUsage?.promptTokens).toBe(150);
        expect(res.providerName).toBe('openai_recommendation_provider');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should throw when OpenAI API returns HTTP error', async () => {
      const provider = new OpenAIRecommendationProvider('test-api-key', 'gpt-4o-mini', 3000);

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded'
      } as any);

      try {
        await expect(
          provider.rankAndExplain(sampleCandidates, { request: {} })
        ).rejects.toThrow(/OpenAI HTTP 429/);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('GeminiRecommendationProvider Unit Tests', () => {
    const sampleCandidates: RecommendationCandidate[] = [
      {
        id: 'gem-1',
        vehicleCode: 'G1',
        brand: 'Mahindra',
        model: 'XUV700',
        name: 'XUV700 AX7',
        year: 2024,
        category: 'SUV',
        status: 'ACTIVE',
        fleetStatus: 'AVAILABLE',
        seats: 7,
        transmission: 'AUTOMATIC',
        fuelType: 'DIESEL',
        baseRate: 4500,
        currency: 'INR',
        locationName: 'Ludhiana',
        features: ['ADAS', 'Panoramic Sunroof'],
        ratingAverage: 4.9,
        ratingCount: 35
      }
    ];

    it('should parse valid Gemini response, extract rankings and filter hallucinated IDs', async () => {
      const provider = new GeminiRecommendationProvider('test-gemini-key', 'gemini-1.5-flash', 3000);

      const mockGeminiPayload = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    rankings: [
                      {
                        vehicleId: 'gem-1',
                        reason: 'Spacious 7-seater SUV with ADAS and top rating.',
                        highlights: ['7 Seats', 'ADAS'],
                        confidenceScore: 95
                      },
                      {
                        vehicleId: 'fake-ghost-id',
                        reason: 'Invented car ID',
                        highlights: ['Fake']
                      }
                    ]
                  })
                }
              ]
            }
          }
        ]
      };

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockGeminiPayload
      } as any);

      try {
        const res = await provider.rankAndExplain(sampleCandidates, {
          request: { category: 'SUV', passengers: 7 }
        });

        expect(res.rankedVehicleIds).toContain('gem-1');
        expect(res.rankedVehicleIds).not.toContain('fake-ghost-id');
        expect(res.reasons['gem-1']).toContain('Spacious 7-seater');
        expect(res.providerName).toBe('gemini_recommendation_provider');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should throw when Gemini API returns HTTP error', async () => {
      const provider = new GeminiRecommendationProvider('test-gemini-key', 'gemini-1.5-flash', 3000);

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable'
      } as any);

      try {
        await expect(
          provider.rankAndExplain(sampleCandidates, { request: {} })
        ).rejects.toThrow(/Gemini HTTP 503/);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
