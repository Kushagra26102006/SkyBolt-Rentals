import crypto from 'crypto';
import { getRedisClient, isRedisConnected } from '../config/redis.js';
import { config } from '../config/env.config.js';

export class CacheService {
  private defaultTtl: number;

  constructor() {
    this.defaultTtl = config.cache.defaultTtlSeconds || 300;
  }

  /**
   * Retrieve cached value by key with safe JSON parsing and fallback on failure.
   */
  public async get<T>(key: string): Promise<T | null> {
    if (!config.cache.enabled || !isRedisConnected()) {
      return null;
    }

    try {
      const client = getRedisClient();
      const raw = await client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err: any) {
      if (!config.isTest) {
        console.warn(`[SkyBolt Cache] Read error for key "${key}": ${err?.message}`);
      }
      return null;
    }
  }

  /**
   * Set cached value with TTL in seconds.
   */
  public async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    if (!config.cache.enabled || !isRedisConnected()) {
      return false;
    }

    const ttl = ttlSeconds !== undefined ? ttlSeconds : this.defaultTtl;

    try {
      const client = getRedisClient();
      const serialized = JSON.stringify(value);
      if (ttl > 0) {
        await client.set(key, serialized, 'EX', ttl);
      } else {
        await client.set(key, serialized);
      }
      return true;
    } catch (err: any) {
      if (!config.isTest) {
        console.warn(`[SkyBolt Cache] Write error for key "${key}": ${err?.message}`);
      }
      return false;
    }
  }

  /**
   * Delete one or more keys from cache.
   */
  public async del(keys: string | string[]): Promise<number> {
    if (!config.cache.enabled || !isRedisConnected()) {
      return 0;
    }

    const keyList = Array.isArray(keys) ? keys : [keys];
    if (keyList.length === 0) return 0;

    try {
      const client = getRedisClient();
      return await client.del(...keyList);
    } catch (err: any) {
      if (!config.isTest) {
        console.warn(`[SkyBolt Cache] Deletion error: ${err?.message}`);
      }
      return 0;
    }
  }

  /**
   * Delete keys matching pattern using non-blocking SCAN.
   * Never uses blocking KEYS * in production.
   */
  public async delByPattern(pattern: string): Promise<number> {
    if (!config.cache.enabled || !isRedisConnected()) {
      return 0;
    }

    try {
      const client = getRedisClient();
      let cursor = '0';
      let totalDeleted = 0;

      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;

        if (keys.length > 0) {
          const deleted = await client.del(...keys);
          totalDeleted += deleted;
        }
      } while (cursor !== '0');

      return totalDeleted;
    } catch (err: any) {
      if (!config.isTest) {
        console.warn(`[SkyBolt Cache] delByPattern error for pattern "${pattern}": ${err?.message}`);
      }
      return 0;
    }
  }

  /**
   * Cache-Aside Pattern:
   * 1. Check Redis cache
   * 2. On hit -> return cached data
   * 3. On miss or Redis error -> call fetchFn() to load authoritative data from MongoDB
   * 4. Save result in cache asynchronously
   * 5. Return authoritative data
   */
  public async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    // Execute authoritative database fetch
    const freshData = await fetchFn();

    // Cache the fresh result asynchronously without blocking the caller on failure
    if (freshData !== null && freshData !== undefined) {
      this.set(key, freshData, ttlSeconds).catch(() => {});
    }

    return freshData;
  }

  /**
   * Acquire a distributed Redis lock with ownership token and expiration TTL.
   */
  public async acquireLock(resource: string, ttlMs = 10000): Promise<string | null> {
    if (!isRedisConnected()) {
      return null;
    }

    const token = crypto.randomUUID();
    const lockKey = `v1:lock:${resource}`;

    try {
      const client = getRedisClient();
      const result = await client.set(lockKey, token, 'PX', ttlMs, 'NX');
      return result === 'OK' ? token : null;
    } catch (err: any) {
      if (!config.isTest) {
        console.warn(`[SkyBolt Cache] Lock acquisition error for "${resource}": ${err?.message}`);
      }
      return null;
    }
  }

  /**
   * Release a distributed Redis lock safely using atomic Lua script.
   * Only the token owner can release the lock.
   */
  public async releaseLock(resource: string, token: string): Promise<boolean> {
    if (!isRedisConnected()) {
      return false;
    }

    const lockKey = `v1:lock:${resource}`;
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const client = getRedisClient();
      const result = await client.eval(luaScript, 1, lockKey, token);
      return result === 1;
    } catch (err: any) {
      if (!config.isTest) {
        console.warn(`[SkyBolt Cache] Lock release error for "${resource}": ${err?.message}`);
      }
      return false;
    }
  }
}

export const cacheService = new CacheService();
export default cacheService;
