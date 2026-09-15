import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.config.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { loggingMiddleware } from './middleware/logging.middleware.js';
import { generalRateLimiter } from './middleware/rate-limit.middleware.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import { notFoundHandler, errorHandler } from './middleware/error.middleware.js';
import healthRouter from './routes/health.routes.js';
import apiRouter from './routes/index.js';
import chatbotRouter from './modules/chatbot/chatbot.routes.js';

export function createApp(): Express {
  const app = express();

  // 0. Production Reverse Proxy Trust Configuration (AWS ALB, Nginx, Cloudflare)
  app.set('trust proxy', 1);

  // 1. Root-Level Orchestrator Probes (Liveness & Readiness for K8s / Cloud Run / ALB)
  app.use('/', healthRouter);

  // 2. Security Headers (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows API to serve JSON without browser CSP interference
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
  );

  // 3. Strict CORS Configuration
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, server-to-server)
        if (!origin) {
          return callback(null, true);
        }
        if (
          config.corsOrigins.includes(origin) ||
          config.isDevelopment ||
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:')
        ) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-ID',
        'X-Requested-With',
        'X-CSRF-Token',
        'X-Session-ID',
        'X-Razorpay-Signature',
        'Idempotency-Key',
        'Accept'
      ],
      exposedHeaders: ['X-Request-ID'],
      credentials: true,
      maxAge: 600
    })
  );

  // 3. Body Parsers with Strict Size Limits (Preserving Raw Body for Webhook HMAC Verification)
  app.use(
    express.json({
      limit: config.requestBodyLimit,
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app.use(express.urlencoded({ extended: true, limit: config.requestBodyLimit }));

  // 4. Secure Cookie Parsing for Session Management
  app.use(cookieParser());

  // 5. Request Correlation ID
  app.use(requestIdMiddleware);

  // 6. Structured Request Logging
  app.use(loggingMiddleware);

  // 7. General Rate Limiting Foundation
  app.use(generalRateLimiter);

  // 8. CSRF Protection for Cookie Sessions
  app.use(csrfProtection);

  // 9. Mount API Routes (/api/v1)
  app.use(config.apiPrefix, apiRouter);
  app.use('/api/chat', chatbotRouter);

  // 8. 404 Not Found Handler
  app.use(notFoundHandler);

  // 9. Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
