import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { ContactInquiry } from '../src/models/contact-inquiry.model.js';
import { AuditLogModel } from '../src/models/audit-log.model.js';

describe('Contact Inquiry API & Validation Suite', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let adminCookie: string;
  let customerCookie: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    // Register customer
    const custRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Contact Customer',
        email: 'contact.customer@skybolt.test',
        password: 'Password123!',
        phone: '+91 98765 43210'
      });
    customerCookie = custRes.headers['set-cookie']?.[0]?.split(';')[0] || '';

    // Register admin user
    const adminRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Contact Admin',
        email: 'contact.admin@skybolt.test',
        password: 'Password123!',
        phone: '+91 98765 43211'
      });

    // Elevate admin user to ADMIN role in database
    const { UserModel } = await import('../src/models/user.model.js');
    await UserModel.updateOne(
      { email: 'contact.admin@skybolt.test' },
      { $set: { role: 'ADMIN' } }
    );

    // Login as admin to get admin cookie
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'contact.admin@skybolt.test',
        password: 'Password123!'
      });
    adminCookie = adminLoginRes.headers['set-cookie']?.[0]?.split(';')[0] || '';
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  });

  describe('1. Public Inquiry Submission', () => {
    it('should submit a valid contact inquiry and record audit event', async () => {
      const res = await request(app)
        .post('/api/v1/contact')
        .send({
          name: 'Priya Sharma',
          email: 'priya.sharma@example.com',
          phone: '+91 98111 22334',
          subject: 'booking',
          message: 'I would like to inquire about monthly corporate vehicle rental discounts.'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.inquiryId).toBeDefined();
      expect(res.body.data.email).toBe('priya.sharma@example.com');

      // Verify database record
      const inquiry = await ContactInquiry.findById(res.body.data.inquiryId);
      expect(inquiry).not.toBeNull();
      expect(inquiry?.name).toBe('Priya Sharma');
      expect(inquiry?.status).toBe('NEW');

      // Verify audit log
      const auditLog = await AuditLogModel.findOne({
        entityType: 'CONTACT',
        entityId: res.body.data.inquiryId
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.action).toBe('CONTACT_INQUIRY_SUBMITTED');
    });

    it('should reject contact inquiry with invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/contact')
        .send({
          name: 'John Doe',
          email: 'not-an-email',
          subject: 'general',
          message: 'Hello, this should fail validation.'
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
    });

    it('should reject contact inquiry with message that is too short', async () => {
      const res = await request(app)
        .post('/api/v1/contact')
        .send({
          name: 'John Doe',
          email: 'john.doe@example.com',
          subject: 'general',
          message: 'Hi' // < 5 characters
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
    });

    it('should reject unexpected extra fields (strict schema)', async () => {
      const res = await request(app)
        .post('/api/v1/contact')
        .send({
          name: 'John Doe',
          email: 'john.doe@example.com',
          message: 'Valid length inquiry message.',
          isSpam: false,
          role: 'ADMIN'
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
    });
  });

  describe('2. Protected Admin Inquiries Management', () => {
    it('should reject unauthenticated access to GET /api/v1/contact with 401', async () => {
      const res = await request(app).get('/api/v1/contact');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject regular customer access to GET /api/v1/contact with 403', async () => {
      const res = await request(app)
        .get('/api/v1/contact')
        .set('Cookie', customerCookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow admin to list all submitted inquiries', async () => {
      const res = await request(app)
        .get('/api/v1/contact')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.pagination).toBeDefined();
    });
  });
});
