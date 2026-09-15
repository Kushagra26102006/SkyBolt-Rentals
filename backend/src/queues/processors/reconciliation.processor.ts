import { Job } from 'bullmq';
import { PaymentModel } from '../../models/payment.model.js';
import { config } from '../../config/env.config.js';

export interface ReconciliationJobData {
  type: 'PENDING_PAYMENT_SCAN';
  thresholdMinutes?: number;
}

export async function processReconciliationJob(job: Job<ReconciliationJobData>): Promise<any> {
  const thresholdMinutes = job.data.thresholdMinutes || 15;
  const staleThreshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);

  if (!config.isTest) {
    console.log(`[SkyBolt Worker] Processing payment reconciliation job ${job.id} (threshold: ${thresholdMinutes}m)`);
  }

  // Find payments stuck in PENDING status older than threshold
  const pendingPayments = await PaymentModel.find({
    status: 'PENDING',
    createdAt: { $lt: staleThreshold },
    isDeleted: false
  }).limit(50).exec();

  if (!config.isTest && pendingPayments.length > 0) {
    console.warn(`[SkyBolt Reconciliation] Identified ${pendingPayments.length} pending payments requiring verification.`);
  }

  return {
    success: true,
    scannedCount: pendingPayments.length,
    pendingIds: pendingPayments.map((p) => p._id.toString())
  };
}
