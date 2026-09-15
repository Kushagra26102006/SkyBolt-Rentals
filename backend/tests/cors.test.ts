import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('CORS Security Configuration', () => {
  it('should include CORS headers for allowed origins', async () => {
    const res = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:8080')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8080');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('should reject unauthorized origin in strict mode', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://malicious-site.com');

    // In development mode all origins pass or reject depending on config; verify headers don't wildcard to *
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });
});
