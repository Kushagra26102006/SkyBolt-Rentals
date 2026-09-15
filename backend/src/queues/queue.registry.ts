import { Queue, QueueOptions } from 'bullmq';
import { getBullMQConnection, defaultJobOptions } from './queue.config.js';
import { config } from '../config/env.config.js';

export enum QueueName {
  NOTIFICATION = 'notification-queue',
  BOOKING = 'booking-queue',
  MAINTENANCE = 'maintenance-queue',
  RECONCILIATION = 'reconciliation-queue',
  RECOMMENDATION = 'recommendation-queue'
}

export interface QueueMetrics {
  name: string;
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

class QueueRegistry {
  private queues: Map<QueueName, Queue> = new Map();

  private getOrCreateQueue(name: QueueName): Queue {
    if (!this.queues.has(name)) {
      const options: QueueOptions = {
        connection: getBullMQConnection(),
        defaultJobOptions,
        prefix: config.redis.keyPrefix ? `${config.redis.keyPrefix}bull` : 'skybolt:bull'
      };

      const queue = new Queue(name, options);

      queue.on('error', (err) => {
        if (!config.isTest) {
          console.warn(`[SkyBolt Queue] Error on queue "${name}": ${err?.message}`);
        }
      });

      this.queues.set(name, queue);
    }

    return this.queues.get(name)!;
  }

  public getNotificationQueue(): Queue {
    return this.getOrCreateQueue(QueueName.NOTIFICATION);
  }

  public getBookingQueue(): Queue {
    return this.getOrCreateQueue(QueueName.BOOKING);
  }

  public getMaintenanceQueue(): Queue {
    return this.getOrCreateQueue(QueueName.MAINTENANCE);
  }

  public getReconciliationQueue(): Queue {
    return this.getOrCreateQueue(QueueName.RECONCILIATION);
  }

  public getRecommendationQueue(): Queue {
    return this.getOrCreateQueue(QueueName.RECOMMENDATION);
  }

  public getQueue(name: string): Queue | null {
    const validName = Object.values(QueueName).find((n) => n === name);
    if (!validName) return null;
    return this.getOrCreateQueue(validName);
  }

  public getAllQueues(): Queue[] {
    return Object.values(QueueName).map((name) => this.getOrCreateQueue(name));
  }

  public async getQueueMetrics(name: QueueName): Promise<QueueMetrics> {
    const queue = this.getOrCreateQueue(name);
    try {
      const [counts, isPaused] = await Promise.all([
        queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
        queue.isPaused()
      ]);

      return {
        name,
        queueName: name,
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
        paused: isPaused
      };
    } catch {
      return {
        name,
        queueName: name,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: false
      };
    }
  }

  public async getAllQueueMetrics(): Promise<QueueMetrics[]> {
    return await Promise.all(
      Object.values(QueueName).map((name) => this.getQueueMetrics(name))
    );
  }

  public async closeAllQueues(): Promise<void> {
    const closePromises = Array.from(this.queues.values()).map(async (queue) => {
      try {
        await queue.close();
      } catch {}
    });

    await Promise.all(closePromises);
    this.queues.clear();
  }
}

export const queueRegistry = new QueueRegistry();
export default queueRegistry;
