import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from local .env and root .env fallback
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z
    .string()
    .default('5001')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val <= 65535, {
      message: 'PORT must be a valid port number between 1 and 65535'
    }),
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  API_PREFIX: z
    .string()
    .default('/api/v1')
    .refine((val) => val.startsWith('/'), {
      message: 'API_PREFIX must start with a forward slash "/"'
    }),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:8080,http://127.0.0.1:8080,http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('900000')
    .transform((val) => parseInt(val, 10)),
  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .default('100')
    .transform((val) => parseInt(val, 10)),
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('debug'),
  REQUEST_BODY_LIMIT: z
    .string()
    .default('1mb'),
  MONGODB_URI: z
    .string()
    .default('mongodb://localhost:27017/skybolt_rentals'),
  MONGODB_DB_NAME: z
    .string()
    .default('skybolt_rentals'),
  MONGODB_TIMEOUT_MS: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10)),
  MONGODB_MAX_POOL_SIZE: z
    .string()
    .default('10')
    .transform((val) => parseInt(val, 10)),
  MONGODB_MIN_POOL_SIZE: z
    .string()
    .default('2')
    .transform((val) => parseInt(val, 10)),
  JWT_SECRET: z
    .string()
    .default('development_super_secure_jwt_secret_key_minimum_32_characters_long')
    .refine((val) => val.length >= 32, {
      message: 'JWT_SECRET must be at least 32 characters long'
    }),
  JWT_EXPIRES_IN: z
    .string()
    .default('7d'),
  AUTH_COOKIE_NAME: z
    .string()
    .default('skybolt_auth'),
  AUTH_COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
  AUTH_COOKIE_SAME_SITE: z
    .enum(['lax', 'strict', 'none'])
    .default('lax'),
  AUTH_RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('900000')
    .transform((val) => parseInt(val, 10)),
  AUTH_RATE_LIMIT_MAX: z
    .string()
    .default('15')
    .transform((val) => parseInt(val, 10)),
  PASSWORD_RESET_EXPIRES_MS: z
    .string()
    .default('900000')
    .transform((val) => parseInt(val, 10)),
  BCRYPT_SALT_ROUNDS: z
    .string()
    .default('10')
    .transform((val) => parseInt(val, 10)),
  RAZORPAY_KEY_ID: z
    .string()
    .default('rzp_test_placeholder_key_id'),
  RAZORPAY_KEY_SECRET: z
    .string()
    .default('rzp_test_placeholder_key_secret'),
  RAZORPAY_WEBHOOK_SECRET: z
    .string()
    .default('rzp_test_placeholder_webhook_secret'),
  EMAIL_PROVIDER: z
    .enum(['mock', 'standard', 'resend', 'sendgrid'])
    .default('mock'),
  EMAIL_PROVIDER_API_KEY: z
    .string()
    .default(''),
  EMAIL_PROVIDER_FROM: z
    .string()
    .default('SkyBolt Rentals <notifications@skyboltrentals.com>'),
  SMS_PROVIDER: z
    .enum(['mock', 'standard', 'twilio'])
    .default('mock'),
  SMS_PROVIDER_API_KEY: z
    .string()
    .default(''),
  SMS_PROVIDER_ACCOUNT_SID: z
    .string()
    .default(''),
  SMS_PROVIDER_SENDER_ID: z
    .string()
    .default('SKYBOLT'),
  NOTIFICATION_OUTBOX_POLL_INTERVAL_MS: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10)),
  NOTIFICATION_MAX_RETRIES: z
    .string()
    .default('3')
    .transform((val) => parseInt(val, 10)),
  NOTIFICATION_RETRY_BASE_DELAY_MS: z
    .string()
    .default('1000')
    .transform((val) => parseInt(val, 10)),
  REDIS_URL: z
    .string()
    .optional(),
  REDIS_HOST: z
    .string()
    .default('127.0.0.1'),
  REDIS_PORT: z
    .string()
    .default('6379')
    .transform((val) => parseInt(val, 10)),
  REDIS_PASSWORD: z
    .string()
    .optional(),
  REDIS_KEY_PREFIX: z
    .string()
    .default('skybolt:'),
  REDIS_CONNECT_TIMEOUT_MS: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10)),
  CACHE_ENABLED: z
    .string()
    .default('true')
    .transform((val) => val.toLowerCase() === 'true'),
  QUEUE_ENABLED: z
    .string()
    .default('true')
    .transform((val) => val.toLowerCase() === 'true'),
  CACHE_DEFAULT_TTL_SECONDS: z
    .string()
    .default('300')
    .transform((val) => parseInt(val, 10)),
  AI_RECOMMENDATION_PROVIDER: z
    .enum(['mock', 'openai', 'gemini', 'anthropic', 'disabled'])
    .default('mock'),
  AI_RECOMMENDATION_API_KEY: z
    .string()
    .default(''),
  AI_RECOMMENDATION_MODEL: z
    .string()
    .default('gpt-4o-mini'),
  AI_RECOMMENDATION_TIMEOUT_MS: z
    .string()
    .default('2500')
    .transform((val) => parseInt(val, 10)),
  AI_RECOMMENDATION_MAX_CANDIDATES: z
    .string()
    .default('25')
    .transform((val) => parseInt(val, 10)),
  AI_RECOMMENDATION_RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('60000')
    .transform((val) => parseInt(val, 10)),
  AI_RECOMMENDATION_RATE_LIMIT_MAX: z
    .string()
    .default('20')
    .transform((val) => parseInt(val, 10)),
  RECOMMENDATION_CACHE_TTL_SECONDS: z
    .string()
    .default('180')
    .transform((val) => parseInt(val, 10)),
  GEMINI_API_KEY: z
    .string()
    .default(''),
  AI_PROVIDER: z
    .enum(['mock', 'openai', 'gemini'])
    .default('mock'),
  OPENAI_API_KEY: z
    .string()
    .default(''),
  OPENAI_MODEL: z
    .string()
    .default('gpt-4o-mini'),
  AI_MAX_TOKENS: z
    .string()
    .default('800')
    .transform((val) => parseInt(val, 10)),
  AI_TEMPERATURE: z
    .string()
    .default('0.2')
    .transform((val) => parseFloat(val)),
  AI_REQUEST_TIMEOUT_MS: z
    .string()
    .default('15000')
    .transform((val) => parseInt(val, 10)),
  AI_MAX_TOOL_CALLS: z
    .string()
    .default('5')
    .transform((val) => parseInt(val, 10)),
  AI_MAX_MESSAGE_LENGTH: z
    .string()
    .default('2000')
    .transform((val) => parseInt(val, 10)),
  CHAT_RATE_LIMIT_GUEST: z
    .string()
    .default('10')
    .transform((val) => parseInt(val, 10)),
  CHAT_RATE_LIMIT_AUTH: z
    .string()
    .default('30')
    .transform((val) => parseInt(val, 10))
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ [SkyBolt Backend Config] Invalid Environment Variables:');
  parsedEnv.error.issues.forEach((issue) => {
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
  });
  throw new Error('[SkyBolt Backend Config] Missing or invalid environment configuration.');
}

// Production safety check for secrets - strict fail-fast enforcement
if (parsedEnv.data.NODE_ENV === 'production') {
  if (
    !parsedEnv.data.JWT_SECRET ||
    parsedEnv.data.JWT_SECRET === 'development_super_secure_jwt_secret_key_minimum_32_characters_long' ||
    parsedEnv.data.JWT_SECRET.length < 32
  ) {
    throw new Error('[SkyBolt Backend Fatal] Cannot start in production with default or insecure JWT_SECRET.');
  }

  if (
    !parsedEnv.data.RAZORPAY_KEY_ID ||
    parsedEnv.data.RAZORPAY_KEY_ID === 'rzp_test_placeholder_key_id' ||
    !parsedEnv.data.RAZORPAY_KEY_SECRET ||
    parsedEnv.data.RAZORPAY_KEY_SECRET === 'rzp_test_placeholder_key_secret' ||
    !parsedEnv.data.RAZORPAY_WEBHOOK_SECRET ||
    parsedEnv.data.RAZORPAY_WEBHOOK_SECRET === 'rzp_test_placeholder_webhook_secret'
  ) {
    throw new Error('[SkyBolt Backend Fatal] Cannot start in production with missing or placeholder Razorpay credentials.');
  }

  if (
    parsedEnv.data.MONGODB_URI.includes('localhost') ||
    parsedEnv.data.MONGODB_URI.includes('127.0.0.1')
  ) {
    throw new Error('[SkyBolt Backend Fatal] Cannot start in production connected to local standalone MongoDB.');
  }
}

export const config = {
  port: parsedEnv.data.PORT,
  nodeEnv: parsedEnv.data.NODE_ENV,
  isProduction: parsedEnv.data.NODE_ENV === 'production',
  isStaging: parsedEnv.data.NODE_ENV === 'staging',
  isDevelopment: parsedEnv.data.NODE_ENV === 'development',
  isTest: parsedEnv.data.NODE_ENV === 'test',
  apiPrefix: parsedEnv.data.API_PREFIX,
  corsOrigins: parsedEnv.data.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
  rateLimit: {
    windowMs: parsedEnv.data.RATE_LIMIT_WINDOW_MS,
    maxRequests: parsedEnv.data.RATE_LIMIT_MAX_REQUESTS
  },
  logLevel: parsedEnv.data.LOG_LEVEL,
  requestBodyLimit: parsedEnv.data.REQUEST_BODY_LIMIT,
  database: {
    uri: parsedEnv.data.MONGODB_URI,
    dbName: parsedEnv.data.MONGODB_DB_NAME,
    timeoutMs: parsedEnv.data.MONGODB_TIMEOUT_MS,
    maxPoolSize: parsedEnv.data.MONGODB_MAX_POOL_SIZE,
    minPoolSize: parsedEnv.data.MONGODB_MIN_POOL_SIZE
  },
  auth: {
    jwtSecret: parsedEnv.data.JWT_SECRET,
    jwtExpiresIn: parsedEnv.data.JWT_EXPIRES_IN,
    cookieName: parsedEnv.data.AUTH_COOKIE_NAME,
    cookieSecure: parsedEnv.data.NODE_ENV === 'production' ? true : parsedEnv.data.AUTH_COOKIE_SECURE,
    cookieSameSite: parsedEnv.data.AUTH_COOKIE_SAME_SITE,
    rateLimit: {
      windowMs: parsedEnv.data.AUTH_RATE_LIMIT_WINDOW_MS,
      max: parsedEnv.data.AUTH_RATE_LIMIT_MAX
    },
    passwordResetExpiresMs: parsedEnv.data.PASSWORD_RESET_EXPIRES_MS,
    bcryptSaltRounds: parsedEnv.data.BCRYPT_SALT_ROUNDS
  },
  razorpay: {
    keyId: parsedEnv.data.RAZORPAY_KEY_ID,
    keySecret: parsedEnv.data.RAZORPAY_KEY_SECRET,
    webhookSecret: parsedEnv.data.RAZORPAY_WEBHOOK_SECRET
  },
  notifications: {
    emailProvider: parsedEnv.data.EMAIL_PROVIDER,
    emailApiKey: parsedEnv.data.EMAIL_PROVIDER_API_KEY,
    emailFrom: parsedEnv.data.EMAIL_PROVIDER_FROM,
    smsProvider: parsedEnv.data.SMS_PROVIDER,
    smsApiKey: parsedEnv.data.SMS_PROVIDER_API_KEY,
    smsAccountSid: parsedEnv.data.SMS_PROVIDER_ACCOUNT_SID,
    smsSenderId: parsedEnv.data.SMS_PROVIDER_SENDER_ID,
    outboxPollIntervalMs: parsedEnv.data.NOTIFICATION_OUTBOX_POLL_INTERVAL_MS,
    maxRetries: parsedEnv.data.NOTIFICATION_MAX_RETRIES,
    retryBaseDelayMs: parsedEnv.data.NOTIFICATION_RETRY_BASE_DELAY_MS
  },
  redis: {
    url: parsedEnv.data.REDIS_URL,
    host: parsedEnv.data.REDIS_HOST,
    port: parsedEnv.data.REDIS_PORT,
    password: parsedEnv.data.REDIS_PASSWORD,
    keyPrefix: parsedEnv.data.REDIS_KEY_PREFIX,
    connectTimeoutMs: parsedEnv.data.REDIS_CONNECT_TIMEOUT_MS
  },
  cache: {
    enabled: parsedEnv.data.CACHE_ENABLED,
    defaultTtlSeconds: parsedEnv.data.CACHE_DEFAULT_TTL_SECONDS
  },
  queues: {
    enabled: parsedEnv.data.QUEUE_ENABLED
  },
  recommendations: {
    provider: parsedEnv.data.AI_RECOMMENDATION_PROVIDER,
    apiKey: parsedEnv.data.AI_RECOMMENDATION_API_KEY || parsedEnv.data.GEMINI_API_KEY,
    geminiApiKey: parsedEnv.data.GEMINI_API_KEY || parsedEnv.data.AI_RECOMMENDATION_API_KEY,
    model: parsedEnv.data.AI_RECOMMENDATION_MODEL,
    timeoutMs: parsedEnv.data.AI_RECOMMENDATION_TIMEOUT_MS,
    maxCandidates: parsedEnv.data.AI_RECOMMENDATION_MAX_CANDIDATES,
    rateLimit: {
      windowMs: parsedEnv.data.AI_RECOMMENDATION_RATE_LIMIT_WINDOW_MS,
      max: parsedEnv.data.AI_RECOMMENDATION_RATE_LIMIT_MAX
    },
    cacheTtlSeconds: parsedEnv.data.RECOMMENDATION_CACHE_TTL_SECONDS
  },
  chatbot: {
    provider: parsedEnv.data.AI_PROVIDER,
    openaiApiKey: parsedEnv.data.OPENAI_API_KEY,
    openaiModel: parsedEnv.data.OPENAI_MODEL,
    maxTokens: parsedEnv.data.AI_MAX_TOKENS,
    temperature: parsedEnv.data.AI_TEMPERATURE,
    requestTimeoutMs: parsedEnv.data.AI_REQUEST_TIMEOUT_MS,
    maxToolCalls: parsedEnv.data.AI_MAX_TOOL_CALLS,
    maxMessageLength: parsedEnv.data.AI_MAX_MESSAGE_LENGTH,
    rateLimit: {
      guest: parsedEnv.data.CHAT_RATE_LIMIT_GUEST,
      auth: parsedEnv.data.CHAT_RATE_LIMIT_AUTH
    }
  }
} as const;

export type Config = typeof config;
