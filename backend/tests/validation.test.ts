import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { validateRequest } from '../src/middleware/validate.middleware.js';
import { errorHandler } from '../src/middleware/error.middleware.js';

describe('Zod Validation Middleware', () => {
  const testApp = express();
  testApp.use(express.json());

  const testSchema = {
    body: z.object({
      email: z.string().email('Invalid email address format'),
      age: z.number().min(18, 'Must be at least 18 years old')
    })
  };

  testApp.post('/test-validate', validateRequest(testSchema), (_req, res) => {
    res.status(200).json({ success: true });
  });
  testApp.use(errorHandler);

  it('should accept valid payload', async () => {
    const res = await request(testApp)
      .post('/test-validate')
      .send({ email: 'test@skybolt.com', age: 25 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('should reject invalid payload with 422 and structured field errors', async () => {
    const res = await request(testApp)
      .post('/test-validate')
      .send({ email: 'not-an-email', age: 15 });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.error).toHaveProperty('code', 'UNPROCESSABLE_ENTITY');
    expect(res.body.error).toHaveProperty('details');
    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(res.body.error.details.length).toBe(2);
  });
});
