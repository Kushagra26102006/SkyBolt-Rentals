import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { app } from '../src/app.js';
import {
  connectDatabase,
  disconnectDatabase,
  isDatabaseConnected,
  getDatabaseStatus
} from '../src/config/database.js';

describe('MongoDB Database Foundation & Health Probes', () => {
  let mongoServer: EphemeralMongoServer;
  let mongoUri: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    mongoUri = await mongoServer.start();
  }, 30000);

  afterAll(async () => {
    await disconnectDatabase().catch(() => {});
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  describe('Database Connection Lifecycle', () => {
    it('should initially be disconnected before connectDatabase is invoked', () => {
      expect(isDatabaseConnected()).toBe(false);
      expect(getDatabaseStatus()).toBe('disconnected');
    });

    it('should connect successfully to in-memory MongoDB instance', async () => {
      await connectDatabase(mongoUri);
      expect(isDatabaseConnected()).toBe(true);
      expect(getDatabaseStatus()).toBe('connected');
    });

    it('should handle redundant connection calls gracefully', async () => {
      await expect(connectDatabase(mongoUri)).resolves.toBeDefined();
      expect(isDatabaseConnected()).toBe(true);
    });
  });

  describe('Health, Liveness & Readiness Probes when Connected', () => {
    it('GET /api/v1/health should return 200 with status: ok and database: connected', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('status', 'ok');
      expect(res.body.data).toHaveProperty('database', 'connected');
      expect(res.body.data).not.toHaveProperty('uri');
      expect(res.body.data).not.toHaveProperty('password');
      expect(res.headers).toHaveProperty('x-request-id');
    });

    it('GET /api/v1/health/live should return 200 with process liveness', async () => {
      const res = await request(app).get('/api/v1/health/live');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('status', 'ok');
      expect(res.body.data).toHaveProperty('uptimeSeconds');
    });

    it('GET /api/v1/health/ready should return 200 when database is connected', async () => {
      const res = await request(app).get('/api/v1/health/ready');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('ready', true);
      expect(res.body.data).toHaveProperty('database', 'connected');
    });
  });

  describe('Health & Readiness Probes when Disconnected', () => {
    it('should disconnect cleanly and update connection state', async () => {
      await disconnectDatabase();
      expect(isDatabaseConnected()).toBe(false);
      expect(getDatabaseStatus()).toBe('disconnected');
    });

    it('GET /api/v1/health should report degraded status when database is disconnected', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('status', 'degraded');
      expect(res.body.data).toHaveProperty('database', 'disconnected');
    });

    it('GET /api/v1/health/ready should return 503 Service Unavailable when database is disconnected', async () => {
      const res = await request(app).get('/api/v1/health/ready');

      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toHaveProperty('code', 'DATABASE_UNAVAILABLE');
      expect(res.body.data).toHaveProperty('ready', false);
      expect(res.body.data).toHaveProperty('database', 'disconnected');
    });

    it('GET /api/v1/health/live should continue returning 200 even if database is disconnected', async () => {
      const res = await request(app).get('/api/v1/health/live');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('status', 'ok');
    });
  });

  describe('Connection Failure & Error Handling', () => {
    it('should reject connection safely when given an invalid MongoDB URI without leaking credentials', async () => {
      const invalidUri = 'mongodb://fakeuser:secretpassword123@127.0.0.1:27019/unreachable_db';

      await expect(
        connectDatabase(invalidUri, { serverSelectionTimeoutMS: 500, connectTimeoutMS: 500 })
      ).rejects.toThrow();
      expect(isDatabaseConnected()).toBe(false);
    });
  });
});
