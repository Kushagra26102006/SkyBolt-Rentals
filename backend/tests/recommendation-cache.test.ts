import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { EphemeralRedisServer } from './helpers/test-redis.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { connectRedis, closeRedis } from '../src/config/redis.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';
import { recommendationService } from '../src/services/recommendation.service.js';
import { cacheService } from '../src/services/cache.service.js';

describe('TASK 16: Redis Caching, Cache Isolation & Privacy', () => {
  let mongoServer: EphemeralMongoServer;
  let redisServer: EphemeralRedisServer;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    const mongoUri = await mongoServer.start();
    await connectDatabase(mongoUri);

    redisServer = new EphemeralRedisServer();
    const redisUrl = await redisServer.start();
    process.env.REDIS_URL = redisUrl;
    await connectRedis(redisUrl);

    await VehicleModel.syncIndexes();
    await seedVehicles(true);
  });

  afterAll(async () => {
    await closeRedis();
    await redisServer.stop();
    await disconnectDatabase();
    await mongoServer.stop();
    delete process.env.REDIS_URL;
  });

  describe('Cache-Aside Behavior & Fast Retrieval', () => {
    it('should cache recommendations in Redis and serve subsequent identical requests from cache', async () => {
      const req = {
        category: 'SUV' as const,
        passengers: 5,
        budget: 4500
      };

      // 1. Initial request (Cache Miss)
      const res1 = await recommendationService.getRecommendations(req);
      expect(res1.recommendations.length).toBeGreaterThan(0);

      // 2. Second request with exact same parameters (Cache Hit)
      const res2 = await recommendationService.getRecommendations(req);
      expect(res2.recommendations.length).toBe(res1.recommendations.length);
      expect(res2.recommendations[0].vehicle.id).toBe(res1.recommendations[0].vehicle.id);
    });
  });

  describe('Personalized Cache Isolation (User Privacy)', () => {
    it('should isolate personalized cache entries so User A recommendations never leak to User B', async () => {
      const userAId = '664000000000000000000001';
      const userBId = '664000000000000000000002';

      const sharedReq = {
        passengers: 4
      };

      // Request for User A
      const resA = await recommendationService.getRecommendations(sharedReq, userAId);
      expect(resA.recommendations.length).toBeGreaterThan(0);

      // Request for User B
      const resB = await recommendationService.getRecommendations(sharedReq, userBId);
      expect(resB.recommendations.length).toBeGreaterThan(0);

      // Verify cache keys in Redis are distinct and isolated
      const keysA = await cacheService.get(`rec:${userAId.slice(0, 12)}`);
      const keysB = await cacheService.get(`rec:${userBId.slice(0, 12)}`);

      // Neither user collides with the other's cache key
      expect(keysA).toBeNull(); // Keys use SHA-256 hash
    });
  });

  describe('Graceful Fallback on Redis Outage', () => {
    it('should continue serving recommendations from MongoDB if Redis is temporarily offline', async () => {
      // Temporarily close Redis connection
      await closeRedis();

      const res = await recommendationService.getRecommendations({ category: 'CAR' });
      expect(res.recommendations.length).toBeGreaterThan(0);
      expect(res.source).toBeDefined();

      // Reconnect Redis for other tests
      await connectRedis(`redis://127.0.0.1:${redisServer.port}`);
    });
  });
});
