import { config } from '../config/env.config.js';
import { getDatabaseStatus, isDatabaseConnected, DatabaseConnectionState } from '../config/database.js';
import { isRedisConnected } from '../config/redis.js';

export interface HealthCheckData {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  environment: string;
  version: string;
  database: DatabaseConnectionState;
  redis: {
    status: 'healthy' | 'unhealthy' | 'disabled';
    connected: boolean;
  };
}

export interface LivenessData {
  status: 'ok';
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadinessData {
  ready: boolean;
  database: DatabaseConnectionState;
  redis: {
    status: 'healthy' | 'unhealthy' | 'disabled';
    connected: boolean;
  };
  timestamp: string;
}

export class HealthService {
  /**
   * General Health Probe (Liveness + Overall System Health)
   */
  public static getHealth(): HealthCheckData {
    const isDbConnected = isDatabaseConnected();
    const redisConnected = isRedisConnected();
    const redisEnabled = config.cache.enabled || config.queues.enabled;

    return {
      status: isDbConnected ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      version: '1.0.0',
      database: getDatabaseStatus(),
      redis: {
        status: !redisEnabled ? 'disabled' : (redisConnected ? 'healthy' : 'unhealthy'),
        connected: redisConnected
      }
    };
  }

  /**
   * Kubernetes / Container Liveness Probe (Process is alive)
   */
  public static getLiveness(): LivenessData {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Kubernetes / Container Readiness Probe (Can safely accept customer traffic)
   */
  public static getReadiness(): ReadinessData {
    const redisConnected = isRedisConnected();
    const redisEnabled = config.cache.enabled || config.queues.enabled;

    return {
      ready: isDatabaseConnected(),
      database: getDatabaseStatus(),
      redis: {
        status: !redisEnabled ? 'disabled' : (redisConnected ? 'healthy' : 'unhealthy'),
        connected: redisConnected
      },
      timestamp: new Date().toISOString()
    };
  }
}
