import { ConnectionOptions, DefaultJobOptions } from 'bullmq';
import { getRedisOptions } from '../config/redis.js';
import { config } from '../config/env.config.js';

/**
 * BullMQ Connection Options
 * Shares connection settings with the centralized Redis configuration.
 */
export function getBullMQConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL || config.redis.url;
  if (url) {
    return {
      url,
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    };
  }

  const base = getRedisOptions();
  return {
    host: base.host,
    port: base.port,
    password: base.password,
    connectTimeout: base.connectTimeout,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  };
}

/**
 * Production Default Job Options:
 * - Exponential backoff retry for transient network/provider errors
 * - Bounded retention to prevent unbounded Redis memory growth
 */
export const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000
  },
  removeOnComplete: {
    count: 500,
    age: 86400 // 24 hours retention
  },
  removeOnFail: {
    count: 1000,
    age: 604800 // 7 days retention for audit & admin retry
  }
};
