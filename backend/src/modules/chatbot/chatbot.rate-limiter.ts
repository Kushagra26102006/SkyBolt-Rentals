import { Request, Response, NextFunction, RequestHandler } from 'express';
import { getRedisClient, isRedisConnected } from '../../config/redis.js';
import { config } from '../../config/env.config.js';
import { ChatbotError } from './chatbot.errors.js';

interface MemoryRateLimitRecord {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, MemoryRateLimitRecord>();

// Periodic cleanup of expired memory entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (record.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}, 120000).unref();

/**
 * Dedicated Chatbot Rate Limiter Middleware
 * Enforces 10 req/min for guests and 30 req/min for authenticated users.
 * Uses Redis when available; seamlessly falls back to memory store.
 */
export const chatbotRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Skip during tests unless specifically flagged for rate-limit verification
  if (config.isTest && req.headers['x-test-rate-limit'] !== 'true') {
    return next();
  }

  const isAuthenticated = Boolean(req.user?.id);
  const maxRequests = isAuthenticated
    ? config.chatbot.rateLimit.auth
    : config.chatbot.rateLimit.guest;

  const windowSeconds = 60;
  const identifier = isAuthenticated
    ? `user:${req.user!.id}`
    : `guest:${req.ip || req.socket.remoteAddress || 'anonymous'}`;

  const cacheKey = `skybolt:ratelimit:chat:${identifier}`;

  try {
    if (isRedisConnected()) {
      const client = getRedisClient();
      const current = await client.incr(cacheKey);

      if (current === 1) {
        await client.expire(cacheKey, windowSeconds);
      }

      const ttl = await client.ttl(cacheKey);
      const remaining = Math.max(0, maxRequests - current);

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', ttl > 0 ? ttl : windowSeconds);

      if (current > maxRequests) {
        res.setHeader('Retry-After', ttl > 0 ? ttl : windowSeconds);
        return next(
          ChatbotError.rateLimitExceeded(
            `Chat rate limit exceeded. Allowed: ${maxRequests} requests per minute. Please wait ${ttl} seconds.`
          )
        );
      }

      return next();
    }

    // In-memory fallback
    const now = Date.now();
    let record = memoryStore.get(cacheKey);

    if (!record || record.resetAt <= now) {
      record = {
        count: 1,
        resetAt: now + windowSeconds * 1000
      };
      memoryStore.set(cacheKey, record);
    } else {
      record.count += 1;
    }

    const remainingSec = Math.ceil((record.resetAt - now) / 1000);
    const remaining = Math.max(0, maxRequests - record.count);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', remainingSec);

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', remainingSec);
      return next(
        ChatbotError.rateLimitExceeded(
          `Chat rate limit exceeded. Allowed: ${maxRequests} requests per minute. Please wait ${remainingSec} seconds.`
        )
      );
    }

    return next();
  } catch (err) {
    // Fail open if rate limiter itself errors so user isn't locked out
    console.warn('[SkyBolt Chatbot] Rate limiter evaluation error:', err);
    return next();
  }
};
