import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { EphemeralRedisServer } from './helpers/test-redis.js';
import { getRedisClient, connectRedis, getRedisStatus, closeRedis, isRedisConnected } from '../src/config/redis.js';

describe('Redis Centralized Connection & Health Checks', () => {
  let redisServer: EphemeralRedisServer;
  let redisUrl: string;

  beforeAll(async () => {
    redisServer = new EphemeralRedisServer();
    redisUrl = await redisServer.start();
    process.env.REDIS_URL = redisUrl;
    await connectRedis();
  });

  afterAll(async () => {
    await closeRedis();
    await redisServer.stop();
    delete process.env.REDIS_URL;
  });

  it('successfully establishes connection to ephemeral Redis', async () => {
    const client = getRedisClient();
    const pingResult = await client.ping();
    expect(pingResult).toBe('PONG');
    expect(isRedisConnected()).toBe(true);
  });

  it('exposes safe health probe data with healthy status', async () => {
    const status = await getRedisStatus();
    expect(status.status).toBe('healthy');
    expect(status.connected).toBe(true);
    // Verify credentials and raw connection details are never exposed
    expect(status).not.toHaveProperty('password');
    expect(status).not.toHaveProperty('url');
    expect(status).not.toHaveProperty('connectionString');
  });

  it('GET /api/v1/health exposes safe Redis status and no credentials', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('redis');
    expect(res.body.data.redis).toHaveProperty('status', 'healthy');
    expect(res.body.data.redis).toHaveProperty('connected', true);
    expect(JSON.stringify(res.body)).not.toContain('redis://');
  });

  it('gracefully handles shutdown and updates status to disconnected', async () => {
    await closeRedis();
    expect(isRedisConnected()).toBe(false);
    const status = await getRedisStatus();
    expect(status.connected).toBe(false);
    expect(['disconnected', 'disabled', 'unhealthy']).toContain(status.status);
  });
});
