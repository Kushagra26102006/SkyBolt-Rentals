import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';
import { seedHubs } from '../src/seeds/hub.seed.js';
import { CouponModel } from '../src/models/coupon.model.js';

describe('Chatbot API Endpoints (/api/v1/chat & /api/chat)', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();
  let customerCookie: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    await seedVehicles(true);
    await seedHubs(true);
    await CouponModel.create([
      {
        code: 'SKYBOLT10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        minBookingAmount: 0,
        maxDiscountAmount: 1000,
        startsAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000 * 30),
        usageLimit: 500,
        usageCount: 0,
        isActive: true,
        description: '10% off up to ₹1,000'
      }
    ]);

    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Chatbot HTTP Customer',
        email: 'chatbotapi@skybolt.test',
        password: 'Password123!',
        phone: '+919900112233'
      });

    customerCookie = regRes.headers['set-cookie'][0];
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  });

  describe('POST /api/v1/chat', () => {
    it('should reject requests with empty message body', async () => {
      const res = await request(app)
        .post('/api/v1/chat')
        .send({ message: '' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should reject requests where message exceeds 2000 characters', async () => {
      const longMessage = 'A'.repeat(2001);
      const res = await request(app)
        .post('/api/v1/chat')
        .send({ message: longMessage });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should allow unauthenticated guest to start a chat and return a conversationId', async () => {
      const res = await request(app)
        .post('/api/v1/chat')
        .send({
          message: 'Hi, what cars do you offer for rent?'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.conversationId).toBeDefined();
      expect(res.body.message).toBeDefined();
      expect(res.body.data).toBeDefined();
    });

    it('should allow authenticated customer to continue an existing conversation', async () => {
      const firstRes = await request(app)
        .post('/api/v1/chat')
        .set('Cookie', customerCookie)
        .send({
          message: 'Hello, I want to rent a car.'
        });

      expect(firstRes.status).toBe(200);
      const conversationId = firstRes.body.conversationId;

      const secondRes = await request(app)
        .post('/api/v1/chat')
        .set('Cookie', customerCookie)
        .send({
          message: 'Can you show me SUVs?',
          conversationId
        });

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.conversationId).toBe(conversationId);
      expect(secondRes.body.data?.type).toBe('vehicles');
    });

    it('should support the /api/chat alias route', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({
          message: 'What are your rental hubs?'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data?.type).toBe('locations');
    });
  });

  describe('GET & DELETE /api/v1/chat/history/:conversationId', () => {
    it('should fetch conversation history and clear history successfully', async () => {
      const chatRes = await request(app)
        .post('/api/v1/chat')
        .set('Cookie', customerCookie)
        .send({
          message: 'First test message for history retrieval'
        });

      const convId = chatRes.body.conversationId;

      const historyRes = await request(app)
        .get(`/api/v1/chat/history/${convId}`)
        .set('Cookie', customerCookie);

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.success).toBe(true);
      expect(historyRes.body.messages.length).toBeGreaterThan(0);

      const deleteRes = await request(app)
        .delete(`/api/v1/chat/history/${convId}`)
        .set('Cookie', customerCookie);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      const verifyRes = await request(app)
        .get(`/api/v1/chat/history/${convId}`)
        .set('Cookie', customerCookie);

      expect(verifyRes.body.messages.length).toBe(0);
    });
  });
});
