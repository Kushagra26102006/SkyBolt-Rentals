import { Job } from 'bullmq';
import { VehicleModel } from '../../models/vehicle.model.js';
import { config } from '../../config/env.config.js';

export interface MaintenanceJobData {
  type: 'INSPECTION_CHECK' | 'SERVICE_DUE_CHECK';
  vehicleId?: string;
}

export async function processMaintenanceJob(job: Job<MaintenanceJobData>): Promise<any> {
  const { type, vehicleId } = job.data;

  if (!config.isTest) {
    console.log(`[SkyBolt Worker] Processing maintenance job ${job.id} (${type})`);
  }

  if (type === 'SERVICE_DUE_CHECK') {
    // Scan vehicles in MAINTENANCE or marked for inspection
    const count = await VehicleModel.countDocuments({
      status: 'MAINTENANCE',
      isDeleted: false
    });

    return { success: true, activeMaintenanceCount: count };
  }

  if (vehicleId) {
    const vehicle = await VehicleModel.findById(vehicleId).exec();
    return { success: true, vehicleId, status: vehicle?.status };
  }

  return { success: true };
}
