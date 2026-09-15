import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { UserModel } from '../src/models/user.model.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { BookingModel } from '../src/models/booking.model.js';

describe('Marketplace: Owner & Customer & Admin User Types', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let customerCookie: string;
  let ownerACookie: string;
  let ownerBCookie: string;
  let adminCookie: string;
  let ownerAId: string;
  let ownerBId: string;
  let customerId: string;
  let adminId: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    // Create an Admin account in DB directly
    const adminUser = await UserModel.create({
      name: 'Platform Admin',
      email: 'admin@skybolt.com',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890', // placeholder
      role: 'ADMIN',
      status: 'ACTIVE'
    });
    adminId = String(adminUser._id);
  }, 25000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  }, 25000);

  // --------------------------------------------------------------------------
  // 1. REGISTRATION & ROLE SECURITY TESTS
  // --------------------------------------------------------------------------
  describe('Public Registration Security', () => {
    it('should reject registration attempts with privileged ADMIN role', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Hacker Admin',
          email: 'hacker@skybolt.com',
          password: 'Password123!',
          role: 'ADMIN'
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should successfully register a CUSTOMER and set cookie', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Alice Customer',
          email: 'alice@example.com',
          password: 'Password123!',
          role: 'CUSTOMER'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('CUSTOMER');
      expect(res.body.data.user.status).toBe('ACTIVE');
      customerId = res.body.data.user.id;

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      customerCookie = cookies[0];
    });

    it('should successfully register a VEHICLE OWNER with PENDING_VERIFICATION', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Bob Owner',
          email: 'bob.owner@example.com',
          phone: '+91 9876543210',
          city: 'Bangalore',
          address: '123 Tech Park',
          idVerificationNumber: 'PAN-ABCD1234E',
          password: 'Password123!',
          role: 'OWNER'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('OWNER');
      expect(res.body.data.user.status).toBe('PENDING_VERIFICATION');
      expect(res.body.data.user.city).toBe('Bangalore');
      ownerAId = res.body.data.user.id;

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      ownerACookie = cookies[0];
    });

    it('should register a second OWNER for isolation testing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Charlie Owner',
          email: 'charlie.owner@example.com',
          password: 'Password123!',
          role: 'OWNER'
        });

      expect(res.status).toBe(201);
      ownerBId = res.body.data.user.id;
      ownerBCookie = res.headers['set-cookie'][0];
    });
  });

  // --------------------------------------------------------------------------
  // 2. OWNER VEHICLE LISTING & ISOLATION TESTS
  // --------------------------------------------------------------------------
  describe('Owner Vehicle Listing & Isolation', () => {
    let createdVehicleId: string;

    it('should allow Owner A to create a vehicle listing in PENDING_APPROVAL status', async () => {
      const res = await request(app)
        .post('/api/v1/owner/vehicles')
        .set('Cookie', ownerACookie)
        .send({
          brand: 'Royal Enfield',
          model: 'Hunter 350',
          name: 'Hunter 350 Dapper Ash',
          variant: 'Dapper',
          year: 2023,
          category: 'BIKE',
          specifications: {
            seats: 2,
            transmission: 'MANUAL',
            fuelType: 'PETROL',
            engineCC: 349,
            mileage: '36 kmpl'
          },
          rental: {
            baseRate: 900,
            currency: 'INR',
            deposit: 2000
          },
          location: {
            name: 'Bangalore Tech Hub',
            city: 'Bangalore'
          },
          images: [
            {
              url: 'assets/images/royal-enfield-hunter.webp',
              isPrimary: true
            }
          ],
          features: ['Dual-channel ABS', 'USB Charger', 'Digital-Analog Cluster'],
          description: 'A punchy retro roadster in pristine condition, regularly serviced.'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.vehicle).toBeDefined();
      expect(res.body.data.vehicle.name).toBe('Hunter 350 Dapper Ash');
      expect(res.body.data.vehicle.status).toBe('PENDING_APPROVAL');
      expect(res.body.data.vehicle.ownerId).toBe(ownerAId);

      createdVehicleId = res.body.data.vehicle.id;
    });

    it('should NOT display PENDING_APPROVAL vehicle in public vehicle catalog', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles')
        .query({ search: 'Hunter 350' });

      expect(res.status).toBe(200);
      const matched = res.body.data.items.find((v: any) => v.id === createdVehicleId);
      expect(matched).toBeUndefined();
    });

    it('should allow Owner A to view their listed vehicle', async () => {
      const res = await request(app)
        .get(`/api/v1/owner/vehicles/${createdVehicleId}`)
        .set('Cookie', ownerACookie);

      expect(res.status).toBe(200);
      expect(res.body.data.vehicle.id).toBe(createdVehicleId);
      expect(res.body.data.vehicle.ownerId).toBe(ownerAId);
    });

    it('should DENY Owner B from accessing Owner A vehicle', async () => {
      const res = await request(app)
        .get(`/api/v1/owner/vehicles/${createdVehicleId}`)
        .set('Cookie', ownerBCookie);

      expect(res.status).toBe(404);
    });

    it('should DENY Owner B from updating Owner A vehicle', async () => {
      const res = await request(app)
        .patch(`/api/v1/owner/vehicles/${createdVehicleId}`)
        .set('Cookie', ownerBCookie)
        .send({ name: 'Hacked Vehicle Name' });

      expect(res.status).toBe(404);
    });

    it('should DENY Owner A from activating vehicle before Admin approval', async () => {
      const res = await request(app)
        .patch(`/api/v1/owner/vehicles/${createdVehicleId}/status`)
        .set('Cookie', ownerACookie)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('APPROVAL_PENDING');
    });

    it('should DENY Customer from accessing owner endpoints', async () => {
      const res = await request(app)
        .get('/api/v1/owner/vehicles')
        .set('Cookie', customerCookie);

      expect(res.status).toBe(403);
    });

    it('should DENY Owner from accessing admin endpoints', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard/overview')
        .set('Cookie', ownerACookie);

      expect(res.status).toBe(403);
    });

    it('should allow Admin to approve Owner A vehicle listing', async () => {
      // Mock admin authentication by signing token or setting test user
      const adminToken = (await import('jsonwebtoken')).default.sign(
        { sub: adminId, email: 'admin@skybolt.com', role: 'ADMIN' },
        (await import('../src/config/env.config.js')).config.auth.jwtSecret,
        { algorithm: 'HS256' }
      );
      adminCookie = `skybolt_auth=${adminToken}`;

      const res = await request(app)
        .patch(`/api/v1/admin/vehicles/${createdVehicleId}/approval`)
        .set('Cookie', adminCookie)
        .send({
          status: 'ACTIVE',
          reason: 'Verified vehicle documents and photos'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.vehicle.status).toBe('ACTIVE');
    });

    it('should now display approved vehicle in public vehicle catalog', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles')
        .query({ search: 'Hunter 350' });

      expect(res.status).toBe(200);
      const matched = res.body.data.items.find((v: any) => v.id === createdVehicleId);
      expect(matched).toBeDefined();
      expect(matched.name).toBe('Hunter 350 Dapper Ash');
    });
  });

  // --------------------------------------------------------------------------
  // 3. BOOKING, EARNINGS & STATS FLOW
  // --------------------------------------------------------------------------
  describe('Customer Rental of Owner Vehicle & Owner Earnings', () => {
    let vehicleId: string;
    let bookingId: string;

    beforeAll(async () => {
      const v = await VehicleModel.findOne({ name: 'Hunter 350 Dapper Ash' }).exec();
      vehicleId = String(v!._id);
    });

    it('should allow Customer to book the approved owner vehicle', async () => {
      const pickupAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      const returnAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', customerCookie)
        .send({
          vehicleId,
          pickupAt,
          returnAt,
          pickupLocation: 'Bangalore Tech Hub',
          returnLocation: 'Bangalore Tech Hub'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const bookingData = res.body.data.booking || res.body.data;
      expect(bookingData.vehicleId).toBe(vehicleId);
      expect(bookingData.ownerId).toBe(ownerAId);
      bookingId = bookingData.id;
    });

    it('should allow Owner A to view bookings for their vehicle', async () => {
      const res = await request(app)
        .get('/api/v1/owner/bookings')
        .set('Cookie', ownerACookie);

      expect(res.status).toBe(200);
      expect(res.body.data.bookings.length).toBeGreaterThanOrEqual(1);
      const b = res.body.data.bookings.find((item: any) => item.id === bookingId);
      expect(b).toBeDefined();
      expect(b.vehicle.name).toBe('Hunter 350 Dapper Ash');
      expect(b.customer.name).toBe('Alice Customer');
    });

    it('should calculate Owner A stats properly', async () => {
      const res = await request(app)
        .get('/api/v1/owner/stats')
        .set('Cookie', ownerACookie);

      expect(res.status).toBe(200);
      expect(res.body.data.totalVehicles).toBe(1);
      expect(res.body.data.activeVehicles).toBe(1);
      expect(res.body.data.totalBookings).toBe(1);
    });

    it('should allow Admin to view list of owners and stats', async () => {
      const res = await request(app)
        .get('/api/v1/admin/owners')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      const ownerA = res.body.data.find((o: any) => o.id === ownerAId);
      expect(ownerA).toBeDefined();
      expect(ownerA.stats.vehiclesCount).toBe(1);
    });
  });
});
