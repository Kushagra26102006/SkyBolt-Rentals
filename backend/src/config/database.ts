import mongoose from 'mongoose';
import { config } from './env.config.js';

export type DatabaseConnectionState =
  | 'disconnected'
  | 'connected'
  | 'connecting'
  | 'disconnecting'
  | 'uninitialized';

/**
 * Sanitize connection URI for safe logging (strips password/credentials)
 */
function sanitizeMongoUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    // If not standard URL format (e.g. invalid string), mask all before @
    return uri.replace(/:([^@]+)@/, ':****@');
  }
}

/**
 * Configure global Mongoose behaviors
 */
mongoose.set('strictQuery', true);

if (config.isDevelopment && config.logLevel === 'debug') {
  mongoose.set('debug', (collectionName, methodName, ...methodArgs) => {
    console.debug(`[Mongoose DEBUG] ${collectionName}.${methodName}(${JSON.stringify(methodArgs)})`);
  });
} else {
  mongoose.set('debug', false);
}

/**
 * Connect to MongoDB with production-grade pool and timeout options
 */
export async function connectDatabase(
  uriOverride?: string,
  optionsOverride?: Partial<mongoose.ConnectOptions>
): Promise<typeof mongoose> {
  const uri = uriOverride || config.database.uri;
  const sanitizedUri = sanitizeMongoUri(uri);

  // Return existing connection if already connected
  if (mongoose.connection.readyState === 1) {
    if (!config.isTest) {
      console.log(`[SkyBolt DB] Already connected to MongoDB at ${sanitizedUri}`);
    }
    return mongoose;
  }

  // Prevent multiple overlapping connection attempts
  if (mongoose.connection.readyState === 2) {
    if (!config.isTest) {
      console.log('[SkyBolt DB] Connection attempt already in progress. Awaiting...');
    }
    await new Promise((resolve) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', resolve);
    });
    return mongoose;
  }

  try {
    if (!config.isTest) {
      console.log(`[SkyBolt DB] Connecting to MongoDB at ${sanitizedUri}...`);
    }

    const conn = await mongoose.connect(uri, {
      dbName: config.database.dbName,
      maxPoolSize: config.database.maxPoolSize,
      minPoolSize: config.database.minPoolSize,
      serverSelectionTimeoutMS: config.database.timeoutMs,
      socketTimeoutMS: 45000,
      connectTimeoutMS: config.database.timeoutMs,
      heartbeatFrequencyMS: 10000,
      autoIndex: config.isDevelopment, // Disable automatic index building in production
      ...optionsOverride
    });

    if (!config.isTest) {
      console.log('✅ [SkyBolt DB] Successfully connected to MongoDB.');
    }

    return conn;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ [SkyBolt DB] Failed to connect to MongoDB:', errMsg);
    throw error;
  }
}

/**
 * Disconnect from MongoDB gracefully
 */
export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
      if (!config.isTest) {
        console.log('✅ [SkyBolt DB] MongoDB disconnected cleanly.');
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ [SkyBolt DB] Error during MongoDB disconnect:', errMsg);
      throw error;
    }
  }
}

/**
 * Check whether database is actively connected
 */
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Get readable connection status
 */
export function getDatabaseStatus(): DatabaseConnectionState {
  switch (mongoose.connection.readyState) {
    case 0:
      return 'disconnected';
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'uninitialized';
  }
}
