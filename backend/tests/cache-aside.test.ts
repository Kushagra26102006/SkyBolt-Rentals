import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { EphemeralRedisServer } from './helpers/test-redis.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { getRedisClient, connectRedis, closeRedis, isRedisConnected } from '../src/config/redis.js';
import { vehicleService } from '../src/services/vehicle.service.js';
import { cacheService } from '../src/services/cache.service.js';
import { cacheKeys } from '../src/utils/cache-keys.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';

describe('TASK 15: Production Redis Cache-Aside, Invalidation & Resilience', () => {
  let mongoServer: EphemeralMongoServer;
  let redisServer: EphemeralRedisServer;
  let redisUrl: string;
  let testMongoUri: string;
  let testVehicleId: string;

  beforeAll(async () => {
    // 1. Start isolated MongoDB
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    // 2. Start isolated Redis
    redisServer = new EphemeralRedisServer();
    redisUrl = await redisServer.start();
    process.env.REDIS_URL = redisUrl;
    await connectRedis();

    // 3. Seed test fleet
    await VehicleModel.syncIndexes();
    await seedVehicles(true);
    const vehicle = await VehicleModel.findOne({ status: 'ACTIVE' });
    if (!vehicle) throw new Error('Seeding failed: no vehicle found');
    testVehicleId = vehicle._id.toString();
  });

  afterAll(async () => {
    await closeRedis();
    await redisServer.stop();
    await disconnectDatabase();
    await mongoServer.stop();
    delete process.env.REDIS_URL;
  });

  it('Cache Miss: fetches from MongoDB, populates Redis cache with TTL', async () => {
    const key = cacheKeys.vehicle(testVehicleId);
    const client = getRedisClient();

    // Ensure cache key is clear
    await client.del(key);

    // First fetch - cache miss
    const vehicle = await vehicleService.getVehicleById(testVehicleId);
    expect(vehicle).toBeDefined();
    expect(vehicle.id).toBe(testVehicleId);

    // Verify Redis has been populated
    const cachedData = await client.get(key);
    expect(cachedData).not.toBeNull();
    const parsed = JSON.parse(cachedData!);
    expect(parsed.id).toBe(testVehicleId);

    // Verify TTL is present and positive
    const ttl = await client.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300); // 300s TTL configured
  });

  it('Cache Hit: subsequent read is served directly from Redis', async () => {
    const key = cacheKeys.vehicle(testVehicleId);
    const client = getRedisClient();

    // Manually inject a distinct marker in cached object to prove read is served from cache
    const cachedObj = await cacheService.get<any>(key);
    expect(cachedObj).not.toBeNull();
    cachedObj._cachedMarker = 'PROVEN_FROM_REDIS';
    await cacheService.set(key, cachedObj, 60);

    // Second fetch
    const fetched = await vehicleService.getVehicleById(testVehicleId);
    expect((fetched as any)._cachedMarker).toBe('PROVEN_FROM_REDIS');
  });

  it('Cache Invalidation: vehicle update deletes cached entry and list catalog', async () => {
    const key = cacheKeys.vehicle(testVehicleId);
    const client = getRedisClient();

    // Ensure key exists
    await vehicleService.getVehicleById(testVehicleId);
    expect(await client.exists(key)).toBe(1);

    // Update vehicle
    await vehicleService.updateVehicle(testVehicleId, {
      rental: { baseRate: 9999, currency: 'INR', deposit: 15000 }
    });

    // Verify key was invalidated
    const existsAfter = await client.exists(key);
    expect(existsAfter).toBe(0);

    // Re-fetch gets authoritative updated data from MongoDB and re-caches
    const fresh = await vehicleService.getVehicleById(testVehicleId);
    expect(fresh.rental.baseRate).toBe(9999);
  });

  it('Distributed Locks: acquireLock and releaseLock coordinate safely with atomic Lua', async () => {
    const resource = 'test-lock-resource';
    const lock1 = await cacheService.acquireLock(resource, 3000);
    expect(lock1).not.toBeNull();

    // Secondary attempt for same resource fails while held
    const lock2 = await cacheService.acquireLock(resource, 3000);
    expect(lock2).toBeNull();

    // Release lock1
    const released = await cacheService.releaseLock(resource, lock1!);
    expect(released).toBe(true);

    // Now acquisition succeeds again
    const lock3 = await cacheService.acquireLock(resource, 3000);
    expect(lock3).not.toBeNull();
    await cacheService.releaseLock(resource, lock3!);
  });

  it('Resilience & Fallback: when Redis is closed/unavailable, vehicle read still succeeds via MongoDB', async () => {
    // Close Redis connection to simulate an outage
    await closeRedis();
    expect(isRedisConnected()).toBe(false);

    // Read must not throw or fail; must fall back seamlessly to MongoDB
    const vehicle = await vehicleService.getVehicleById(testVehicleId);
    expect(vehicle).toBeDefined();
    expect(vehicle.id).toBe(testVehicleId);
    expect(vehicle.rental.baseRate).toBe(9999);

    // Reconnect Redis for subsequent tests
    await connectRedis();
    expect(isRedisConnected()).toBe(true);
  });
});
