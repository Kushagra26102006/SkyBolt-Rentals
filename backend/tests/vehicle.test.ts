import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { UserModel } from '../src/models/user.model.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';

describe('TASK 06: Production Vehicle Catalog API, Models & Management', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  // Test session cookies for different roles
  let customerCookie: string;
  let fleetManagerCookie: string;
  let adminCookie: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    // Sync indexes to ensure unique constraints are active immediately
    await VehicleModel.syncIndexes();

    // Seed fleet vehicles (idempotent seed of 12 vehicles)
    await seedVehicles(true);

    // Register Customer User
    const custReg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Real Customer',
        email: 'realcust@skybolt.test',
        password: 'Password123!',
        phone: '+91 9900000001'
      });
    customerCookie = custReg.headers['set-cookie'][0];

    // Register & elevate Fleet Manager
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Real Manager',
        email: 'realmgr@skybolt.test',
        password: 'Password123!',
        phone: '+91 9900000002'
      });
    await UserModel.updateOne({ email: 'realmgr@skybolt.test' }, { $set: { role: 'FLEET_MANAGER' } });
    const mgrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'realmgr@skybolt.test', password: 'Password123!' });
    fleetManagerCookie = mgrLogin.headers['set-cookie'][0];

    // Register & elevate Admin
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Real Admin',
        email: 'realadmin@skybolt.test',
        password: 'Password123!',
        phone: '+91 9900000003'
      });
    await UserModel.updateOne({ email: 'realadmin@skybolt.test' }, { $set: { role: 'ADMIN' } });
    const admLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'realadmin@skybolt.test', password: 'Password123!' });
    adminCookie = admLogin.headers['set-cookie'][0];
  }, 25000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  }, 20000);

  // --------------------------------------------------------------------------
  // 1. VEHICLE MODEL INTEGRITY & VALIDATION
  // --------------------------------------------------------------------------
  describe('Vehicle Model Constraints & Validation', () => {
    it('should successfully create a valid vehicle document with defaults', async () => {
      const v = await VehicleModel.create({
        vehicleCode: 'TEST-VHC-001',
        name: 'Tesla Model 3 Performance',
        brand: 'Tesla',
        model: 'Model 3',
        year: 2024,
        category: 'EV',
        registrationNumber: 'KA-01-EQ-9999',
        specifications: {
          seats: 5,
          transmission: 'AUTOMATIC',
          fuelType: 'ELECTRIC'
        },
        rental: {
          baseRate: 2500,
          currency: 'INR'
        },
        location: {
          name: 'Bangalore Hub',
          city: 'Bangalore'
        },
        images: [
          { url: 'https://images.unsplash.com/test.jpg', isPrimary: true }
        ],
        features: ['Autopilot', 'Glass Roof', 'Supercharging']
      });

      expect(v._id).toBeDefined();
      expect(v.vehicleCode).toBe('TEST-VHC-001');
      expect(v.status).toBe('ACTIVE');
      expect(v.isDeleted).toBe(false);
      expect(v.rating.average).toBe(0);
      expect(v.createdAt).toBeDefined();
    });

    it('should reject invalid category enum', async () => {
      await expect(
        VehicleModel.create({
          vehicleCode: 'TEST-INVALID-CAT',
          name: 'Invalid Cat Vehicle',
          brand: 'Generic',
          model: 'X',
          year: 2024,
          category: 'SPACE_SHUTTLE' as any,
          specifications: { seats: 4, transmission: 'AUTOMATIC', fuelType: 'PETROL' },
          rental: { baseRate: 1000, currency: 'INR' },
          location: { name: 'Hub', city: 'Delhi' }
        })
      ).rejects.toThrow();
    });

    it('should reject negative baseRate', async () => {
      await expect(
        VehicleModel.create({
          vehicleCode: 'TEST-NEG-PRICE',
          name: 'Negative Price Vehicle',
          brand: 'Generic',
          model: 'Y',
          year: 2024,
          category: 'CAR',
          specifications: { seats: 4, transmission: 'AUTOMATIC', fuelType: 'PETROL' },
          rental: { baseRate: -500, currency: 'INR' },
          location: { name: 'Hub', city: 'Delhi' }
        })
      ).rejects.toThrow();
    });

    it('should reject duplicate vehicleCode', async () => {
      await expect(
        VehicleModel.create({
          vehicleCode: 'TEST-VHC-001', // Already created
          name: 'Duplicate Code Vehicle',
          brand: 'Tesla',
          model: 'Model Y',
          year: 2024,
          category: 'EV',
          specifications: { seats: 5, transmission: 'AUTOMATIC', fuelType: 'ELECTRIC' },
          rental: { baseRate: 2500, currency: 'INR' },
          location: { name: 'Bangalore Hub', city: 'Bangalore' }
        })
      ).rejects.toThrow();
    });

    it('should reject duplicate registrationNumber', async () => {
      await expect(
        VehicleModel.create({
          vehicleCode: 'TEST-VHC-DUP-REG',
          name: 'Duplicate Reg Vehicle',
          brand: 'Tesla',
          model: 'Model S',
          year: 2024,
          category: 'LUXURY',
          registrationNumber: 'KA-01-EQ-9999', // Already used by TEST-VHC-001
          specifications: { seats: 5, transmission: 'AUTOMATIC', fuelType: 'ELECTRIC' },
          rental: { baseRate: 3500, currency: 'INR' },
          location: { name: 'Bangalore Hub', city: 'Bangalore' }
        })
      ).rejects.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // 2. PUBLIC VEHICLE CATALOG (LIST, FILTER, SORT, SEARCH, PAGINATION)
  // --------------------------------------------------------------------------
  describe('GET /api/v1/vehicles (Public Catalog)', () => {
    it('should return paginated active vehicles list with metadata', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles')
        .query({ page: 1, limit: 5 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBe(5);

      const pagination = res.body.data.pagination;
      expect(pagination.page).toBe(1);
      expect(pagination.limit).toBe(5);
      expect(pagination.total).toBeGreaterThanOrEqual(12);
      expect(pagination.totalPages).toBeGreaterThanOrEqual(3);

      // Sensitive fields must NOT be exposed publicly
      const firstItem = res.body.data.items[0];
      expect(firstItem.registrationNumber).toBeUndefined();
      expect(firstItem.isDeleted).toBeUndefined();
    });

    it('should enforce maximum pagination limit bounds (max 100)', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles')
        .query({ limit: 500 });

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.limit).toBe(100);
    });

    it('should filter by vehicle category (e.g. BIKE)', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles')
        .query({ category: 'BIKE' });

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      res.body.data.items.forEach((item: any) => {
        expect(item.category).toBe('BIKE');
      });
    });

    it('should filter by fuelType and transmission', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles')
        .query({ fuelType: 'ELECTRIC', transmission: 'AUTOMATIC' });

      expect(res.status).toBe(200);
      res.body.data.items.forEach((item: any) => {
        expect(item.specifications.fuelType).toBe('ELECTRIC');
        expect(item.specifications.transmission).toBe('AUTOMATIC');
      });
    });

    it('should filter by price range', async () => {
      const minPrice = 500;
      const maxPrice = 900;

      const res = await request(app)
        .get('/api/v1/vehicles')
        .query({ minPrice, maxPrice });

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      res.body.data.items.forEach((item: any) => {
        expect(item.rental.baseRate).toBeGreaterThanOrEqual(minPrice);
        expect(item.rental.baseRate).toBeLessThanOrEqual(maxPrice);
      });
    });

    it('should safely sort by allowlisted order: price_asc', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles')
        .query({ sort: 'price_asc', limit: 10 });

      expect(res.status).toBe(200);
      const rates = res.body.data.items.map((i: any) => i.rental.baseRate);
      for (let i = 0; i < rates.length - 1; i++) {
        expect(rates[i]).toBeLessThanOrEqual(rates[i + 1]);
      }
    });

    it('should safely sort by allowlisted order: price_desc', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles')
        .query({ sort: 'price_desc', limit: 10 });

      expect(res.status).toBe(200);
      const rates = res.body.data.items.map((i: any) => i.rental.baseRate);
      for (let i = 0; i < rates.length - 1; i++) {
        expect(rates[i]).toBeGreaterThanOrEqual(rates[i + 1]);
      }
    });

    it('should reject invalid sort key with 422', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles')
        .query({ sort: 'drop_database' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should search by keyword across brand, model, and name', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles')
        .query({ search: 'Hunter' });

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.items[0].name).toContain('Hunter');
    });
  });

  // --------------------------------------------------------------------------
  // 3. VEHICLE DETAILS (BY _id AND BY vehicleCode)
  // --------------------------------------------------------------------------
  describe('GET /api/v1/vehicles/:id', () => {
    it('should return vehicle details by human-readable vehicleCode', async () => {
      const res = await request(app).get('/api/v1/vehicles/SKY-VHC-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.vehicle).toBeDefined();
      expect(res.body.data.vehicle.vehicleCode).toBe('SKY-VHC-001');
      expect(res.body.data.vehicle.name).toContain('Honda Activa');
      // Public response must not expose registration number
      expect(res.body.data.vehicle.registrationNumber).toBeUndefined();
    });

    it('should return vehicle details by MongoDB ObjectId', async () => {
      const vehicle = await VehicleModel.findOne({ vehicleCode: 'SKY-VHC-002' });
      expect(vehicle).toBeDefined();

      const res = await request(app).get(`/api/v1/vehicles/${vehicle!._id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.vehicle.id).toBe(vehicle!._id.toString());
      expect(res.body.data.vehicle.vehicleCode).toBe('SKY-VHC-002');
    });

    it('should return 404 with VEHICLE_NOT_FOUND for nonexistent vehicle ID', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app).get(`/api/v1/vehicles/${fakeId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VEHICLE_NOT_FOUND');
    });

    it('should return 404 with VEHICLE_NOT_FOUND for nonexistent vehicleCode', async () => {
      const res = await request(app).get('/api/v1/vehicles/NONEXISTENT-CODE');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VEHICLE_NOT_FOUND');
    });
  });

  // --------------------------------------------------------------------------
  // 4. AUTHORIZATION & RBAC ENFORCEMENT
  // --------------------------------------------------------------------------
  describe('RBAC & Security for Fleet Management', () => {
    const newVehiclePayload = {
      vehicleCode: 'TEST-ADMIN-001',
      name: 'BMW M4 Competition Coupe',
      brand: 'BMW',
      model: 'M4',
      year: 2024,
      category: 'LUXURY',
      registrationNumber: 'DL-01-AB-1234',
      specifications: {
        seats: 4,
        transmission: 'AUTOMATIC',
        fuelType: 'PETROL',
        engineCC: 2993,
        luggageCapacity: 440
      },
      rental: {
        rentalType: 'DAILY',
        baseRate: 4500,
        currency: 'INR',
        deposit: 50000
      },
      location: {
        name: 'Delhi Airport Hub',
        city: 'New Delhi'
      },
      images: [
        { url: 'https://images.unsplash.com/bmw-m4.jpg', isPrimary: true }
      ],
      features: ['Carbon Roof', 'M Sport Exhaust', 'Harmon Kardon', 'Heads Up Display']
    };

    it('should reject unauthenticated POST /api/v1/vehicles with 401', async () => {
      const res = await request(app)
        .post('/api/v1/vehicles')
        .send(newVehiclePayload);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject CUSTOMER role from creating vehicle with 403', async () => {
      const res = await request(app)
        .post('/api/v1/vehicles')
        .set('Cookie', customerCookie)
        .send(newVehiclePayload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow ADMIN role to create vehicle', async () => {
      const res = await request(app)
        .post('/api/v1/vehicles')
        .set('Cookie', adminCookie)
        .send(newVehiclePayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.vehicle).toBeDefined();
      expect(res.body.data.vehicle.vehicleCode).toBe('TEST-ADMIN-001');
      // Admin response includes registration number
      expect(res.body.data.vehicle.registrationNumber).toBe('DL-01-AB-1234');
    });

    it('should reject CUSTOMER role from updating vehicle with 403', async () => {
      const res = await request(app)
        .patch('/api/v1/vehicles/TEST-ADMIN-001')
        .set('Cookie', customerCookie)
        .send({ name: 'Hacked Title' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow FLEET_MANAGER to update vehicle fields', async () => {
      const res = await request(app)
        .patch('/api/v1/vehicles/TEST-ADMIN-001')
        .set('Cookie', fleetManagerCookie)
        .send({
          rental: {
            baseRate: 4800,
            currency: 'INR'
          },
          status: 'MAINTENANCE'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.vehicle.rental.baseRate).toBe(4800);
      expect(res.body.data.vehicle.status).toBe('MAINTENANCE');
    });

    it('should reject CUSTOMER from deleting/retiring vehicle with 403', async () => {
      const res = await request(app)
        .delete('/api/v1/vehicles/TEST-ADMIN-001')
        .set('Cookie', customerCookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject FLEET_MANAGER from retiring vehicle (ADMIN only)', async () => {
      const res = await request(app)
        .delete('/api/v1/vehicles/TEST-ADMIN-001')
        .set('Cookie', fleetManagerCookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow ADMIN to soft-retire vehicle', async () => {
      const res = await request(app)
        .delete('/api/v1/vehicles/TEST-ADMIN-001')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.vehicle.status).toBe('RETIRED');

      // Verify that retired vehicle is excluded from public active list
      const listRes = await request(app)
        .get('/api/v1/vehicles')
        .query({ search: 'BMW M4 Competition' });

      expect(listRes.body.data.items.length).toBe(0);
    });

    it('should prevent non-admin from unretiring a RETIRED vehicle', async () => {
      const res = await request(app)
        .patch('/api/v1/vehicles/TEST-ADMIN-001')
        .set('Cookie', fleetManagerCookie)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Only administrators can reactivate');
    });
  });

  // --------------------------------------------------------------------------
  // 5. MASS ASSIGNMENT & SENSITIVE FIELD SECURITY
  // --------------------------------------------------------------------------
  describe('Mass Assignment & Security Protection', () => {
    it('should reject mass assignment attempts with 422 and preserve document', async () => {
      const created = await VehicleModel.findOne({ vehicleCode: 'SKY-VHC-003' });
      expect(created).toBeDefined();

      const originalCreatedAt = created!.createdAt.toISOString();
      const originalName = created!.name;

      const res = await request(app)
        .patch(`/api/v1/vehicles/${created!._id}`)
        .set('Cookie', adminCookie)
        .send({
          _id: new mongoose.Types.ObjectId().toString(),
          createdAt: new Date('2020-01-01').toISOString(),
          isDeleted: true,
          internalCost: 999999, // Unallowlisted field
          name: 'Updated Yamaha MT-15 V2'
        });

      // Strict validation rejected unexpected injected fields
      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);

      // Verify document in database was untouched
      const updated = await VehicleModel.findById(created!._id);
      expect(updated!.createdAt.toISOString()).toBe(originalCreatedAt);
      expect(updated!.name).toBe(originalName);
      expect((updated as any).internalCost).toBeUndefined();
    });

    it('should reject duplicate registration number update with 409', async () => {
      // SKY-VHC-001 has PB-10-HA-1001, SKY-VHC-002 has NY-02-OL-2002
      const res = await request(app)
        .patch('/api/v1/vehicles/SKY-VHC-002')
        .set('Cookie', adminCookie)
        .send({
          registrationNumber: 'PB-10-HA-1001'
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DUPLICATE_REGISTRATION');
    });
  });
});
