import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { EphemeralMongoServer } from './helpers/test-database.js';
import { EphemeralRedisServer } from './helpers/test-redis.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { connectRedis, closeRedis } from '../src/config/redis.js';
import { UserModel } from '../src/models/user.model.js';
import { AuditLogModel } from '../src/models/audit-log.model.js';
import { queueRegistry, QueueName } from '../src/queues/queue.registry.js';

describe('TASK 15: Admin Queue Monitoring, Job Retry & Security Suite', () => {
  let mongoServer: EphemeralMongoServer;
  let redisServer: EphemeralRedisServer;
  let redisUrl: string;
  let testMongoUri: string;
  const app = createApp();

  let customerCookie: string;
  let adminCookie: string;
  let adminUserId: string;

  beforeAll(async () => {
    mongoServer = new EphemeralMongoServer();
    testMongoUri = await mongoServer.start();
    await connectDatabase(testMongoUri);

    redisServer = new EphemeralRedisServer();
    redisUrl = await redisServer.start();
    process.env.REDIS_URL = redisUrl;
    await closeRedis();
    await connectRedis();

    await Promise.all([
      UserModel.syncIndexes(),
      AuditLogModel.syncIndexes()
    ]);

    // 1. Customer User
    const custRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Queue Customer',
        email: 'queue.customer@skybolt.test',
        password: 'Password123!',
        phone: '+91 9100000001'
      });
    customerCookie = custRes.headers['set-cookie'][0];

    // 2. Admin User
    const adminRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Super Queue Admin',
        email: 'queue.admin@skybolt.test',
        password: 'Password123!',
        phone: '+91 9100000002'
      });
    adminUserId = adminRes.body.data.user.id;
    await UserModel.updateOne({ _id: adminUserId }, { $set: { role: 'ADMIN' } });

    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'queue.admin@skybolt.test', password: 'Password123!' });
    adminCookie = adminLogin.headers['set-cookie'][0];
  });

  afterAll(async () => {
    await queueRegistry.closeAllQueues();
    await closeRedis();
    await redisServer.stop();
    await disconnectDatabase();
    await mongoServer.stop();
    delete process.env.REDIS_URL;
  });

  it('RBAC: Unauthenticated requests to /admin/queues return 401', async () => {
    const res = await request(app).get('/api/v1/admin/queues');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('RBAC: Non-admin users return 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/admin/queues')
      .set('Cookie', customerCookie);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('GET /admin/queues: Admin successfully accesses real-time queue metrics', async () => {
    const res = await request(app)
      .get('/api/v1/admin/queues')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(5);

    const queueNames = res.body.data.map((q: any) => q.queueName);
    expect(queueNames).toContain(QueueName.NOTIFICATION);
    expect(queueNames).toContain(QueueName.BOOKING);
    expect(queueNames).toContain(QueueName.MAINTENANCE);
    expect(queueNames).toContain(QueueName.RECONCILIATION);
    expect(queueNames).toContain(QueueName.RECOMMENDATION);
  });

  it('GET /admin/queues/:queueName/jobs: Paginated job list with sensitive payload redaction', async () => {
    const queue = queueRegistry.getNotificationQueue();
    // Add job with sensitive payload
    await queue.add('security-test-job', {
      user: 'test-user',
      password: 'super-secret-password',
      secretToken: 'jwt-token-12345'
    });

    const res = await request(app)
      .get(`/api/v1/admin/queues/${QueueName.NOTIFICATION}/jobs?status=waiting&page=1&limit=10`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta).toHaveProperty('page', 1);

    const sensitiveJob = res.body.data.find((j: any) => j.name === 'security-test-job');
    if (sensitiveJob) {
      expect(sensitiveJob.data.password).toBe('[REDACTED]');
      expect(sensitiveJob.data.secretToken).toBe('[REDACTED]');
      expect(sensitiveJob.data.user).toBe('test-user');
    }
  });

  it('POST /admin/queues/:queueName/jobs/:jobId/retry: Successfully retries job and logs audit trail', async () => {
    const queue = queueRegistry.getNotificationQueue();
    const job = await queue.add('retryable-test-job', { payload: 'hello' });

    const res = await request(app)
      .post(`/api/v1/admin/queues/${QueueName.NOTIFICATION}/jobs/${job.id}/retry`)
      .set('Cookie', adminCookie)
      .send({ reason: 'Admin retry test verification' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('RETRYING');

    // Verify audit log
    const auditRecord = await AuditLogModel.findOne({
      entityType: 'QUEUE_JOB',
      action: 'QUEUE_JOB_RETRY',
      entityId: job.id
    });
    expect(auditRecord).not.toBeNull();
    expect(auditRecord?.actorEmail).toBe('queue.admin@skybolt.test');
  });

  it('POST /admin/queues/:queueName/jobs/:jobId/clean: Safely clears job and logs audit trail', async () => {
    const queue = queueRegistry.getNotificationQueue();
    const job = await queue.add('clean-test-job', { payload: 'bye' });

    const res = await request(app)
      .post(`/api/v1/admin/queues/${QueueName.NOTIFICATION}/jobs/${job.id}/clean`)
      .set('Cookie', adminCookie)
      .send({ reason: 'Admin clean test verification' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify audit log
    const auditRecord = await AuditLogModel.findOne({
      entityType: 'QUEUE_JOB',
      action: 'QUEUE_JOB_CLEAN',
      entityId: job.id
    });
    expect(auditRecord).not.toBeNull();
  });

  it('Non-existent queue or job returns safe 404 error', async () => {
    const res1 = await request(app)
      .get('/api/v1/admin/queues/non-existent-queue/jobs')
      .set('Cookie', adminCookie);
    expect(res1.status).toBe(404);

    const res2 = await request(app)
      .post(`/api/v1/admin/queues/${QueueName.NOTIFICATION}/jobs/invalid-job-id-99999/retry`)
      .set('Cookie', adminCookie)
      .send({});
    expect(res2.status).toBe(404);
  });
});
