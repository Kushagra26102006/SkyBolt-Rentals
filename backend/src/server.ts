import { app } from './app.js';
import { config } from './config/env.config.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { seedVehicles } from './seeds/vehicle.seed.js';
import { seedAdmin } from './seeds/admin.seed.js';
import { connectRedis, closeRedis } from './config/redis.js';
import { notificationWorker } from './notifications/notification.worker.js';
import { Server } from 'http';

let server: Server;
let isShuttingDown = false;

async function startServer(): Promise<void> {
  console.log('====================================================');
  console.log(`⚡ Initializing SkyBolt Rentals Backend Service...`);
  console.log(`🌐 Environment: ${config.nodeEnv}`);

  // 1. Establish MongoDB Connection
  try {
    await connectDatabase();
    await seedVehicles();
    await seedAdmin();
  } catch (dbError) {
    const errMsg = dbError instanceof Error ? dbError.message : String(dbError);
    console.error('\n❌ [SkyBolt Backend Startup] Database connection failure:', errMsg);
    console.error('💥 [SkyBolt Backend Fatal] MongoDB is required for authentication, bookings, and payments.');
    console.error('👉 Ensure MongoDB is running on port 27017 (e.g. `brew services start mongodb-community` or `mongod`). Exiting.\n');
    process.exit(1);
  }

  // 2. Establish Redis Connection (Non-blocking cache/queue layer)
  try {
    const redisConnected = await connectRedis();
    if (redisConnected) {
      console.log('✅ [SkyBolt Backend Startup] Redis connected for caching & background queues.');
    } else {
      console.warn('⚠️ [SkyBolt Backend Startup] Redis unavailable. Operating with MongoDB direct fallback.');
    }
  } catch (redisError) {
    const errMsg = redisError instanceof Error ? redisError.message : String(redisError);
    console.warn('⚠️ [SkyBolt Backend Startup] Redis connection error:', errMsg);
  }

  // 3. Start HTTP Server Listener
  server = app.listen(config.port, () => {
    console.log(`🚀 HTTP Server:  http://localhost:${config.port}`);
    console.log(`🔗 Health Check: http://localhost:${config.port}${config.apiPrefix}/health`);
    console.log(`📡 Liveness:    http://localhost:${config.port}${config.apiPrefix}/health/live`);
    console.log(`🚦 Readiness:   http://localhost:${config.port}${config.apiPrefix}/health/ready`);
    console.log(`📚 API Root:    http://localhost:${config.port}${config.apiPrefix}`);
    console.log('====================================================');
  });

  // 4. Start Notification Background Outbox Worker
  notificationWorker.start();
}

/**
 * Unified Graceful Shutdown Handler
 * Closes HTTP listener first, stops background workers, then disconnects MongoDB cleanly.
 */
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`\n🛑 [SkyBolt Backend] Received ${signal}. Initiating graceful shutdown...`);

  // Stop background worker immediately
  notificationWorker.stop();

  // Force exit safety timeout (10 seconds)
  const forceTimeout = setTimeout(() => {
    console.error('⚠️ [SkyBolt Backend] Forced shutdown timeout exceeded (10s). Terminating.');
    process.exit(1);
  }, 10000);
  forceTimeout.unref();

  // 1. Close HTTP listener to stop accepting new requests
  if (server) {
    await new Promise<void>((resolve) => {
      server.close((err) => {
        if (err) {
          console.error('❌ [SkyBolt Backend] Error closing HTTP server:', err);
        } else {
          console.log('✅ [SkyBolt Backend] HTTP server closed gracefully.');
        }
        resolve();
      });
    });
  }

  // 2. Disconnect Redis connection cleanly
  try {
    await closeRedis();
  } catch (redisErr) {
    console.error('❌ [SkyBolt Backend] Error closing Redis connection:', redisErr);
  }

  // 3. Disconnect MongoDB connection cleanly
  try {
    await disconnectDatabase();
  } catch (dbErr) {
    console.error('❌ [SkyBolt Backend] Error closing MongoDB connection:', dbErr);
  }

  clearTimeout(forceTimeout);
  console.log('🏁 [SkyBolt Backend] Graceful shutdown completed cleanly.');
  process.exit(0);
}

// Process signal listeners
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Uncaught fatal process error handlers
process.on('uncaughtException', (error: Error) => {
  console.error('💥 [SkyBolt Backend Fatal] Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('💥 [SkyBolt Backend Fatal] Unhandled Promise Rejection:', reason);
  gracefulShutdown('unhandledRejection');
});

startServer();
