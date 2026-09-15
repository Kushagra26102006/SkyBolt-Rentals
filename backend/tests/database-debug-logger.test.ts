import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { EphemeralMongoServer } from './helpers/test-database.js';
import {
  connectDatabase,
  disconnectDatabase,
  sanitizeDatabaseDebugArg,
  safeSerializeDatabaseDebugArgs,
  createMongooseDebugHandler,
  configureMongooseDebug
} from '../src/config/database.js';
import { VehicleModel } from '../src/models/vehicle.model.js';
import { UserModel } from '../src/models/user.model.js';
import { bookingService } from '../src/services/booking.service.js';
import { seedVehicles } from '../src/seeds/vehicle.seed.js';

describe('Mongoose Database Debug Logger & Safe Serialization', () => {
  let mongoServer: EphemeralMongoServer;
  let testMongoUri: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);
    await seedVehicles(true);
  }, 30000);

  afterAll(async () => {
    configureMongooseDebug(false);
    await disconnectDatabase().catch(() => {});
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  describe('Unit Serialization & Sanitization', () => {
    it('should sanitize circular structures without throwing', () => {
      const circularObj: any = { name: 'circular_test' };
      circularObj.self = circularObj;

      expect(() => {
        JSON.stringify(circularObj);
      }).toThrow(TypeError);

      const serialized = safeSerializeDatabaseDebugArgs([circularObj]);
      expect(serialized).not.toContain('Converting circular structure to JSON');
      expect(serialized).toContain('[Circular]');
      expect(serialized).toContain('circular_test');
    });

    it('should sanitize simulated MongoClient and ClientSession circular references', () => {
      // Replicate the exact production error structure:
      // --> starting at object with constructor 'MongoClient'
      // |     property 's' -> object with constructor 'Object'
      // |     property 'sessionPool' -> object with constructor 'ServerSessionPool'
      // --- property 'client' closes the circle
      function MongoClient(this: any) {
        this.s = { sessionPool: { client: this } };
      }
      function ClientSession(this: any, client: any) {
        this.client = client;
        this.id = { id: 'mock-session-id' };
      }

      const client = new (MongoClient as any)();
      const session = new (ClientSession as any)(client);

      const methodArgs = [
        { vehicleCode: 'SKY-VHC-001' },
        { session, returnDocument: 'after' }
      ];

      // Native JSON.stringify MUST throw on this structure
      expect(() => JSON.stringify(methodArgs)).toThrow(TypeError);

      // Safe serialization MUST NOT throw
      const serialized = safeSerializeDatabaseDebugArgs(methodArgs);
      expect(serialized).not.toContain('Converting circular structure to JSON');
      expect(serialized).toContain('[ClientSession]');
      expect(serialized).not.toContain('sessionPool');
    });

    it('should replace real Mongoose ClientSession with "[ClientSession]" marker', async () => {
      const session = await mongoose.startSession();
      try {
        const queryOptions = { session, upsert: true };

        // Ensure native JSON.stringify throws on real ClientSession
        expect(() => JSON.stringify(queryOptions)).toThrow();

        // Safe serialization must produce clean marker
        const serialized = safeSerializeDatabaseDebugArgs([queryOptions]);
        expect(serialized).toContain('"session":"[ClientSession]"');
        expect(serialized).toContain('"upsert":true');
      } finally {
        await session.endSession();
      }
    });

    it('should preserve BSON / Types.ObjectId as string', () => {
      const id = new Types.ObjectId('64b8a1c9e4b0a1a2b3c4d5e6');
      const sanitized = sanitizeDatabaseDebugArg(id);
      expect(sanitized).toBe('64b8a1c9e4b0a1a2b3c4d5e6');

      const serialized = safeSerializeDatabaseDebugArgs([{ _id: id }]);
      expect(serialized).toBe('[{"_id":"64b8a1c9e4b0a1a2b3c4d5e6"}]');
    });

    it('should preserve Date as ISO string', () => {
      const date = new Date('2026-09-15T12:00:00.000Z');
      const sanitized = sanitizeDatabaseDebugArg(date);
      expect(sanitized).toBe('2026-09-15T12:00:00.000Z');

      const invalidDate = new Date('invalid');
      const sanitizedInvalid = sanitizeDatabaseDebugArg(invalidDate);
      expect(sanitizedInvalid).toBe('[Invalid Date]');
    });

    it('should redact sensitive keys such as passwords, JWTs, tokens, cookies, secrets', () => {
      const payload = {
        password: 'superSecretPassword123!',
        jwtSecret: 'very_long_secret_key_value_string',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        authCookie: 'skybolt_auth=abc123xyz',
        apiKey: 'secret_key_123',
        normalField: 'safeValue'
      };

      const serialized = safeSerializeDatabaseDebugArgs([payload]);
      expect(serialized).not.toContain('superSecretPassword123!');
      expect(serialized).not.toContain('very_long_secret_key_value_string');
      expect(serialized).not.toContain('abc123xyz');
      expect(serialized).toContain('"normalField":"safeValue"');
      expect(serialized).toContain('"password":"[REDACTED]"');
      expect(serialized).toContain('"jwtSecret":"[REDACTED]"');
      expect(serialized).toContain('"token":"[REDACTED]"');
      expect(serialized).toContain('"authCookie":"[REDACTED]"');
      expect(serialized).toContain('"apiKey":"[REDACTED]"');
    });

    it('should mask connection strings containing credentials', () => {
      const uri = 'mongodb://app_user:SuperSecretPassword@127.0.0.1:27017/skybolt_db';
      const serialized = safeSerializeDatabaseDebugArgs([{ uri }]);
      expect(serialized).not.toContain('SuperSecretPassword');
      expect(serialized).toContain('****');
    });

    it('should handle throwing getters and throwing proxy objects gracefully with [Unserializable]', () => {
      const dangerousObj: any = {};
      Object.defineProperty(dangerousObj, 'poison', {
        get() {
          throw new Error('Explosive getter triggered');
        },
        enumerable: true
      });

      const serialized = safeSerializeDatabaseDebugArgs([dangerousObj]);
      expect(serialized).toContain('"poison":"[Unserializable]"');

      const evilProxy = new Proxy({}, {
        ownKeys() {
          throw new Error('Proxy crash');
        }
      });

      const proxySerialized = safeSerializeDatabaseDebugArgs([evilProxy]);
      expect(proxySerialized).toContain('[Unserializable]');
    });

    it('should serialize Error objects cleanly', () => {
      const err = new Error('Database query timed out');
      const sanitized: any = sanitizeDatabaseDebugArg(err);
      expect(sanitized).toHaveProperty('name', 'Error');
      expect(sanitized).toHaveProperty('message', 'Database query timed out');
    });
  });

  describe('Integration with Mongoose Operations & Sessions', () => {
    it('should log Mongoose operations without throwing when debug handler is active and session is provided', async () => {
      const loggedMessages: string[] = [];

      configureMongooseDebug(true, (msg) => {
        loggedMessages.push(msg);
      });

      const session = await mongoose.startSession();
      try {
        // Execute findOne with active ClientSession in query options
        const vehicle = await VehicleModel.findOne({ vehicleCode: 'SKY-VHC-001' })
          .setOptions({ session })
          .exec();

        expect(vehicle).toBeDefined();
        expect(vehicle?.vehicleCode).toBe('SKY-VHC-001');

        // Verify that debug logging ran and sanitized the session
        const debugLogsWithSession = loggedMessages.filter((msg) => msg.includes('[Mongoose DEBUG]'));
        expect(debugLogsWithSession.length).toBeGreaterThan(0);

        const sessionLog = debugLogsWithSession.find((msg) => msg.includes('[ClientSession]'));
        expect(sessionLog).toBeDefined();
        expect(sessionLog).not.toContain('Converting circular structure to JSON');
      } finally {
        await session.endSession();
        configureMongooseDebug(false);
      }
    });

    it('should not throw even if custom logger callback throws', () => {
      const crashingLogger = () => {
        throw new Error('stdout broken pipe');
      };

      const handler = createMongooseDebugHandler(crashingLogger);

      // Must not throw exception
      expect(() => {
        handler('bookings', 'insertOne', { id: 1 });
      }).not.toThrow();
    });
  });

  describe('Booking Creation with Active Mongoose Debug Logger', () => {
    it('should create booking successfully without 500 error while Mongoose debug logging is active', async () => {
      const debugLogs: string[] = [];
      configureMongooseDebug(true, (msg) => {
        debugLogs.push(msg);
      });

      // Create a test user
      const user = await UserModel.create({
        name: 'Debug Test Customer',
        email: `debug_customer_${Date.now()}@skybolt.test`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
        phone: `+91 99999${Math.floor(10000 + Math.random() * 90000)}`,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
        phoneVerified: true
      });

      const vehicle = await VehicleModel.findOne({ status: 'ACTIVE', isDeleted: false }).exec();
      expect(vehicle).toBeDefined();

      const pickupAt = new Date(Date.now() + 86400000 * 2).toISOString();
      const returnAt = new Date(Date.now() + 86400000 * 4).toISOString();

      // Attempt booking creation - this was failing with 500 circular structure in production
      const result = await bookingService.createBooking(user._id.toString(), {
        vehicleId: vehicle!._id.toString(),
        pickupAt,
        returnAt,
        notes: 'Testing debug logger circular safety'
      });

      expect(result).toBeDefined();
      expect(result.booking).toBeDefined();
      expect(result.booking.status).toBe('PENDING');
      expect(result.booking.bookingReference).toMatch(/^SKY-\d{8}-[A-F0-9]{6}$/);

      // Verify that Mongoose debug logged operations without any circular error
      const mongooseLogs = debugLogs.filter((m) => m.includes('[Mongoose DEBUG]'));
      expect(mongooseLogs.length).toBeGreaterThan(0);
      for (const log of mongooseLogs) {
        expect(log).not.toContain('Converting circular structure to JSON');
      }
    });
  });

  describe('Transaction & Compensation Resilience Verification', () => {
    it('should invoke compensating rollback when action fails in compensation mode', async () => {
      const { runWithTransactionOrCompensate } = await import('../src/utils/transaction.helper.js');

      let actionCalled = false;
      let compensateCalled = false;

      await expect(
        runWithTransactionOrCompensate(
          async (session) => {
            actionCalled = true;
            expect(session).toBeNull(); // Standalone test Mongo has no replica set
            throw new Error('Mid-flight failure in booking workflow');
          },
          async () => {
            compensateCalled = true;
          }
        )
      ).rejects.toThrow('Mid-flight failure in booking workflow');

      expect(actionCalled).toBe(true);
      expect(compensateCalled).toBe(true);
    });

    it('should execute successfully and return result in compensation mode when action succeeds', async () => {
      const { runWithTransactionOrCompensate } = await import('../src/utils/transaction.helper.js');

      let compensateCalled = false;
      const result = await runWithTransactionOrCompensate(
        async (session) => {
          expect(session).toBeNull();
          return { bookingId: 'test-123', status: 'CONFIRMED' };
        },
        async () => {
          compensateCalled = true;
        }
      );

      expect(result).toEqual({ bookingId: 'test-123', status: 'CONFIRMED' });
      expect(compensateCalled).toBe(false);
    });

    it('should execute Mongoose operations within simulated transaction session and log safely', async () => {
      const debugLogs: string[] = [];
      configureMongooseDebug(true, (msg) => {
        debugLogs.push(msg);
      });

      const session = await mongoose.startSession();
      try {
        // Simulate a transaction action passing session to Mongoose query
        const vehicle = await VehicleModel.findOne(
          { vehicleCode: 'SKY-VHC-001' },
          null,
          { session }
        ).exec();

        expect(vehicle).toBeDefined();

        // Check debug output
        const hasSessionLog = debugLogs.some((l) => l.includes('[ClientSession]'));
        expect(hasSessionLog).toBe(true);
        const hasCircularError = debugLogs.some((l) => l.includes('Converting circular structure to JSON'));
        expect(hasCircularError).toBe(false);
      } finally {
        await session.endSession();
        configureMongooseDebug(false);
      }
    });
  });
});
