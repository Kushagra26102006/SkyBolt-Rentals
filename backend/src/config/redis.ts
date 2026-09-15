import { Redis, RedisOptions } from 'ioredis';
import { config } from './env.config.js';

export interface RedisHealthStatus {
  status: 'healthy' | 'unhealthy' | 'disabled';
  connected: boolean;
  latencyMs?: number;
}

let redisClient: Redis | null = null;
let isConnecting = false;
let isReady = false;

/**
 * Build standard ioredis connection options
 */
export function getRedisOptions(): RedisOptions {
  const host = process.env.REDIS_HOST || config.redis.host;
  const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : config.redis.port;
  const password = process.env.REDIS_PASSWORD || config.redis.password || undefined;

  const options: RedisOptions = {
    host,
    port,
    password,
    connectTimeout: config.redis.connectTimeoutMs,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy(times: number) {
      if (config.isTest && times > 2) {
        return null; // Don't delay tests if Redis is unavailable
      }
      const delay = Math.min(times * 100, 2000);
      return delay;
    }
  };

  return options;
}

/**
 * Get or initialize centralized singleton Redis client
 */
export function getRedisClient(urlOverride?: string): Redis {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = urlOverride || process.env.REDIS_URL || config.redis.url;
  const options = getRedisOptions();
  if (redisUrl) {
    redisClient = new Redis(redisUrl, {
      ...options,
      maxRetriesPerRequest: null
    });
  } else {
    redisClient = new Redis(options);
  }

  redisClient.on('connect', () => {
    if (!config.isTest) {
      console.log('[SkyBolt Redis] Connecting to Redis...');
    }
  });

  redisClient.on('ready', () => {
    isReady = true;
    if (!config.isTest) {
      console.log('[SkyBolt Redis] Connected and ready');
    }
  });

  redisClient.on('error', (err) => {
    isReady = false;
    if (!config.isTest) {
      console.warn(`[SkyBolt Redis] Connection error: ${err.message}`);
    }
  });

  redisClient.on('close', () => {
    isReady = false;
  });

  redisClient.on('reconnecting', () => {
    isReady = false;
  });

  return redisClient;
}

/**
 * Asynchronously connect Redis client
 */
export async function connectRedis(urlOverride?: string): Promise<boolean> {
  if (!config.cache.enabled && !config.queues.enabled) {
    return false;
  }

  if (urlOverride) {
    process.env.REDIS_URL = urlOverride;
    if (redisClient) {
      await closeRedis();
    }
  }

  const client = getRedisClient(urlOverride);
  if (client.status === 'ready' || client.status === 'connecting') {
    return true;
  }

  if (isConnecting) return false;
  isConnecting = true;

  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    await client.ping();
    isReady = true;
    return true;
  } catch (err: any) {
    isReady = false;
    if (!config.isTest) {
      console.warn(`[SkyBolt Redis] Could not establish initial connection: ${err?.message}. Operating in degraded/fallback mode.`);
    }
    return false;
  } finally {
    isConnecting = false;
  }
}

/**
 * Safe Redis health probe for system health check endpoints.
 * Never exposes credentials, hosts, or connection strings.
 */
export async function getRedisStatus(): Promise<RedisHealthStatus> {
  if (!config.cache.enabled && !config.queues.enabled) {
    return { status: 'disabled', connected: false };
  }

  if (!redisClient || !isReady) {
    return { status: 'unhealthy', connected: false };
  }

  try {
    const start = Date.now();
    await redisClient.ping();
    const latencyMs = Date.now() - start;
    return { status: 'healthy', connected: true, latencyMs };
  } catch {
    return { status: 'unhealthy', connected: false };
  }
}

/**
 * Check if Redis is currently connected and responsive
 */
export function isRedisConnected(): boolean {
  return isReady && redisClient !== null && (redisClient.status === 'ready' || (redisClient.status as string) === 'connect');
}

/**
 * Graceful shutdown of Redis client
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      if (redisClient.status !== 'end') {
        await redisClient.quit();
      }
    } catch {
      redisClient.disconnect();
    } finally {
      redisClient = null;
      isReady = false;
    }
  }
}
