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
 * Sensitive key pattern for redacting secrets/credentials from debug logs
 */
const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|jwt|token|cookie|authorization|bearer|apikey|api_key|keysecret|webhooksecret|credentials?/i;

/**
 * Sanitize string values for safe logging (redacts connection strings, bearer tokens, etc.)
 */
function sanitizeStringValue(str: string): string {
  if (str.includes('mongodb://') || str.includes('mongodb+srv://')) {
    return sanitizeMongoUri(str);
  }
  if (str.startsWith('Bearer ')) {
    return 'Bearer [REDACTED]';
  }
  return str;
}

/**
 * Check whether a value is a MongoDB ClientSession or session-like object
 */
function isClientSession(val: any): boolean {
  if (!val || typeof val !== 'object') return false;
  const constructorName = val.constructor?.name;
  if (constructorName === 'ClientSession' || constructorName === 'ServerSession') {
    return true;
  }
  if (typeof val.withTransaction === 'function' && typeof val.endSession === 'function') {
    return true;
  }
  return false;
}

/**
 * Check whether a value is a MongoClient instance
 */
function isMongoClient(val: any): boolean {
  if (!val || typeof val !== 'object') return false;
  if (val.constructor?.name === 'MongoClient') {
    return true;
  }
  if (typeof val.connect === 'function' && typeof val.db === 'function' && 'topology' in val) {
    return true;
  }
  return false;
}

/**
 * Check whether a value is a BSON or Mongoose ObjectId
 */
function isObjectId(val: any): boolean {
  if (!val || typeof val !== 'object') return false;
  if (val instanceof mongoose.Types.ObjectId) return true;
  if (val._bsontype === 'ObjectId') return true;
  if (val.constructor?.name === 'ObjectId' && typeof val.toHexString === 'function') return true;
  return false;
}

/**
 * Recursively sanitizes a value for safe database debug logging.
 * Prevents throwing on circular structures, ClientSession, MongoClient, Mongoose docs, etc.
 */
export function sanitizeDatabaseDebugArg(
  val: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0
): unknown {
  try {
    if (val === null || val === undefined) {
      return val;
    }

    if (typeof val === 'string') {
      return sanitizeStringValue(val);
    }

    if (typeof val === 'number' || typeof val === 'boolean') {
      return val;
    }

    if (typeof val === 'bigint') {
      return val.toString();
    }

    if (typeof val === 'symbol') {
      return val.toString();
    }

    if (typeof val === 'function') {
      return `[Function: ${(val as Function).name || 'anonymous'}]`;
    }

    if (typeof val !== 'object') {
      return '[Unserializable]';
    }

    // Specific object classifications
    if (isClientSession(val)) {
      return '[ClientSession]';
    }

    if (isMongoClient(val)) {
      return '[MongoClient]';
    }

    if (isObjectId(val)) {
      return (val as any).toString();
    }

    if (val instanceof Date || Object.prototype.toString.call(val) === '[object Date]') {
      return isNaN((val as Date).getTime()) ? '[Invalid Date]' : (val as Date).toISOString();
    }

    if (val instanceof Error) {
      return {
        name: val.name || 'Error',
        message: val.message
      };
    }

    if (val instanceof RegExp) {
      return val.toString();
    }

    if (Buffer.isBuffer(val)) {
      return '[Buffer]';
    }

    // Guard against circular references and deep recursion
    if (seen.has(val)) {
      return '[Circular]';
    }

    if (depth > 10) {
      return '[MaxDepth]';
    }

    seen.add(val);

    // Mongoose Document handling: extract raw document to avoid serializing internal model state
    if ((val as any).$__ || (val as any)._doc) {
      try {
        const rawDoc =
          typeof (val as any).toObject === 'function'
            ? (val as any).toObject({ transform: false, virtuals: false, getters: false })
            : (val as any)._doc;
        return sanitizeDatabaseDebugArg(rawDoc, seen, depth + 1);
      } catch {
        return '[MongooseDocument]';
      }
    }

    if (Array.isArray(val)) {
      return val.map((item) => sanitizeDatabaseDebugArg(item, seen, depth + 1));
    }

    if (val instanceof Map) {
      const mapObj: Record<string, unknown> = {};
      for (const [k, v] of val.entries()) {
        const keyStr = String(k);
        if (SENSITIVE_KEY_PATTERN.test(keyStr)) {
          mapObj[keyStr] = '[REDACTED]';
        } else {
          mapObj[keyStr] = sanitizeDatabaseDebugArg(v, seen, depth + 1);
        }
      }
      return mapObj;
    }

    if (val instanceof Set) {
      return Array.from(val).map((item) => sanitizeDatabaseDebugArg(item, seen, depth + 1));
    }

    const sanitizedObj: Record<string, unknown> = {};
    const keys = Object.keys(val);
    for (const key of keys) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitizedObj[key] = '[REDACTED]';
        continue;
      }

      let propVal: unknown;
      try {
        propVal = (val as any)[key];
      } catch {
        sanitizedObj[key] = '[Unserializable]';
        continue;
      }

      // Explicitly replace session option in Mongoose query/options objects
      if (key === 'session' && propVal && typeof propVal === 'object') {
        sanitizedObj[key] = '[ClientSession]';
        continue;
      }

      // Explicitly replace client in options/objects
      if (key === 'client' && isMongoClient(propVal)) {
        sanitizedObj[key] = '[MongoClient]';
        continue;
      }

      try {
        sanitizedObj[key] = sanitizeDatabaseDebugArg(propVal, seen, depth + 1);
      } catch {
        sanitizedObj[key] = '[Unserializable]';
      }
    }

    return sanitizedObj;
  } catch {
    return '[Unserializable]';
  }
}

/**
 * Safely serializes Mongoose debug methodArgs without throwing on circular structures or sessions
 */
export function safeSerializeDatabaseDebugArgs(methodArgs: unknown[]): string {
  try {
    const sanitized = methodArgs.map((arg) => sanitizeDatabaseDebugArg(arg));
    const serialized = JSON.stringify(sanitized);
    return serialized ?? '[]';
  } catch {
    return '"[Unserializable]"';
  }
}

/**
 * Creates a safe Mongoose debug logging handler that will NEVER throw or break database operations
 */
export function createMongooseDebugHandler(
  logger: (message: string) => void = console.debug
): (collectionName: string, methodName: string, ...methodArgs: unknown[]) => void {
  return (collectionName: string, methodName: string, ...methodArgs: unknown[]): void => {
    try {
      const serializedArgs = safeSerializeDatabaseDebugArgs(methodArgs);
      logger(`[Mongoose DEBUG] ${collectionName}.${methodName}(${serializedArgs})`);
    } catch {
      // The debug logger must NEVER throw under any condition
      try {
        logger(`[Mongoose DEBUG] ${collectionName}.${methodName}("[Unserializable]")`);
      } catch {
        // Suppress any console/logger failure
      }
    }
  };
}

/**
 * Configures Mongoose debug logging
 */
export function configureMongooseDebug(
  enabled: boolean = config.logLevel === 'debug',
  logger: (message: string) => void = console.debug
): void {
  if (enabled) {
    mongoose.set('debug', createMongooseDebugHandler(logger));
  } else {
    mongoose.set('debug', false);
  }
}

/**
 * Configure global Mongoose behaviors
 */
mongoose.set('strictQuery', true);

if (config.logLevel === 'debug') {
  configureMongooseDebug(true);
} else {
  configureMongooseDebug(false);
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
