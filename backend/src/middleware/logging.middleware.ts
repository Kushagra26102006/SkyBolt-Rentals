import { Response, NextFunction } from 'express';
import { RequestWithId } from '../types/api.types.js';
import { config } from '../config/env.config.js';

export function loggingMiddleware(
  req: RequestWithId,
  res: Response,
  next: NextFunction
): void {
  // Don't log if in test environment
  if (config.isTest) {
    return next();
  }

  const start = req.startTime || Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logEntry = {
      timestamp: new Date().toISOString(),
      requestId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: duration,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    if (res.statusCode >= 500) {
      console.error('[SkyBolt API HTTP]', JSON.stringify(logEntry));
    } else if (res.statusCode >= 400) {
      console.warn('[SkyBolt API HTTP]', JSON.stringify(logEntry));
    } else if (config.logLevel === 'debug' || config.logLevel === 'info') {
      console.log('[SkyBolt API HTTP]', JSON.stringify(logEntry));
    }
  });

  next();
}
