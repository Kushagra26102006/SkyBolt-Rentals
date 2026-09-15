import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { UserModel } from '../src/models/user.model.js';
import { HubModel } from '../src/models/hub.model.js';
import { BookingModel } from '../src/models/booking.model.js';
import { FleetTransferModel } from '../src/models/fleet-transfer.model.js';
import { MaintenanceModel } from '../src/models/maintenance.model.js';
import { InspectionModel } from '../src/models/inspection.model.js';
import { AuditLogModel } from '../src/models/audit-log.model.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';

describe('TASK 11: Production Fleet Management & Hub Logistics Integration Suite', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;
  const app = createApp();

  let customerCookie: string;
  let staffCookie: string;
  let fleetManagerCookie: string;
  let adminCookie: string;

  let customerUserId: string;
  let staffUserId: string;
  let fleetManagerUserId: string;

  let hubAId: string;
  let hubBId: string;
  let fullCapacityHubId: string;
  let inactiveHubId: string;

  let testVehicleId: string;
  let testVehicle2Id: string;
  let retiredVehicleId: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    // Sync all indexes
    await Promise.all([
      VehicleModel.syncIndexes(),
      UserModel.syncIndexes(),
      HubModel.syncIndexes(),
      BookingModel.syncIndexes(),
      FleetTransferModel.syncIndexes(),
      MaintenanceModel.syncIndexes(),
      InspectionModel.syncIndexes(),
      AuditLogModel.syncIndexes()
    ]);

    await seedVehicles(true);

    // 1. Retrieve Seeded Logistics Hubs & Create Specialized Test Hubs
    const hubA = await HubModel.findOne({ code: 'HUB-BLR-01' });
    hubAId = hubA!._id.toString();

    const hubB = await HubModel.findOne({ code: 'HUB-DEL-01' }) || await HubModel.findOne({ code: 'HUB-LDH-01' });
    hubBId = hubB!._id.toString();

    const fullHub = await HubModel.create({
      name: 'Micro Depot',
      code: 'HUB-MICRO-99',
      city: 'Bengaluru',
      state: 'Karnataka',
      address: 'Outer Ring Road',
      postalCode: '560103',
      capacity: 1,
      operationalStatus: 'ACTIVE',
      currentVehicleCount: 0
    });
    fullCapacityHubId = fullHub._id.toString();

    const inactHub = await HubModel.create({
      name: 'Decommissioned Hub',
      code: 'HUB-OFFLINE-99',
      city: 'Bengaluru',
      state: 'Karnataka',
      address: 'Industrial Area Phase 1',
      postalCode: '560058',
      capacity: 20,
      operationalStatus: 'INACTIVE',
      currentVehicleCount: 0
    });
    inactiveHubId = inactHub._id.toString();

    // 2. Register Users & Roles
    const custRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Normal Customer',
        email: 'customer.fleet@skybolt.test',
        password: 'Password123!',
        phone: '+91 9100000001'
      });
    customerCookie = custRes.headers['set-cookie'][0];
    customerUserId = custRes.body.data.user.id;

    const staffRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Operations Staff',
        email: 'staff.fleet@skybolt.test',
        password: 'Password123!',
        phone: '+91 9100000002'
      });
    staffUserId = staffRes.body.data.user.id;
    await UserModel.updateOne({ _id: staffUserId }, { $set: { role: 'STAFF' } });
    const staffLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'staff.fleet@skybolt.test', password: 'Password123!' });
    staffCookie = staffLogin.headers['set-cookie'][0];

    const mgrRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Fleet Manager',
        email: 'manager.fleet@skybolt.test',
        password: 'Password123!',
        phone: '+91 9100000003'
      });
    fleetManagerUserId = mgrRes.body.data.user.id;
    await UserModel.updateOne({ _id: fleetManagerUserId }, { $set: { role: 'FLEET_MANAGER' } });
    const mgrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'manager.fleet@skybolt.test', password: 'Password123!' });
    fleetManagerCookie = mgrLogin.headers['set-cookie'][0];

    const adminRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Super Admin',
        email: 'admin.fleet@skybolt.test',
        password: 'Password123!',
        phone: '+91 9100000004'
      });
    await UserModel.updateOne({ _id: adminRes.body.data.user.id }, { $set: { role: 'ADMIN' } });
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin.fleet@skybolt.test', password: 'Password123!' });
    adminCookie = adminLogin.headers['set-cookie'][0];

    // Set up test vehicles
    const vehicles = await VehicleModel.find({ isDeleted: false }).limit(3);
    testVehicleId = vehicles[0]._id.toString();
    testVehicle2Id = vehicles[1]._id.toString();

    // Create a retired vehicle
    const retired = await VehicleModel.create({
      vehicleCode: 'SKY-RET-001',
      brand: 'Honda',
      model: 'Activa Old',
      name: 'Honda Activa Retired',
      year: 2018,
      category: 'SCOOTER',
      status: 'ACTIVE',
      fleetStatus: 'RETIRED',
      specifications: { seats: 2, transmission: 'AUTOMATIC', fuelType: 'PETROL' },
      rental: { baseRate: 400, currency: 'INR' },
      location: { name: 'Main Depot', city: 'Bengaluru' },
      images: [{ url: 'https://example.com/img.jpg', isPrimary: true }],
      isDeleted: false
    });
    retiredVehicleId = retired._id.toString();
  }, 30000);

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  }, 20000);

  // ==========================================================================
  // 1. LOGISTICS HUBS MANAGEMENT & CAPACITIES
  // ==========================================================================
  describe('1. Logistics Hubs Management', () => {
    it('should allow ADMIN / FLEET_MANAGER to create logistics hubs', async () => {
      const res = await request(app)
        .post('/api/v1/hubs')
        .set('Cookie', fleetManagerCookie)
        .send({
          name: 'Whitefield Hub',
          code: 'HUB-BLR-03',
          city: 'Bengaluru',
          state: 'Karnataka',
          capacity: 12,
          operationalStatus: 'ACTIVE',
          address: 'ITPL Main Road',
          postalCode: '560066'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('HUB-BLR-03');
    });

    it('should strictly enforce unique hub code (reject duplicates with 409)', async () => {
      const dupRes = await request(app)
        .post('/api/v1/hubs')
        .set('Cookie', adminCookie)
        .send({
          name: 'Duplicate Hub Code Test',
          code: 'HUB-BLR-01', // Already exists
          city: 'Bengaluru',
          state: 'Karnataka',
          address: 'Sample Address',
          postalCode: '560001',
          capacity: 5
        });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error.code).toBe('HUB_CODE_EXISTS');
    });

    it('should allow fetching all hubs and filter by status', async () => {
      const res = await request(app)
        .get('/api/v1/hubs?operationalStatus=ACTIVE')
        .set('Cookie', staffCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((h: any) => h.id === hubAId)).toBe(true);
      expect(res.body.data.every((h: any) => h.operationalStatus === 'ACTIVE')).toBe(true);
    });

    it('should allow updating hub operational status', async () => {
      const res = await request(app)
        .patch(`/api/v1/hubs/${hubBId}`)
        .set('Cookie', fleetManagerCookie)
        .send({
          operationalStatus: 'TEMPORARILY_CLOSED',
          notes: 'Facility maintenance under progress'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.operationalStatus).toBe('TEMPORARILY_CLOSED');

      // Re-activate
      await request(app)
        .patch(`/api/v1/hubs/${hubBId}`)
        .set('Cookie', fleetManagerCookie)
        .send({ operationalStatus: 'ACTIVE' });
    });
  });

  // ==========================================================================
  // 2. VEHICLE-TO-HUB ASSIGNMENT & CAPACITY ENFORCEMENT
  // ==========================================================================
  describe('2. Vehicle to Hub Assignment', () => {
    it('should assign a vehicle to an active hub and increment vehicle count', async () => {
      const res = await request(app)
        .post(`/api/v1/fleet/${testVehicleId}/hub`)
        .set('Cookie', staffCookie)
        .send({ hubId: hubAId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.vehicle.currentHubId).toBe(hubAId);

      const hubA = await HubModel.findById(hubAId);
      expect(hubA?.currentVehicleCount).toBe(1);
    });

    it('should reject assigning to an INACTIVE hub with HUB_INACTIVE', async () => {
      const res = await request(app)
        .post(`/api/v1/fleet/${testVehicle2Id}/hub`)
        .set('Cookie', staffCookie)
        .send({ hubId: inactiveHubId });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('HUB_INACTIVE');
    });

    it('should reject assigning a RETIRED vehicle with VEHICLE_RETIRED', async () => {
      const res = await request(app)
        .post(`/api/v1/fleet/${retiredVehicleId}/hub`)
        .set('Cookie', staffCookie)
        .send({ hubId: hubAId });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('VEHICLE_RETIRED');
    });

    it('should enforce hub capacity atomically (HUB_CAPACITY_REACHED)', async () => {
      // Micro depot has capacity = 1
      // Assign testVehicle2Id to Micro Depot
      const res1 = await request(app)
        .post(`/api/v1/fleet/${testVehicle2Id}/hub`)
        .set('Cookie', staffCookie)
        .send({ hubId: fullCapacityHubId });

      expect(res1.status).toBe(200);

      // Now Micro Depot is at capacity (1/1)
      // Try assigning another vehicle to Micro Depot
      const res2 = await request(app)
        .post(`/api/v1/fleet/${testVehicleId}/hub`)
        .set('Cookie', staffCookie)
        .send({ hubId: fullCapacityHubId });

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('HUB_CAPACITY_REACHED');
    });

    it('should decrement previous hub count when vehicle moves directly to another hub', async () => {
      // testVehicle2Id is currently in fullCapacityHubId (count 1)
      // Move testVehicle2Id to Hub A
      const res = await request(app)
        .post(`/api/v1/fleet/${testVehicle2Id}/hub`)
        .set('Cookie', staffCookie)
        .send({ hubId: hubAId });

      expect(res.status).toBe(200);

      const microHub = await HubModel.findById(fullCapacityHubId);
      expect(microHub?.currentVehicleCount).toBe(0); // Freed up slot!

      const hubA = await HubModel.findById(hubAId);
      expect(hubA?.currentVehicleCount).toBe(2);
    });
  });

  // ==========================================================================
  // 3. FLEET LISTING, READINESS EVALUATION & AUDIT TRAIL
  // ==========================================================================
  describe('3. Fleet Listing, Readiness, & Audit Trail', () => {
    it('should allow privileged staff to query fleet inventory with filters', async () => {
      const res = await request(app)
        .get('/api/v1/fleet?limit=10&page=1')
        .set('Cookie', staffCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBeGreaterThan(0);
    });

    it('should evaluate vehicle rental readiness correctly', async () => {
      // testVehicleId is AVAILABLE and assigned to Hub A (ACTIVE)
      const res = await request(app)
        .get(`/api/v1/fleet/${testVehicleId}/readiness`)
        .set('Cookie', staffCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.ready).toBe(true);
      expect(res.body.data.reasons).toHaveLength(0);
      expect(res.body.data.fleetStatus).toBe('AVAILABLE');
    });

    it('should report ready: false when vehicle is RETIRED', async () => {
      const res = await request(app)
        .get(`/api/v1/fleet/${retiredVehicleId}/readiness`)
        .set('Cookie', staffCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.ready).toBe(false);
      expect(res.body.data.reasons).toContain('VEHICLE_RETIRED');
    });

    it('should create audit log entries on operational mutations', async () => {
      // Transition testVehicleId to UNAVAILABLE
      const patchRes = await request(app)
        .patch(`/api/v1/fleet/${testVehicleId}/status`)
        .set('Cookie', fleetManagerCookie)
        .send({
          status: 'UNAVAILABLE',
          reason: 'Routine detailing & software update'
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.fleetStatus).toBe('UNAVAILABLE');

      // Check Audit Log
      const auditEntry = await AuditLogModel.findOne({
        entityId: testVehicleId,
        action: 'VEHICLE_STATUS_CHANGED'
      }).sort({ createdAt: -1 });

      expect(auditEntry).toBeDefined();
      expect((auditEntry?.previousState as any)?.fleetStatus).toBe('AVAILABLE');
      expect((auditEntry?.newState as any)?.fleetStatus).toBe('UNAVAILABLE');
      expect(auditEntry?.actorId.toString()).toBe(fleetManagerUserId);

      // Restore to AVAILABLE
      await request(app)
        .patch(`/api/v1/fleet/${testVehicleId}/status`)
        .set('Cookie', fleetManagerCookie)
        .send({ status: 'AVAILABLE' });
    });
  });

  // ==========================================================================
  // 4. VEHICLE INTER-HUB TRANSFER LIFECYCLE
  // ==========================================================================
  describe('4. Inter-Hub Vehicle Transfer Lifecycle', () => {
    let transferId: string;

    it('should initiate a transfer from current hub to destination hub', async () => {
      // testVehicleId is at Hub A. Initiate transfer to Hub B.
      const res = await request(app)
        .post(`/api/v1/fleet/${testVehicleId}/transfers`)
        .set('Cookie', staffCookie)
        .send({
          toHubId: hubBId,
          reason: 'Demand balancing for weekend peak',
          notes: 'Dispatched via logistics carrier'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('IN_TRANSIT');
      expect(res.body.data.fromHubId).toBe(hubAId);
      expect(res.body.data.toHubId).toBe(hubBId);
      transferId = res.body.data.id;

      // Vehicle fleetStatus should now be TRANSFER_PENDING
      const v = await VehicleModel.findById(testVehicleId);
      expect(v?.fleetStatus).toBe('TRANSFER_PENDING');

      // Hub A count decremented upon departure
      const hubA = await HubModel.findById(hubAId);
      expect(hubA?.currentVehicleCount).toBe(1); // was 2, now 1
    });

    it('should reject a second concurrent transfer on a vehicle already in transit', async () => {
      const res = await request(app)
        .post(`/api/v1/fleet/${testVehicleId}/transfers`)
        .set('Cookie', staffCookie)
        .send({
          toHubId: hubAId,
          reason: 'Conflicting transfer request'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('TRANSFER_CONFLICT');
    });

    it('should complete transfer, updating vehicle currentHubId and destination hub count', async () => {
      const res = await request(app)
        .patch(`/api/v1/fleet/transfers/${transferId}/complete`)
        .set('Cookie', staffCookie)
        .send({ notes: 'Arrived at Koramangala Hub safely, odometer checked' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');

      // Vehicle should now be stationed at Hub B and status back to AVAILABLE
      const v = await VehicleModel.findById(testVehicleId);
      expect(v?.currentHubId?.toString()).toBe(hubBId);
      expect(v?.fleetStatus).toBe('AVAILABLE');

      // Hub B count incremented
      const hubB = await HubModel.findById(hubBId);
      expect(hubB?.currentVehicleCount).toBe(1);
    });

    it('should handle transfer cancellation gracefully and restore vehicle to source hub', async () => {
      // Initiate a transfer of testVehicleId from Hub B to Hub A
      const initRes = await request(app)
        .post(`/api/v1/fleet/${testVehicleId}/transfers`)
        .set('Cookie', staffCookie)
        .send({
          toHubId: hubAId,
          reason: 'Transfer test to cancel'
        });

      expect(initRes.status).toBe(201);
      const cancelTransferId = initRes.body.data.id;

      const cancelRes = await request(app)
        .patch(`/api/v1/fleet/transfers/${cancelTransferId}/cancel`)
        .set('Cookie', staffCookie)
        .send({ reason: 'Carrier truck breakdown, returned to source hub' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');

      // Vehicle returned to Hub B and AVAILABLE
      const v = await VehicleModel.findById(testVehicleId);
      expect(v?.currentHubId?.toString()).toBe(hubBId);
      expect(v?.fleetStatus).toBe('AVAILABLE');

      const hubB = await HubModel.findById(hubBId);
      expect(hubB?.currentVehicleCount).toBe(1);
    });
  });

  // ==========================================================================
  // 5. MAINTENANCE & INSPECTION LIFECYCLES
  // ==========================================================================
  describe('5. Maintenance & Safety Inspection Lifecycle', () => {
    let maintenanceRecordId: string;

    it('should schedule and start maintenance, moving vehicle to MAINTENANCE status', async () => {
      const res = await request(app)
        .post(`/api/v1/fleet/${testVehicleId}/maintenance`)
        .set('Cookie', staffCookie)
        .send({
          type: 'ROUTINE',
          description: '10,000 km periodic engine oil, brake pads and fluid overhaul',
          priority: 'MEDIUM',
          serviceProvider: 'Authorized Honda Service Center'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('IN_PROGRESS');
      maintenanceRecordId = res.body.data.id;

      const v = await VehicleModel.findById(testVehicleId);
      expect(v?.fleetStatus).toBe('MAINTENANCE');
      expect(v?.maintenanceState?.inMaintenance).toBe(true);

      // Verify vehicle is NOT rentable now
      const readinessRes = await request(app)
        .get(`/api/v1/fleet/${testVehicleId}/readiness`)
        .set('Cookie', staffCookie);

      expect(readinessRes.body.data.ready).toBe(false);
      expect(readinessRes.body.data.reasons).toContain('VEHICLE_IN_MAINTENANCE');
    });

    it('should complete maintenance and transition vehicle to INSPECTION (not directly to AVAILABLE)', async () => {
      const res = await request(app)
        .patch(`/api/v1/fleet/maintenance/${maintenanceRecordId}/complete`)
        .set('Cookie', staffCookie)
        .send({
          cost: 2850,
          odometer: 10450,
          notes: 'Oil changed, brake pads replaced, spark plugs cleaned'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.cost).toBe(2850);

      const v = await VehicleModel.findById(testVehicleId);
      expect(v?.fleetStatus).toBe('INSPECTION');
      expect(v?.odometer).toBe(10450);

      // Verify vehicle is still NOT rentable while in INSPECTION
      const readinessRes = await request(app)
        .get(`/api/v1/fleet/${testVehicleId}/readiness`)
        .set('Cookie', staffCookie);

      expect(readinessRes.body.data.ready).toBe(false);
      expect(readinessRes.body.data.reasons).toContain('VEHICLE_IN_INSPECTION');
    });

    it('should return vehicle to MAINTENANCE if inspection FAILS', async () => {
      const res = await request(app)
        .post(`/api/v1/fleet/${testVehicleId}/inspections`)
        .set('Cookie', staffCookie)
        .send({
          inspectionType: 'POST_MAINTENANCE',
          result: 'FAILED',
          odometer: 10450,
          notes: 'Brake fluid level low; ABS indicator light staying on',
          checklists: {
            brakes: false,
            lights: true,
            tires: true,
            fluids: false,
            bodywork: true,
            documents: true
          }
        });

      expect(res.status).toBe(201);
      expect(res.body.data.result).toBe('FAILED');

      const v = await VehicleModel.findById(testVehicleId);
      expect(v?.fleetStatus).toBe('MAINTENANCE');
    });

    it('should restore vehicle to AVAILABLE when subsequent inspection PASSES', async () => {
      // First move from MAINTENANCE to INSPECTION after fixing fluid
      await request(app)
        .patch(`/api/v1/fleet/${testVehicleId}/status`)
        .set('Cookie', staffCookie)
        .send({ status: 'INSPECTION', reason: 'ABS sensor re-calibrated and fluid topped up' });

      const res = await request(app)
        .post(`/api/v1/fleet/${testVehicleId}/inspections`)
        .set('Cookie', staffCookie)
        .send({
          inspectionType: 'POST_MAINTENANCE',
          result: 'PASSED',
          odometer: 10450,
          notes: 'Full multi-point checklist cleared. Safe for rental.',
          checklists: {
            brakes: true,
            lights: true,
            tires: true,
            fluids: true,
            bodywork: true,
            documents: true
          }
        });

      expect(res.status).toBe(201);
      expect(res.body.data.result).toBe('PASSED');

      const v = await VehicleModel.findById(testVehicleId);
      expect(v?.fleetStatus).toBe('AVAILABLE');

      // Now readiness is restored!
      const readinessRes = await request(app)
        .get(`/api/v1/fleet/${testVehicleId}/readiness`)
        .set('Cookie', staffCookie);

      expect(readinessRes.body.data.ready).toBe(true);
    });
  });

  // ==========================================================================
  // 6. BOOKING & FLEET INTEGRATION SERVICE
  // ==========================================================================
  describe('6. Booking Lifecycle Integration', () => {
    let bookingId: string;

    it('should transition vehicle to ACTIVE_RENTAL upon booking pickup', async () => {
      // Create a confirmed booking for testVehicleId
      const confirmedBooking = await BookingModel.create({
        bookingReference: `SKY-TEST-${Date.now()}`,
        userId: new Types.ObjectId(customerUserId),
        vehicleId: new Types.ObjectId(testVehicleId),
        pickupAt: new Date(Date.now() + 3600000),
        returnAt: new Date(Date.now() + 86400000 * 2),
        pickupLocation: { name: 'Indiranagar Hub', locationId: hubAId },
        returnLocation: { name: 'Indiranagar Hub', locationId: hubAId },
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        pricingSnapshot: {
          currency: 'INR',
          baseAmount: 1500,
          subtotal: 3000,
          tax: 540,
          discount: 0,
          fees: 0,
          total: 3540,
          pricingVersion: 'v1_base'
        },
        vehicleSnapshot: {
          brand: 'Honda',
          model: 'City',
          image: 'https://example.com/honda.jpg',
          name: 'Honda City'
        }
      });
      bookingId = confirmedBooking._id.toString();

      const pickupRes = await request(app)
        .post(`/api/v1/fleet/bookings/${bookingId}/pickup`)
        .set('Cookie', staffCookie)
        .send({
          odometer: 10450,
          notes: 'Customer driver license verified and vehicle handed over'
        });

      expect(pickupRes.status).toBe(200);
      expect(pickupRes.body.success).toBe(true);
      expect(pickupRes.body.data.booking.status).toBe('ACTIVE');
      expect(pickupRes.body.data.vehicle.fleetStatus).toBe('ACTIVE_RENTAL');

      const v = await VehicleModel.findById(testVehicleId);
      expect(v?.fleetStatus).toBe('ACTIVE_RENTAL');
      expect(v?.activeBookingId?.toString()).toBe(bookingId);

      // Verify cannot rent while in ACTIVE_RENTAL
      const readinessRes = await request(app)
        .get(`/api/v1/fleet/${testVehicleId}/readiness`)
        .set('Cookie', staffCookie);

      expect(readinessRes.body.data.ready).toBe(false);
      expect(readinessRes.body.data.reasons).toContain('VEHICLE_IN_ACTIVE_RENTAL');
    });

    it('should transition vehicle to INSPECTION upon return and update odometer', async () => {
      const returnRes = await request(app)
        .post(`/api/v1/fleet/bookings/${bookingId}/return`)
        .set('Cookie', staffCookie)
        .send({
          odometer: 10620,
          notes: 'Vehicle returned on time with full fuel tank'
        });

      expect(returnRes.status).toBe(200);
      expect(returnRes.body.data.booking.status).toBe('COMPLETED');
      expect(returnRes.body.data.vehicle.fleetStatus).toBe('INSPECTION');

      const v = await VehicleModel.findById(testVehicleId);
      expect(v?.fleetStatus).toBe('INSPECTION');
      expect(v?.activeBookingId).toBeUndefined();
      expect(v?.odometer).toBe(10620);

      // Quick inspection to restore vehicle to AVAILABLE
      await request(app)
        .post(`/api/v1/fleet/${testVehicleId}/inspections`)
        .set('Cookie', staffCookie)
        .send({
          inspectionType: 'POST_RENTAL',
          result: 'PASSED',
          odometer: 10620,
          notes: 'Post-rental return inspection passed cleanly'
        });

      const restoredV = await VehicleModel.findById(testVehicleId);
      expect(restoredV?.fleetStatus).toBe('AVAILABLE');
    });
  });

  // ==========================================================================
  // 7. RBAC & SECURITY TESTS
  // ==========================================================================
  describe('7. RBAC & Security Boundaries', () => {
    it('should reject unauthenticated calls to fleet endpoints with 401', async () => {
      const res = await request(app).get('/api/v1/fleet');
      expect(res.status).toBe(401);
    });

    it('should reject standard customer from performing operational mutations (403)', async () => {
      const statusRes = await request(app)
        .patch(`/api/v1/fleet/${testVehicleId}/status`)
        .set('Cookie', customerCookie)
        .send({ status: 'MAINTENANCE' });
      expect(statusRes.status).toBe(403);
      expect(statusRes.body.error.code).toBe('FORBIDDEN');

      const assignRes = await request(app)
        .post(`/api/v1/fleet/${testVehicleId}/hub`)
        .set('Cookie', customerCookie)
        .send({ hubId: hubAId });
      expect(assignRes.status).toBe(403);

      const transferRes = await request(app)
        .post(`/api/v1/fleet/${testVehicleId}/transfers`)
        .set('Cookie', customerCookie)
        .send({ toHubId: hubAId });
      expect(transferRes.status).toBe(403);

      const mntRes = await request(app)
        .post(`/api/v1/fleet/${testVehicleId}/maintenance`)
        .set('Cookie', customerCookie)
        .send({ description: 'Test service' });
      expect(mntRes.status).toBe(403);
    });

    it('should return 422 for malformed request body data', async () => {
      const res = await request(app)
        .patch(`/api/v1/fleet/${testVehicleId}/status`)
        .set('Cookie', staffCookie)
        .send({ status: 'INVALID_STATUS_NAME' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
    });

    it('should return 404 for non-existent vehicle ID', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      const res = await request(app)
        .get(`/api/v1/fleet/${nonExistentId}/readiness`)
        .set('Cookie', staffCookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('VEHICLE_NOT_FOUND');
    });
  });

  // ==========================================================================
  // 8. CONCURRENCY & RACE CONDITIONS
  // ==========================================================================
  describe('8. Concurrency & Race Condition Safety', () => {
    it('should safely serialize parallel hub assignments when only 1 slot remains', async () => {
      // 1. Create a fresh single-capacity hub
      const singleCapHubRes = await request(app)
        .post('/api/v1/hubs')
        .set('Cookie', adminCookie)
        .send({
          name: 'Race Hub Spot',
          code: `HUB-RC-${Date.now().toString().slice(-6)}`,
          address: '45 Racecourse Road',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560001',
          capacity: 1,
          operationalStatus: 'ACTIVE'
        });

      expect(singleCapHubRes.status).toBe(201);
      const raceHubId = singleCapHubRes.body.data.id;

      // 2. Launch two simultaneous assignment requests for two different vehicles
      const [attempt1, attempt2] = await Promise.all([
        request(app)
          .post(`/api/v1/fleet/${testVehicleId}/hub`)
          .set('Cookie', staffCookie)
          .send({ hubId: raceHubId }),
        request(app)
          .post(`/api/v1/fleet/${testVehicle2Id}/hub`)
          .set('Cookie', staffCookie)
          .send({ hubId: raceHubId })
      ]);

      const statuses = [attempt1.status, attempt2.status].sort();

      // Exactly ONE must succeed (200), and the other must fail with capacity reached (409)
      expect(statuses).toEqual([200, 409]);

      const hubDoc = await HubModel.findById(raceHubId);
      expect(hubDoc?.currentVehicleCount).toBe(1);
    });
  });
});
