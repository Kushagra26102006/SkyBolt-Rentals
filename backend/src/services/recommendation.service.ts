import crypto from 'crypto';
import { Types } from 'mongoose';
import { config } from '../config/env.config.js';
import { VehicleModel, IVehicleDoc } from '../models/vehicle.model.js';
import { BookingModel } from '../models/booking.model.js';
import { ReviewModel } from '../models/review.model.js';
import { UserPreferenceModel } from '../models/user-preference.model.js';
import { RecommendationEventModel } from '../models/recommendation-event.model.js';
import { availabilityService } from './availability.service.js';
import { pricingService } from '../pricing/pricing.service.js';
import { cacheService } from './cache.service.js';
import { escapeRegex } from '../utils/regex.util.js';
import {
  RecommendationRequestDTO,
  RecommendationResponseDTO,
  VehicleRecommendationDTO,
  RecommendationCandidate,
  RecommendationSource,
  UserPreferencesDTO,
  RecommendationEventDTO,
  RecommendationFeedbackDTO,
  RecommendationMetricsDTO
} from '../types/recommendation.types.js';
import {
  IRecommendationProvider,
  RecommendationContext,
  ProviderRankingResult
} from './recommendation/recommendation-provider.interface.js';
import { mockRecommendationProvider } from './recommendation/mock-recommendation.provider.js';
import { openAIRecommendationProvider } from './recommendation/openai-recommendation.provider.js';
import { geminiRecommendationProvider } from './recommendation/gemini-recommendation.provider.js';
import { deterministicScoringEngine } from './recommendation/deterministic-scoring.engine.js';

export class RecommendationService {
  // Operational in-memory metric counters
  private metrics = {
    totalRequests: 0,
    aiSuccessCount: 0,
    aiFallbackCount: 0,
    cacheHitCount: 0,
    cacheMissCount: 0,
    totalLatencyMs: 0,
    providerErrorCount: 0
  };

  /**
   * Determine active recommendation provider from config or override
   */
  public getProvider(overrideProviderName?: string): IRecommendationProvider {
    if (process.env.NODE_ENV === 'test' && !overrideProviderName) {
      return mockRecommendationProvider;
    }
    const providerName = overrideProviderName || config.recommendations.provider;
    switch (providerName) {
      case 'openai':
        return openAIRecommendationProvider;
      case 'gemini':
        return geminiRecommendationProvider;
      case 'mock':
      default:
        return mockRecommendationProvider;
    }
  }

  /**
   * Main recommendation pipeline:
   * 1. Check Redis cache
   * 2. Authoritative MongoDB candidate retrieval (Hard constraints)
   * 3. TASK 07 availability filtering
   * 4. User history / preferences retrieval
   * 5. AI / Deterministic ranking & grounded reasoning
   * 6. Discard unknown / hallucinated IDs
   * 7. TASK 09 authoritative pricing quotes
   * 8. Cache response & record metrics
   */
  public async getRecommendations(
    req: RecommendationRequestDTO,
    userId?: string
  ): Promise<RecommendationResponseDTO> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    // 1. Process dates (Default to 24h interval if unspecified for live availability and pricing quotes)
    const { pickupDate, returnDate } = this.resolveDates(req.pickupAt, req.returnAt);

    // 2. Parse natural language query to enhance structured request if provided
    const enrichedReq = this.enrichRequestWithNlp(req);

    // 3. Cache-Aside Lookup (User-isolated cache keys)
    const cacheKey = this.generateCacheKey(enrichedReq, userId);
    const cachedResponse = await cacheService.get<RecommendationResponseDTO>(cacheKey);
    if (cachedResponse) {
      this.metrics.cacheHitCount++;
      return {
        ...cachedResponse,
        executionTimeMs: Date.now() - startTime
      };
    }
    this.metrics.cacheMissCount++;

    // 4. Candidate Generation (Authoritative MongoDB Query with Hard Constraints)
    const mongoCandidates = await this.queryAuthoritativeCandidates(enrichedReq);

    if (mongoCandidates.length === 0) {
      const emptyResponse: RecommendationResponseDTO = {
        recommendations: [],
        generatedAt: new Date().toISOString(),
        source: 'DETERMINISTIC',
        candidateCount: 0,
        executionTimeMs: Date.now() - startTime,
        provider: 'none'
      };
      return emptyResponse;
    }

    // 5. TASK 07 Authoritative Availability Verification
    const candidateIds = mongoCandidates.map((doc) => doc._id.toString());
    const availableIds = await availabilityService.getAvailableVehicleIds(
      pickupDate,
      returnDate,
      candidateIds
    );

    const availableSet = new Set(availableIds);
    const availableDocs = mongoCandidates.filter((doc) => availableSet.has(doc._id.toString()));

    if (availableDocs.length === 0) {
      return {
        recommendations: [],
        generatedAt: new Date().toISOString(),
        source: 'DETERMINISTIC',
        candidateCount: 0,
        executionTimeMs: Date.now() - startTime,
        provider: 'none'
      };
    }

    // 6. Gather User Personalization Context (Past bookings, reviews, saved preferences)
    const context = await this.buildRecommendationContext(enrichedReq, userId);

    // 7. Map to compact candidate DTOs for AI layer
    const candidateDTOs: RecommendationCandidate[] = availableDocs.map((doc) => ({
      id: doc._id.toString(),
      vehicleCode: doc.vehicleCode,
      brand: doc.brand,
      model: doc.model,
      name: doc.name,
      variant: doc.variant,
      year: doc.year,
      category: doc.category,
      status: doc.status,
      fleetStatus: doc.fleetStatus || 'AVAILABLE',
      seats: doc.specifications.seats,
      doors: doc.specifications.doors,
      transmission: doc.specifications.transmission,
      fuelType: doc.specifications.fuelType,
      luggageCapacity: doc.specifications.luggageCapacity,
      baseRate: doc.rental.baseRate,
      currency: doc.rental.currency,
      locationName: doc.location.name,
      locationCity: doc.location.city,
      features: doc.features || [],
      ratingAverage: doc.rating?.average || 0,
      ratingCount: doc.rating?.count || 0,
      imageUrl: doc.images?.[0]?.url
    }));

    // 8. AI Ranking with Deterministic Fallback
    let rankingResult: ProviderRankingResult;
    let source: RecommendationSource = 'AI';
    const provider = this.getProvider();

    try {
      if (config.recommendations.provider === 'disabled') {
        throw new Error('AI recommendation provider is explicitly disabled by configuration.');
      }
      rankingResult = await provider.rankAndExplain(candidateDTOs, context);
      this.metrics.aiSuccessCount++;
    } catch (err: any) {
      // Fallback to pure deterministic heuristic engine
      this.metrics.aiFallbackCount++;
      this.metrics.providerErrorCount++;
      source = 'DETERMINISTIC';
      if (!config.isTest) {
        console.warn(`[SkyBolt AI] Recommendation provider "${provider.name}" failed: ${err?.message}. Falling back to deterministic scoring.`);
      }
      const scored = deterministicScoringEngine.scoreAndRank(candidateDTOs, context);
      rankingResult = deterministicScoringEngine.toProviderRankingResult(scored, 'deterministic_fallback');
    }

    // 9. CRITICAL SAFETY RULE: Filter against Authoritative Candidates
    // Discard any vehicle ID returned by AI that is not in availableSet
    const docMap = new Map<string, IVehicleDoc>();
    availableDocs.forEach((doc) => docMap.set(doc._id.toString(), doc));

    const finalRankedIds = rankingResult.rankedVehicleIds.filter((id) => docMap.has(id));

    // Limit to requested limit or max 12 recommendations
    const maxResults = Math.min(enrichedReq.limit || 8, 12);
    const topIds = finalRankedIds.slice(0, maxResults);

    // 10. TASK 09 Authoritative Pricing Calculation for each recommended vehicle
    const recommendations: VehicleRecommendationDTO[] = await Promise.all(
      topIds.map(async (vehicleId) => {
        const doc = docMap.get(vehicleId)!;
        const pricingResult = await pricingService.calculatePrice(doc, pickupDate, returnDate);

        return {
          vehicle: doc.toSafeDTO(),
          reason: rankingResult.reasons[vehicleId] || `Available for your travel dates with ${doc.specifications.seats} seats.`,
          highlights: rankingResult.highlights[vehicleId] || ['Available'],
          score: rankingResult.confidenceScores?.[vehicleId] ?? 80,
          availability: {
            available: true,
            pickupAt: pickupDate.toISOString(),
            returnAt: returnDate.toISOString()
          },
          pricing: pricingResult.quote
        };
      })
    );

    const executionTimeMs = Date.now() - startTime;
    this.metrics.totalLatencyMs += executionTimeMs;

    const responseDTO: RecommendationResponseDTO = {
      recommendations,
      generatedAt: new Date().toISOString(),
      source,
      candidateCount: availableDocs.length,
      executionTimeMs,
      provider: rankingResult.providerName
    };

    // 11. Cache the response in Redis (Short TTL: 180s)
    await cacheService.set(cacheKey, responseDTO, config.recommendations.cacheTtlSeconds);

    return responseDTO;
  }

  /**
   * Parse natural language query to extract structured filters (Prompt Injection Safe)
   */
  public enrichRequestWithNlp(req: RecommendationRequestDTO): RecommendationRequestDTO {
    if (!req.query || typeof req.query !== 'string' || req.query.trim().length === 0) {
      return req;
    }

    const text = req.query.toLowerCase();
    const enriched = { ...req };

    // Passenger count extraction (e.g. "5 people", "for 4 passengers", "family of 6")
    if (!enriched.passengers) {
      const passMatch = text.match(/(\d+)\s*(?:people|persons|passengers|pax|seats)/);
      if (passMatch && passMatch[1]) {
        const count = parseInt(passMatch[1], 10);
        if (count > 0 && count <= 12) enriched.passengers = count;
      } else if (text.includes('couple')) {
        enriched.passengers = 2;
      } else if (text.includes('solo')) {
        enriched.passengers = 1;
      } else if (text.includes('family')) {
        enriched.passengers = 4;
      }
    }

    // Category extraction
    if (!enriched.category) {
      if (text.includes('suv')) enriched.category = 'SUV';
      else if (text.includes('sedan')) enriched.category = 'SEDAN';
      else if (text.includes('hatchback')) enriched.category = 'HATCHBACK';
      else if (text.includes('bike') || text.includes('motorcycle')) enriched.category = 'BIKE';
      else if (text.includes('scooter') || text.includes('activa') || text.includes('vespa')) enriched.category = 'SCOOTER';
      else if (text.includes('ev') || text.includes('electric')) enriched.category = 'EV';
      else if (text.includes('luxury') || text.includes('premium')) enriched.category = 'LUXURY';
    }

    // Transmission extraction
    if (!enriched.transmission) {
      if (text.includes('automatic') || text.includes('auto')) enriched.transmission = 'AUTOMATIC';
      else if (text.includes('manual') || text.includes('gear')) enriched.transmission = 'MANUAL';
    }

    // Fuel type extraction
    if (!enriched.fuelType) {
      if (text.includes('electric') || text.includes('ev')) enriched.fuelType = 'ELECTRIC';
      else if (text.includes('diesel')) enriched.fuelType = 'DIESEL';
      else if (text.includes('petrol')) enriched.fuelType = 'PETROL';
      else if (text.includes('hybrid')) enriched.fuelType = 'HYBRID';
    }

    // Budget extraction (e.g. "under 3000", "budget 4000", "less than 2500")
    if (!enriched.budget) {
      const budgetMatch = text.match(/(?:under|below|less than|budget|within|max)\s*(?:₹|rs\.?|inr)?\s*(\d+)/);
      if (budgetMatch && budgetMatch[1]) {
        const val = parseInt(budgetMatch[1], 10);
        if (val >= 500 && val <= 100000) enriched.budget = val;
      }
    }

    return enriched;
  }

  /**
   * Query candidates from MongoDB using authoritative business rules and hard constraints
   */
  private async queryAuthoritativeCandidates(req: RecommendationRequestDTO): Promise<IVehicleDoc[]> {
    const filter: Record<string, any> = {
      isDeleted: false,
      status: 'ACTIVE',
      fleetStatus: { $in: ['AVAILABLE', null] }
    };

    // Hard constraint: Capacity (Seats)
    if (req.passengers && req.passengers > 0) {
      filter['specifications.seats'] = { $gte: req.passengers };
    }

    // Category filter
    if (req.category) {
      filter.category = req.category;
    }

    // Transmission filter
    if (req.transmission) {
      filter['specifications.transmission'] = req.transmission;
    }

    // Fuel filter
    if (req.fuelType) {
      filter['specifications.fuelType'] = req.fuelType;
    }

    // Location filter if specified
    if (req.pickupLocation && req.pickupLocation.trim().length > 0 && req.pickupLocation !== 'all') {
      filter['location.name'] = { $regex: new RegExp(escapeRegex(req.pickupLocation.trim()), 'i') };
    }

    // Bounded candidate count (Never fetch entire collection)
    const limit = config.recommendations.maxCandidates || 25;

    let candidates = await VehicleModel.find(filter)
      .sort({ 'rating.average': -1, 'rental.baseRate': 1 })
      .limit(limit)
      .exec();

    // Soft fallback if too few candidates with strict transmission/fuel
    if (candidates.length < 3 && (req.transmission || req.fuelType)) {
      const relaxedFilter = { ...filter };
      delete relaxedFilter['specifications.transmission'];
      delete relaxedFilter['specifications.fuelType'];
      candidates = await VehicleModel.find(relaxedFilter)
        .sort({ 'rating.average': -1, 'rental.baseRate': 1 })
        .limit(limit)
        .exec();
    }

    return candidates;
  }

  /**
   * Construct safe context for AI ranker (No PII)
   */
  private async buildRecommendationContext(
    req: RecommendationRequestDTO,
    userId?: string
  ): Promise<RecommendationContext> {
    const context: RecommendationContext = { request: req };

    if (!userId || !Types.ObjectId.isValid(userId)) {
      return context;
    }

    try {
      const [preferences, pastBookings, reviewCount] = await Promise.all([
        UserPreferenceModel.findOne({ userId: new Types.ObjectId(userId) }).lean(),
        BookingModel.find({ userId: new Types.ObjectId(userId), status: 'COMPLETED' })
          .sort({ createdAt: -1 })
          .limit(5)
          .select('vehicleSnapshot.category vehicleId createdAt')
          .lean(),
        ReviewModel.countDocuments({
          userId: new Types.ObjectId(userId),
          status: 'PUBLISHED'
        })
      ]);

      if (preferences) {
        context.userPreferences = {
          preferredCategories: preferences.preferredCategories,
          preferredTransmission: preferences.preferredTransmission || undefined,
          preferredFuelType: preferences.preferredFuelType || undefined,
          preferredSeatCount: preferences.preferredSeatCount || undefined,
          preferredPriceRange: preferences.preferredPriceRange || undefined,
          preferredFeatures: preferences.preferredFeatures || []
        };
      }

      if (pastBookings && pastBookings.length > 0) {
        context.userBookingHistoryCount = pastBookings.length;
        const pastCats = new Set<string>();
        pastBookings.forEach((b: any) => {
          if (b.vehicleSnapshot?.category) {
            pastCats.add(b.vehicleSnapshot.category);
          }
        });
        context.userPastCategories = Array.from(pastCats);
      }

      context.userVerifiedReviewsCount = reviewCount;
    } catch {
      // Non-blocking: continue without user personalization on DB error
    }

    return context;
  }

  /**
   * Generate privacy-conscious Redis cache key
   */
  private generateCacheKey(req: RecommendationRequestDTO, userId?: string): string {
    const keyParts = {
      pickupAt: req.pickupAt || 'default',
      returnAt: req.returnAt || 'default',
      passengers: req.passengers || 0,
      budget: req.budget || 0,
      category: req.category || 'any',
      transmission: req.transmission || 'any',
      fuelType: req.fuelType || 'any',
      location: req.pickupLocation || 'any',
      query: req.query || ''
    };

    const reqHash = crypto.createHash('sha256').update(JSON.stringify(keyParts)).digest('hex').slice(0, 16);
    const userHash = userId ? crypto.createHash('sha256').update(userId).digest('hex').slice(0, 12) : 'anon';

    return `rec:${userHash}:${reqHash}`;
  }

  /**
   * Resolve and validate rental interval
   */
  private resolveDates(pickupAtStr?: string, returnAtStr?: string): { pickupDate: Date; returnDate: Date } {
    let pickupDate: Date;
    let returnDate: Date;

    if (pickupAtStr && returnAtStr) {
      pickupDate = new Date(pickupAtStr);
      returnDate = new Date(returnAtStr);

      if (isNaN(pickupDate.getTime()) || isNaN(returnDate.getTime()) || pickupDate >= returnDate) {
        pickupDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        returnDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
      }
    } else {
      // Default 24h interval starting tomorrow
      pickupDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      returnDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
    }

    return { pickupDate, returnDate };
  }

  /**
   * User Preferences Management (CRUD)
   */
  public async getUserPreferences(userId: string): Promise<UserPreferencesDTO | null> {
    const doc = await UserPreferenceModel.findOne({ userId: new Types.ObjectId(userId) });
    return doc ? doc.toDTO() : null;
  }

  public async saveUserPreferences(
    userId: string,
    prefs: Partial<UserPreferencesDTO>
  ): Promise<UserPreferencesDTO> {
    const updated = await UserPreferenceModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          preferredCategories: prefs.preferredCategories || [],
          preferredTransmission: prefs.preferredTransmission || null,
          preferredFuelType: prefs.preferredFuelType || '',
          preferredSeatCount: prefs.preferredSeatCount || null,
          preferredPriceRange: prefs.preferredPriceRange || null,
          preferredFeatures: prefs.preferredFeatures || [],
          preferredPickupLocations: prefs.preferredPickupLocations || []
        }
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    // Invalidate user recommendation cache
    const userHash = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 12);
    await cacheService.delByPattern(`*rec:${userHash}:*`);

    return updated.toDTO();
  }

  public async clearUserPreferences(userId: string): Promise<boolean> {
    await UserPreferenceModel.deleteOne({ userId: new Types.ObjectId(userId) });
    const userHash = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 12);
    await cacheService.delByPattern(`*rec:${userHash}:*`);
    return true;
  }

  /**
   * Record Behavioral Event (Data minimized)
   */
  public async recordEvent(event: RecommendationEventDTO): Promise<void> {
    try {
      await RecommendationEventModel.create({
        userId: event.userId ? new Types.ObjectId(event.userId) : null,
        sessionId: event.sessionId || '',
        vehicleId: event.vehicleId ? new Types.ObjectId(event.vehicleId) : null,
        eventType: event.eventType,
        metadata: event.metadata || {}
      });
    } catch {
      // Non-blocking for high throughput
    }
  }

  /**
   * Record User Feedback
   */
  public async recordFeedback(feedback: RecommendationFeedbackDTO): Promise<void> {
    try {
      await RecommendationEventModel.create({
        userId: feedback.userId ? new Types.ObjectId(feedback.userId) : null,
        vehicleId: feedback.vehicleId ? new Types.ObjectId(feedback.vehicleId) : null,
        eventType: 'RECOMMENDATION_CLICKED',
        metadata: {
          recommendationId: feedback.recommendationId,
          helpful: feedback.helpful,
          feedback: feedback.feedback ? feedback.feedback.slice(0, 500) : undefined
        }
      });
    } catch {
      // Non-blocking
    }
  }

  /**
   * Operational Metrics for Admin Monitoring
   */
  public async getOperationalMetrics(): Promise<RecommendationMetricsDTO> {
    const recentEventsCount = await RecommendationEventModel.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }).catch(() => 0);

    const avgLatency =
      this.metrics.totalRequests > 0
        ? Math.round(this.metrics.totalLatencyMs / this.metrics.totalRequests)
        : 0;

    return {
      totalRequests: this.metrics.totalRequests,
      aiSuccessCount: this.metrics.aiSuccessCount,
      aiFallbackCount: this.metrics.aiFallbackCount,
      cacheHitCount: this.metrics.cacheHitCount,
      cacheMissCount: this.metrics.cacheMissCount,
      averageLatencyMs: avgLatency,
      providerErrorCount: this.metrics.providerErrorCount,
      activeProvider: config.recommendations.provider,
      recentEventsCount
    };
  }
}

export const recommendationService = new RecommendationService();
export default recommendationService;
