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
import { PaymentModel } from '../src/models/payment.model.js';
import { FleetTransferModel } from '../src/models/fleet-transfer.model.js';
import { MaintenanceModel } from '../src/models/maintenance.model.js';
import { InspectionModel } from '../src/models/inspection.model.js';
import { AuditLogModel } from '../src/models/audit-log.model.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';

describe('TASK 12: Production Admin Operational Dashboards Integration Suite', () => {
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
  let adminUserId: string;

  let testHubId: string;
  let inactiveHubId: string;
  let testVehicleId: string;
  let testBookingId: string;
  let testBookingRef: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    await Promise.all([
      VehicleModel.syncIndexes(),
      UserModel.syncIndexes(),
      HubModel.syncIndexes(),
      BookingModel.syncIndexes(),
      PaymentModel.syncIndexes(),
      FleetTransferModel.syncIndexes(),
      MaintenanceModel.syncIndexes(),
      InspectionModel.syncIndexes(),
      AuditLogModel.syncIndexes()
    ]);

    await seedVehicles(true);

    // 1. Create specialized hubs
    const activeHub = await HubModel.create({
      name: 'Central Bangalore Hub',
      code: 'HUB-TEST-01',
      city: 'Bengaluru',
      state: 'Karnataka',
      address: 'MG Road Depot',
      postalCode: '560001',
      capacity: 10,
      operationalStatus: 'ACTIVE',
      currentVehicleCount: 2
    });
    testHubId = activeHub._id.toString();

    const inactHub = await HubModel.create({
      name: 'Decommissioned Hub',
      code: 'HUB-INACT-02',
      city: 'Bengaluru',
      state: 'Karnataka',
      address: 'Old Airport Road',
      postalCode: '560008',
      capacity: 5,
      operationalStatus: 'INACTIVE',
      currentVehicleCount: 1 // Inactive hub with assigned vehicle (will trigger operational alert)
    });
    inactiveHubId = inactHub._id.toString();

    // 2. Register Users across RBAC Roles
    const custRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Normal Customer',
        email: 'customer.admin@skybolt.test',
        password: 'Password123!',
        phone: '+91 9200000001'
      });
    customerCookie = custRes.headers['set-cookie'][0];
    customerUserId = custRes.body.data.user.id;

    const staffRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Ground Staff',
        email: 'staff.admin@skybolt.test',
        password: 'Password123!',
        phone: '+91 9200000002'
      });
    staffUserId = staffRes.body.data.user.id;
    await UserModel.updateOne({ _id: staffUserId }, { $set: { role: 'STAFF' } });
    const staffLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'staff.admin@skybolt.test', password: 'Password123!' });
    staffCookie = staffLogin.headers['set-cookie'][0];

    const mgrRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Fleet Manager',
        email: 'manager.admin@skybolt.test',
        password: 'Password123!',
        phone: '+91 9200000003'
      });
    fleetManagerUserId = mgrRes.body.data.user.id;
    await UserModel.updateOne({ _id: fleetManagerUserId }, { $set: { role: 'FLEET_MANAGER' } });
    const mgrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'manager.admin@skybolt.test', password: 'Password123!' });
    fleetManagerCookie = mgrLogin.headers['set-cookie'][0];

    const adminRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Platform Administrator',
        email: 'superadmin.admin@skybolt.test',
        password: 'Password123!',
        phone: '+91 9200000004'
      });
    adminUserId = adminRes.body.data.user.id;
    await UserModel.updateOne({ _id: adminUserId }, { $set: { role: 'ADMIN' } });
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin.admin@skybolt.test', password: 'Password123!' });
    adminCookie = adminLogin.headers['set-cookie'][0];

    // 3. Find a test vehicle
    const vehicle = await VehicleModel.findOne({ status: 'ACTIVE' });
    testVehicleId = vehicle!._id.toString();
    vehicle!.currentHubId = new Types.ObjectId(testHubId);
    await vehicle!.save();

    // 4. Create an unhubbed vehicle to trigger unhubbed alert
    await VehicleModel.create({
      name: 'Unhubbed Scooter',
      vehicleCode: 'SKT-UNHUB-01',
      registrationNumber: 'KA03UN1234',
      brand: 'Ather',
      model: '450X',
      year: 2024,
      category: 'SCOOTER',
      status: 'ACTIVE',
      fleetStatus: 'AVAILABLE',
      currentHubId: null,
      location: { locationId: new Types.ObjectId().toString(), name: 'Indiranagar Hub', city: 'Bengaluru' },
      rental: { baseRate: 600, deposit: 2000, minHours: 4, lateFeePerHour: 100 },
      specifications: { fuelType: 'ELECTRIC', transmission: 'AUTOMATIC', seats: 2, mileage: '85 km/charge' },
      isDeleted: false
    });

    // 5. Create a test booking
    testBookingRef = `SB-ADM-${Date.now().toString(36).toUpperCase()}`;
    const testBooking = await BookingModel.create({
      bookingReference: testBookingRef,
      userId: new Types.ObjectId(customerUserId),
      vehicleId: new Types.ObjectId(testVehicleId),
      pickupAt: new Date(Date.now() + 86400000),
      returnAt: new Date(Date.now() + 86400000 * 3),
      pickupLocation: { locationId: 'HUB-TEST-01', name: 'Central Bangalore Hub', address: 'MG Road' },
      returnLocation: { locationId: 'HUB-TEST-01', name: 'Central Bangalore Hub', address: 'MG Road' },
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      pricingSnapshot: {
        baseRate: 2000,
        baseAmount: 4000,
        durationDays: 2,
        durationHours: 48,
        subtotal: 4000,
        discount: 0,
        taxes: { gst: 720 },
        securityDeposit: 3000,
        total: 7720,
        currency: 'INR'
      },
      vehicleSnapshot: {
        brand: vehicle!.brand,
        model: vehicle!.model,
        variant: vehicle!.variant || '',
        registrationNumber: vehicle!.registrationNumber || 'KA01AB1234',
        name: vehicle!.name,
        image: 'assets/images/hero-bg.webp'
      }
    });
    testBookingId = testBooking._id.toString();

    // 6. Create a captured payment
    await PaymentModel.create({
      paymentReference: `PAY-ADM-${Date.now().toString(36).toUpperCase()}`,
      bookingId: testBooking._id,
      userId: new Types.ObjectId(customerUserId),
      amount: 7720,
      amountPaise: 772000,
      currency: 'INR',
      status: 'CAPTURED',
      provider: 'RAZORPAY',
      providerOrderId: 'order_test_adm_123',
      providerPaymentId: 'pay_test_adm_123',
      signatureVerified: true
    });

    // 7. Create a stuck maintenance record (> 7 days ago) to trigger operational alert
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await MaintenanceModel.create({
      maintenanceNumber: 'MNT-STUCK-01',
      vehicleId: new Types.ObjectId(testVehicleId),
      type: 'REPAIR',
      description: 'Annual full engine overhaul',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      scheduledAt: eightDaysAgo,
      startedAt: eightDaysAgo,
      createdBy: new Types.ObjectId(staffUserId)
    });

    // 8. Create a failed inspection to trigger operational alert
    await InspectionModel.create({
      inspectionNumber: 'INS-FAIL-01',
      vehicleId: new Types.ObjectId(testVehicleId),
      inspectedBy: new Types.ObjectId(staffUserId),
      inspectionType: 'POST_RENTAL',
      odometer: 15000,
      result: 'FAILED',
      checklists: { brakes: false, lights: true, tires: true, fluids: true, bodywork: true, documents: true },
      issues: [{ item: 'brakes', severity: 'CRITICAL', notes: 'Front brake disc heavily worn' }],
      notes: 'Vehicle must remain grounded until brake caliper replacement.'
    });

    // 9. Create an overdue transfer (> 24h ago)
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await FleetTransferModel.create({
      transferNumber: 'TRF-OVERDUE-01',
      vehicleId: new Types.ObjectId(testVehicleId),
      fromHubId: new Types.ObjectId(testHubId),
      toHubId: new Types.ObjectId(inactiveHubId),
      status: 'IN_TRANSIT',
      initiatedBy: new Types.ObjectId(staffUserId),
      createdAt: twoDaysAgo
    });
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  });

  describe('1. Admin Access Control & RBAC Boundaries', () => {
    it('should reject unauthenticated request to overview with 401', async () => {
      const res = await request(app).get('/api/v1/admin/dashboard/overview');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject customer role accessing overview with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard/overview')
        .set('Cookie', [customerCookie]);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow staff role to access overview KPIs and operational alerts', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard/overview')
        .set('Cookie', [staffCookie]);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.vehicles).toBeDefined();
      expect(res.body.data.alerts).toBeDefined();
    });

    it('should reject staff role attempting to access user directory with 403 (Admin-only)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Cookie', [staffCookie]);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject staff role attempting to access payment ledger with 403 (Manager/Admin only)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/payments')
        .set('Cookie', [staffCookie]);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow fleet manager role to access payments ledger', async () => {
      const res = await request(app)
        .get('/api/v1/admin/payments')
        .set('Cookie', [fleetManagerCookie]);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow admin role full access to user directory and overview', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Cookie', [adminCookie]);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
    });
  });

  describe('2. Authoritative Overview KPIs & Operational Health Aggregations', () => {
    it('should calculate accurate authoritative vehicle, booking, and payment KPIs', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard/overview')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      const { vehicles, bookings, payments, hubs } = res.body.data;

      // Vehicles
      expect(vehicles.total).toBeGreaterThan(0);
      expect(vehicles.available).toBeGreaterThanOrEqual(1);

      // Bookings
      expect(bookings.total).toBeGreaterThanOrEqual(1);
      expect(bookings.confirmed).toBeGreaterThanOrEqual(1);

      // Payments
      expect(payments.total).toBeGreaterThanOrEqual(1);
      expect(payments.captured).toBeGreaterThanOrEqual(1);
      expect(payments.totalRevenueInr).toBeGreaterThanOrEqual(7720);

      // Hubs
      expect(hubs.total).toBeGreaterThanOrEqual(2);
      expect(hubs.active).toBeGreaterThanOrEqual(1);
    });

    it('should generate operational health alerts for stuck maintenance, failed inspections, overdue transfers, and unhubbed vehicles', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard/overview')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      const alerts = res.body.data.alerts;
      expect(alerts).toBeInstanceOf(Array);

      const alertTypes = alerts.map((a: any) => a.type);
      expect(alertTypes).toContain('VEHICLES_STUCK_IN_MAINTENANCE');
      expect(alertTypes).toContain('FAILED_INSPECTIONS');
      expect(alertTypes).toContain('TRANSFERS_OVERDUE');
      expect(alertTypes).toContain('INACTIVE_HUBS_WITH_VEHICLES');
      expect(alertTypes).toContain('VEHICLES_WITHOUT_HUBS');
    });
  });

  describe('3. Admin Booking Operations', () => {
    it('should list bookings with server pagination and filtering', async () => {
      const res = await request(app)
        .get('/api/v1/admin/bookings?page=1&limit=10&status=CONFIRMED')
        .set('Cookie', [staffCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.meta).toMatchObject({
        page: 1,
        limit: 10
      });
    });

    it('should allow searching bookings by booking reference', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/bookings?search=${testBookingRef}`)
        .set('Cookie', [staffCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].bookingReference).toBe(testBookingRef);
    });

    it('should protect customer privacy and NEVER expose password hashes or sensitive security tokens', async () => {
      const res = await request(app)
        .get('/api/v1/admin/bookings')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      const booking = res.body.data[0];
      expect(booking.customer).toBeDefined();
      expect(booking.customer.passwordHash).toBeUndefined();
      expect(booking.customer.password).toBeUndefined();
    });
  });

  describe('4. User Management & Privilege Safety Protections', () => {
    it('should allow admin to list users with search and pagination', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users?page=1&limit=20&search=Normal')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].email).toBe('customer.admin@skybolt.test');
      expect(res.body.data[0].passwordHash).toBeUndefined();
    });

    it('should allow admin to update a customer role to STAFF and record an audit log', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${customerUserId}/role`)
        .set('Cookie', [adminCookie])
        .send({
          role: 'STAFF',
          reason: 'Promoted to support ground fleet logistics operations'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('STAFF');

      // Verify authoritative database change
      const user = await UserModel.findById(customerUserId);
      expect(user?.role).toBe('STAFF');

      // Verify immutable audit log
      const auditLog = await AuditLogModel.findOne({
        action: 'USER_ROLE_UPDATED',
        entityId: customerUserId
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.actorEmail).toBe('superadmin.admin@skybolt.test');
      expect((auditLog?.previousState as any)?.role).toBe('CUSTOMER');
      expect((auditLog?.newState as any)?.role).toBe('STAFF');
    });

    it('should prevent admin from demoting or altering their own role (self-lockout protection)', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${adminUserId}/role`)
        .set('Cookie', [adminCookie])
        .send({
          role: 'CUSTOMER',
          reason: 'Accidental self-demotion attempt'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SELF_ROLE_CHANGE_BLOCKED');
    });

    it('should prevent admin from suspending their own account (self-lockout protection)', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${adminUserId}/status`)
        .set('Cookie', [adminCookie])
        .send({
          status: 'SUSPENDED',
          reason: 'Accidental self-suspension'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SELF_STATUS_CHANGE_BLOCKED');
    });

    it('should allow admin to update another user account status to SUSPENDED', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${customerUserId}/status`)
        .set('Cookie', [adminCookie])
        .send({
          status: 'SUSPENDED',
          reason: 'Policy violation pending review'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUSPENDED');

      const user = await UserModel.findById(customerUserId);
      expect(user?.status).toBe('SUSPENDED');
    });
  });

  describe('5. Operational Vehicle Operations Dossier', () => {
    it('should return aggregated vehicle dossier with readiness, maintenance, inspection, and transfer history', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/vehicles/${testVehicleId}/operations`)
        .set('Cookie', [staffCookie]);

      expect(res.status).toBe(200);
      const dossier = res.body.data;
      expect(dossier.vehicle).toBeDefined();
      expect(dossier.readiness).toBeDefined();
      expect(dossier.maintenanceHistory).toBeInstanceOf(Array);
      expect(dossier.inspectionHistory).toBeInstanceOf(Array);
      expect(dossier.transferHistory).toBeInstanceOf(Array);
      expect(dossier.bookingHistory).toBeInstanceOf(Array);
    });

    it('should return 404 for nonexistent vehicle dossier request', async () => {
      const fakeId = new Types.ObjectId().toString();
      const res = await request(app)
        .get(`/api/v1/admin/vehicles/${fakeId}/operations`)
        .set('Cookie', [staffCookie]);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('VEHICLE_NOT_FOUND');
    });
  });

  describe('6. Cross-Vehicle Operational Queues & Ledgers', () => {
    it('should list cross-vehicle maintenance records with priority and status filters', async () => {
      const res = await request(app)
        .get('/api/v1/admin/maintenance?status=IN_PROGRESS&priority=HIGH')
        .set('Cookie', [staffCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].maintenanceNumber).toBe('MNT-STUCK-01');
    });

    it('should list cross-vehicle inspections with result filter', async () => {
      const res = await request(app)
        .get('/api/v1/admin/inspections?result=FAILED')
        .set('Cookie', [staffCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].result).toBe('FAILED');
    });

    it('should list cross-hub transfers with status filter', async () => {
      const res = await request(app)
        .get('/api/v1/admin/transfers?status=IN_TRANSIT')
        .set('Cookie', [staffCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].status).toBe('IN_TRANSIT');
    });

    it('should list safe financial payment records without exposing payment credentials', async () => {
      const res = await request(app)
        .get('/api/v1/admin/payments?status=CAPTURED')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const payment = res.body.data[0];
      expect(payment.amount).toBe(7720);
      expect(payment.providerOrderId).toBe('order_test_adm_123');
      expect(payment.rawSignature).toBeUndefined();
      expect(payment.webhookSecret).toBeUndefined();
      expect(payment.keySecret).toBeUndefined();
    });

    it('should list platform audit logs with entityType and action filtering', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs?entityType=USER')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].entityType).toBe('USER');
    });
  });

  describe('7. Security Validation & Safe Page Size Enforcements', () => {
    it('should reject excessive page sizes exceeding 100 with 400 Bad Request', async () => {
      const res = await request(app)
        .get('/api/v1/admin/bookings?limit=500')
        .set('Cookie', [staffCookie]);

      expect([400, 422]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid ObjectId in user role update with 400', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/users/invalid-object-id/role')
        .set('Cookie', [adminCookie])
        .send({ role: 'STAFF' });

      expect(res.status).toBe(400);
    });
  });
});
