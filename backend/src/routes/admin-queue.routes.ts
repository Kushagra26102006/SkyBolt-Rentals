import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { queueRegistry } from '../queues/queue.registry.js';
import { auditService } from '../services/audit.service.js';
import { ApiError } from '../utils/api-error.js';

export const adminQueueRouter = Router();

adminQueueRouter.use(requireAuth);
adminQueueRouter.use(requireRole('ADMIN'));

/**
 * Sanitize job data to ensure secrets/tokens are never leaked to admin responses
 */
function sanitizeJobData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;

  const sensitiveKeys = ['password', 'secret', 'token', 'jwt', 'apikey', 'auth'];
  try {
    const copy = JSON.parse(JSON.stringify(data));
    const clean = (obj: Record<string, unknown>) => {
      for (const k of Object.keys(obj)) {
        if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) {
          obj[k] = '[REDACTED]';
        } else if (obj[k] && typeof obj[k] === 'object') {
          clean(obj[k] as Record<string, unknown>);
        }
      }
    };
    if (typeof copy === 'object' && copy !== null) {
      clean(copy as Record<string, unknown>);
    }
    return copy;
  } catch {
    return data;
  }
}

/**
 * GET /api/v1/admin/queues
 * Returns real-time metrics across all background queues
 */
adminQueueRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const metrics = await queueRegistry.getAllQueueMetrics();
    res.status(200).json({
      success: true,
      data: metrics
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/admin/queues/:queueName/jobs
 * Returns paginated jobs in a queue filtered by status
 */
adminQueueRouter.get('/:queueName/jobs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const queueName = req.params.queueName as string;
    const queue = queueRegistry.getQueue(queueName);
    if (!queue) {
      throw new ApiError(404, 'QUEUE_NOT_FOUND', `Queue "${queueName}" not found.`);
    }

    const statusParam = (req.query.status as string) || 'failed';
    const validStatuses = ['waiting', 'active', 'completed', 'failed', 'delayed'];
    const status = validStatuses.includes(statusParam) ? statusParam : 'failed';

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    const [jobs, totalCounts] = await Promise.all([
      queue.getJobs([status as any], start, end),
      queue.getJobCounts(status as any)
    ]);

    const total = totalCounts[status] || 0;

    const safeJobs = jobs.map((j) => ({
      id: j.id,
      name: j.name,
      data: sanitizeJobData(j.data),
      attemptsMade: j.attemptsMade,
      failedReason: j.failedReason || null,
      timestamp: j.timestamp,
      processedOn: j.processedOn || null,
      finishedOn: j.finishedOn || null
    }));

    res.status(200).json({
      success: true,
      data: safeJobs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        status
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/queues/:queueName/jobs/:jobId/retry
 * Re-queues a failed job for execution with audit logging
 */
adminQueueRouter.post('/:queueName/jobs/:jobId/retry', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const queueName = req.params.queueName as string;
    const jobId = req.params.jobId as string;

    const queue = queueRegistry.getQueue(queueName);
    if (!queue) {
      throw new ApiError(404, 'QUEUE_NOT_FOUND', `Queue "${queueName}" not found.`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      throw new ApiError(404, 'JOB_NOT_FOUND', `Job "${jobId}" not found in queue "${queueName}".`);
    }

    const state = await job.getState();
    if (state === 'failed' || state === 'completed') {
      await job.retry(state);
    } else if (state === 'delayed') {
      await job.promote();
    }

    await auditService.log(req.user!, 'QUEUE_JOB_RETRY', 'QUEUE_JOB', job.id || jobId, {
      reason: req.body.reason || 'Admin manually retried queue job',
      newState: { queue: queueName, jobId: job.id, attempts: job.attemptsMade, previousState: state }
    });

    res.status(200).json({
      success: true,
      message: `Job "${job.id}" has been re-queued for execution.`,
      data: {
        jobId: job.id,
        queueName,
        status: 'RETRYING'
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/queues/:queueName/jobs/:jobId/clean
 * Safely removes a job from the queue
 */
adminQueueRouter.post('/:queueName/jobs/:jobId/clean', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const queueName = req.params.queueName as string;
    const jobId = req.params.jobId as string;

    const queue = queueRegistry.getQueue(queueName);
    if (!queue) {
      throw new ApiError(404, 'QUEUE_NOT_FOUND', `Queue "${queueName}" not found.`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      throw new ApiError(404, 'JOB_NOT_FOUND', `Job "${jobId}" not found.`);
    }

    await job.remove();

    await auditService.log(req.user!, 'QUEUE_JOB_CLEAN', 'QUEUE_JOB', job.id || jobId, {
      reason: req.body.reason || 'Admin manually cleared queue job',
      previousState: { queue: queueName, jobId: job.id }
    });

    res.status(200).json({
      success: true,
      message: `Job "${job.id}" has been removed from queue.`
    });
  } catch (err) {
    next(err);
  }
});

export default adminQueueRouter;
