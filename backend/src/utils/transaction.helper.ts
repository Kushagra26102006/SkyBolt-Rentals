import mongoose, { ClientSession } from 'mongoose';

/**
 * Checks whether the active MongoDB connection topology supports multi-document transactions.
 * Transactions are only supported on Replica Sets and Sharded clusters.
 */
export function isTransactionSupported(): boolean {
  try {
    const client = mongoose.connection.getClient();
    const topologyType = (client as any)?.topology?.description?.type;
    return topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';
  } catch {
    return false;
  }
}

/**
 * Executes a critical multi-operation workflow with either native MongoDB transaction (if supported)
 * or atomic database operations backed by an automatic compensating rollback action on failure.
 */
export async function runWithTransactionOrCompensate<T>(
  action: (session: ClientSession | null) => Promise<T>,
  compensate: () => Promise<void>
): Promise<T> {
  const supportsTransactions = isTransactionSupported();

  if (supportsTransactions) {
    const session = await mongoose.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => {
        result = await action(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  // Standalone or non-replica set environment:
  // Execute directly and invoke compensating rollback if any subsequent step fails.
  try {
    return await action(null);
  } catch (error) {
    try {
      await compensate();
    } catch (compensateError) {
      console.error('[Compensating Action Failed]', compensateError);
    }
    throw error;
  }
}
