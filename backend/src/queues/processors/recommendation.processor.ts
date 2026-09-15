import { Job } from 'bullmq';
import { BookingModel } from '../../models/booking.model.js';
import { cacheService } from '../../services/cache.service.js';
import { config } from '../../config/env.config.js';

export interface RecommendationJobData {
  action: 'aggregate-popularity' | 'refresh-category-stats';
  initiatedBy?: string;
}

export async function processRecommendationJob(job: Job<RecommendationJobData>): Promise<{ success: boolean; message: string }> {
  const { action } = job.data;

  if (!config.isTest) {
    console.log(`[SkyBolt Recommendation Worker] Processing job ${job.id} for action "${action}"`);
  }

  switch (action) {
    case 'aggregate-popularity': {
      // 1. Calculate booking counts for each vehicle in the last 60 days
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const vehicleStats = await BookingModel.aggregate([
        {
          $match: {
            status: 'COMPLETED',
            isDeleted: false,
            createdAt: { $gte: sixtyDaysAgo }
          }
        },
        {
          $group: {
            _id: '$vehicleId',
            completedBookings: { $sum: 1 },
            lastBookedAt: { $max: '$createdAt' }
          }
        }
      ]);

      const popularityMap: Record<string, { bookingCount: number; lastBookedAt: string }> = {};
      vehicleStats.forEach((stat) => {
        if (stat._id) {
          popularityMap[String(stat._id)] = {
            bookingCount: stat.completedBookings || 0,
            lastBookedAt: stat.lastBookedAt ? stat.lastBookedAt.toISOString() : ''
          };
        }
      });

      // Cache popularity map in Redis for fast access during candidate scoring (24h TTL)
      await cacheService.set('rec:popularity_map', popularityMap, 86400);

      return {
        success: true,
        message: `Successfully aggregated popularity metrics for ${vehicleStats.length} vehicles.`
      };
    }

    case 'refresh-category-stats': {
      // Aggregate demand by vehicle category
      const categoryDemand = await BookingModel.aggregate([
        {
          $match: {
            status: { $in: ['COMPLETED', 'CONFIRMED', 'ACTIVE'] },
            isDeleted: false
          }
        },
        {
          $lookup: {
            from: 'vehicles',
            localField: 'vehicleId',
            foreignField: '_id',
            as: 'vehicle'
          }
        },
        {
          $unwind: '$vehicle'
        },
        {
          $group: {
            _id: '$vehicle.category',
            totalBookings: { $sum: 1 }
          }
        }
      ]);

      const categoryStats: Record<string, number> = {};
      categoryDemand.forEach((item) => {
        if (item._id) {
          categoryStats[item._id] = item.totalBookings;
        }
      });

      await cacheService.set('rec:category_stats', categoryStats, 86400);

      return {
        success: true,
        message: `Successfully refreshed statistics for ${categoryDemand.length} categories.`
      };
    }

    default:
      return {
        success: false,
        message: `Unknown recommendation action: ${action}`
      };
  }
}
