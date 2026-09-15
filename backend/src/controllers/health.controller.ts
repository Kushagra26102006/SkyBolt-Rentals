import { Request, Response } from 'express';
import { HealthService } from '../services/health.service.js';
import { sendSuccess } from '../utils/api-response.js';

export class HealthController {
  /**
   * GET /api/v1/health
   */
  public static getHealth(_req: Request, res: Response): void {
    const health = HealthService.getHealth();
    sendSuccess(res, health, 200, 'SkyBolt Rentals API is healthy');
  }

  /**
   * GET /api/v1/health/live (Process liveness probe)
   */
  public static getLiveness(_req: Request, res: Response): void {
    const liveness = HealthService.getLiveness();
    sendSuccess(res, liveness, 200, 'Process is live');
  }

  /**
   * GET /api/v1/health/ready (Readiness probe: Database connectivity)
   */
  public static getReadiness(_req: Request, res: Response): void {
    const readiness = HealthService.getReadiness();
    if (readiness.ready) {
      sendSuccess(res, readiness, 200, 'Service is ready to accept traffic');
    } else {
      res.status(503).json({
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Service is not ready: Database connection unavailable'
        },
        data: readiness
      });
    }
  }

  /**
   * GET /api/v1
   */
  public static getRoot(_req: Request, res: Response): void {
    const info = {
      name: 'SkyBolt Rentals API',
      version: '1.0.0',
      description: 'Production vehicle rental API foundation',
      status: 'active',
      docs: '/docs/API.md'
    };
    sendSuccess(res, info, 200, 'Welcome to SkyBolt Rentals API v1');
  }
}
