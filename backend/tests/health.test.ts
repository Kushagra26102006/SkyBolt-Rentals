import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Health & Root Endpoints', () => {
  it('GET /api/v1/health should return 200 and healthy status envelope', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('message', 'SkyBolt Rentals API is healthy');
    expect(['ok', 'degraded']).toContain(res.body.data.status);
    expect(res.body.data).toHaveProperty('database');
    expect(res.body.data).toHaveProperty('uptimeSeconds');
    expect(res.body.data).toHaveProperty('environment');
    expect(res.body.data).toHaveProperty('version', '1.0.0');
    expect(res.headers).toHaveProperty('x-request-id');
  });

  it('GET /api/v1 should return 200 and API metadata', async () => {
    const res = await request(app).get('/api/v1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('name', 'SkyBolt Rentals API');
    expect(res.body.data).toHaveProperty('version', '1.0.0');
    expect(res.body.data).toHaveProperty('status', 'active');
  });
});
