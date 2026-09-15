import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Correlation & Request ID Middleware', () => {
  it('should generate an X-Request-ID when not provided by client', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers).toHaveProperty('x-request-id');
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('should echo back valid client-supplied X-Request-ID', async () => {
    const customId = 'test-client-correlation-id-12345';
    const res = await request(app)
      .get('/api/v1/health')
      .set('X-Request-ID', customId);

    expect(res.headers['x-request-id']).toBe(customId);
  });
});
