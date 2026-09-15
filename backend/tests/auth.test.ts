import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Router } from 'express';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { UserModel } from '../src/models/user.model.js';
import { requireAuth, requireRole } from '../src/middleware/auth.middleware.js';
import { sendSuccess } from '../src/utils/api-response.js';

describe('TASK 05: Production Authentication, Authorization & User Management', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);
  }, 20000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  }, 20000);

  // --------------------------------------------------------------------------
  // 1. REGISTRATION TESTS
  // --------------------------------------------------------------------------
  describe('POST /api/v1/auth/register', () => {
    it('should successfully register a customer and set an HTTP-only cookie', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'Jane.Doe@Example.com', // Test email case normalization
          phone: '+91 9876543210',
          password: 'Password123!',
          licenseNumber: 'DL-99221-KA'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('jane.doe@example.com');
      expect(res.body.data.user.role).toBe('CUSTOMER');
      expect(res.body.data.user.status).toBe('ACTIVE');
      expect(res.body.data.user.name).toBe('Jane Doe');

      // Security check: passwordHash MUST NOT be returned
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.user.password).toBeUndefined();

      // Verify HTTP-only cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toMatch(/skybolt_auth=[^;]+/);
      expect(cookies[0]).toMatch(/HttpOnly/i);
      expect(cookies[0]).toMatch(/SameSite=Lax/i);
    });

    it('should reject registration with duplicate email safely', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Jane Duplicate',
          email: 'jane.doe@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('should reject registration with weak password (< 8 chars)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Weak Pass',
          email: 'weak@example.com',
          password: 'short'
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
    });

    it('should reject mass assignment of privileged fields like role or status', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Attacker User',
          email: 'attacker@example.com',
          password: 'Password123!',
          role: 'ADMIN', // Injection attempt
          status: 'ACTIVE'
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
    });
  });

  // --------------------------------------------------------------------------
  // 2. LOGIN TESTS
  // --------------------------------------------------------------------------
  describe('POST /api/v1/auth/login', () => {
    it('should authenticate a valid user and return HTTP-only cookie', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'Jane.Doe@EXAMPLE.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('jane.doe@example.com');
      expect(res.body.data.user.passwordHash).toBeUndefined();

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toMatch(/skybolt_auth=[^;]+/);
    });

    it('should return 401 with generic error for nonexistent email (prevent enumeration)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('should return 401 with generic error for incorrect password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'jane.doe@example.com',
          password: 'WrongPassword999!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('should reject login for suspended accounts with 403', async () => {
      // Create suspended user directly
      await UserModel.create({
        name: 'Suspended User',
        email: 'suspended@example.com',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
        role: 'CUSTOMER',
        status: 'SUSPENDED'
      });

      // Update with valid hash
      const user = await UserModel.findOne({ email: 'suspended@example.com' }).select('+passwordHash');
      if (user) {
        const bcrypt = (await import('bcryptjs')).default;
        user.passwordHash = await bcrypt.hash('Password123!', 10);
        await user.save();
      }

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'suspended@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('should reject login for deactivated accounts with 403', async () => {
      const bcrypt = (await import('bcryptjs')).default;
      await UserModel.create({
        name: 'Deactivated User',
        email: 'deactivated@example.com',
        passwordHash: await bcrypt.hash('Password123!', 10),
        role: 'CUSTOMER',
        status: 'DEACTIVATED'
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'deactivated@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_DEACTIVATED');
    });
  });

  // --------------------------------------------------------------------------
  // 3. SESSION & CURRENT USER TESTS
  // --------------------------------------------------------------------------
  describe('GET /api/v1/auth/me & Session Management', () => {
    let authCookie: string;

    beforeAll(async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'jane.doe@example.com',
          password: 'Password123!'
        });
      authCookie = loginRes.headers['set-cookie'][0].split(';')[0];
    });

    it('should return current user when authenticated with HTTP-only cookie', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('jane.doe@example.com');
      expect(res.body.data.user.role).toBe('CUSTOMER');
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject tampered or invalid cookie with 401', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', ['skybolt_auth=tampered.invalid.token']);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should clear authentication cookie on logout', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      // Cookie is cleared or expired
      expect(cookies[0]).toMatch(/skybolt_auth=;/);
    });
  });

  // --------------------------------------------------------------------------
  // 4. AUTHORIZATION & RBAC TESTS
  // --------------------------------------------------------------------------
  describe('Role-Based Access Control (RBAC)', () => {
    let customerCookie: string;
    let adminCookie: string;

    beforeAll(async () => {
      // 1. Customer login
      const custRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'jane.doe@example.com',
          password: 'Password123!'
        });
      customerCookie = custRes.headers['set-cookie'][0].split(';')[0];

      // 2. Create Admin user in DB
      const bcrypt = (await import('bcryptjs')).default;
      await UserModel.create({
        name: 'Super Admin',
        email: 'admin@skybolt.com',
        passwordHash: await bcrypt.hash('AdminPassword123!', 10),
        role: 'ADMIN',
        status: 'ACTIVE'
      });

      // 3. Admin login
      const adminRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@skybolt.com',
          password: 'AdminPassword123!'
        });
      adminCookie = adminRes.headers['set-cookie'][0].split(';')[0];
    });

    it('should block CUSTOMER from accessing ADMIN route with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/auth/admin-only')
        .set('Cookie', [customerCookie]);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow ADMIN to access ADMIN route with 200 OK', async () => {
      const res = await request(app)
        .get('/api/v1/auth/admin-only')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.secret).toBe('admin-classified-data');
    });
  });

  // --------------------------------------------------------------------------
  // 5. USER PROFILE MANAGEMENT TESTS
  // --------------------------------------------------------------------------
  describe('User Profile Management (/api/v1/users/me)', () => {
    let userCookie: string;

    beforeAll(async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'jane.doe@example.com',
          password: 'Password123!'
        });
      userCookie = loginRes.headers['set-cookie'][0].split(';')[0];
    });

    it('should fetch user profile through GET /users/me', async () => {
      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Cookie', [userCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.user.name).toBe('Jane Doe');
      expect(res.body.data.user.email).toBe('jane.doe@example.com');
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('should update allowed profile fields through PATCH /users/me', async () => {
      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Cookie', [userCookie])
        .send({
          name: 'Jane Smith',
          phone: '+91 9998887776',
          licenseNumber: 'DL-UPDATED-99'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.user.name).toBe('Jane Smith');
      expect(res.body.data.user.phone).toBe('+91 9998887776');
      expect(res.body.data.user.licenseNumber).toBe('DL-UPDATED-99');
    });

    it('should reject unauthorized modification of protected fields (role elevation)', async () => {
      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Cookie', [userCookie])
        .send({
          role: 'ADMIN' // Malicious attempt to elevate role
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');

      // Verify role in database was NOT changed
      const dbUser = await UserModel.findOne({ email: 'jane.doe@example.com' });
      expect(dbUser?.role).toBe('CUSTOMER');
    });
  });

  // --------------------------------------------------------------------------
  // 6. PASSWORD CHANGE TESTS
  // --------------------------------------------------------------------------
  describe('POST /api/v1/auth/change-password', () => {
    let authCookie: string;

    beforeAll(async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'jane.doe@example.com',
          password: 'Password123!'
        });
      authCookie = loginRes.headers['set-cookie'][0].split(';')[0];
    });

    it('should reject password change when current password is incorrect', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', [authCookie])
        .send({
          currentPassword: 'WrongCurrentPassword!',
          newPassword: 'BrandNewPassword123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/Current password is incorrect/i);
    });

    it('should successfully change password when current password is correct', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', [authCookie])
        .send({
          currentPassword: 'Password123!',
          newPassword: 'BrandNewPassword123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify login succeeds with new password
      const newLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'jane.doe@example.com',
          password: 'BrandNewPassword123!'
        });
      expect(newLogin.status).toBe(200);

      // Verify old password no longer works
      const oldLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'jane.doe@example.com',
          password: 'Password123!'
        });
      expect(oldLogin.status).toBe(401);
    });
  });

  // --------------------------------------------------------------------------
  // 7. FORGOT & RESET PASSWORD FLOW
  // --------------------------------------------------------------------------
  describe('Password Reset Flow', () => {
    let resetToken = '';

    it('should return safe generic response for forgot-password on registered email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({
          email: 'jane.doe@example.com'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toMatch(/If an account exists/i);

      // In non-production test mode, debugToken is returned to facilitate testing
      expect(res.body.data.debugToken).toBeDefined();
      resetToken = res.body.data.debugToken;
    });

    it('should return identical safe response for nonexistent email (no user enumeration)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({
          email: 'nobody_here@example.com'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toMatch(/If an account exists/i);
      expect(res.body.data.debugToken).toBeUndefined();
    });

    it('should successfully reset password with valid token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'ResetPasswordSuccess123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify login works with newly reset password
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'jane.doe@example.com',
          password: 'ResetPasswordSuccess123!'
        });
      expect(loginRes.status).toBe(200);
    });

    it('should reject reused reset token (single-use enforcement)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'AnotherPassword123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/Invalid or expired password reset token/i);
    });
  });
});
