# SkyBolt Rentals — Environment Configuration Reference (Phase 2)

## Overview
This document specifies every environment variable utilized by SkyBolt Rentals.
Strict policy:
- **NEVER** expose secrets (passwords, JWT secrets, payment secrets, private API keys) to the client frontend bundle.
- **NEVER** commit populated `.env` or `.env.production` files to version control.
- In production, missing required variables will cause a fast-fail exit during startup to prevent undefined behavior.

---

## Complete Environment Variable Matrix

| NAME | PURPOSE | REQUIRED? | EXAMPLE FORMAT | SAFE TO EXPOSE TO FRONTEND? | ENVIRONMENT |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `PORT` | Local network port for Express HTTP listener | No (Default: 5001) | `5001` | **NO** | All |
| `NODE_ENV` | Target execution runtime mode | Yes | `development`, `staging`, `production` | **NO** | All |
| `API_PREFIX` | Base URI routing prefix for REST endpoints | No (Default: `/api/v1`) | `/api/v1` | **YES** | All |
| `CORS_ORIGIN` | Comma-separated allowed client origins for CORS | Yes (Prod) | `https://skyboltrentals.com,https://app.skyboltrentals.com` | **NO** | Staging, Prod |
| `RATE_LIMIT_WINDOW_MS` | Sliding window duration for general API rate limiting | No (Default: 900000) | `900000` (15 min) | **NO** | All |
| `RATE_LIMIT_MAX_REQUESTS` | Maximum allowed API requests per IP in window | No (Default: 100) | `100` | **NO** | All |
| `LOG_LEVEL` | Application logging verbosity (`debug`, `info`, `warn`, `error`) | No (Default: `info` in prod) | `info` | **NO** | All |
| `REQUEST_BODY_LIMIT` | Maximum size of incoming JSON request payloads | No (Default: `1mb`) | `1mb` | **NO** | All |
| `MONGODB_URI` | Full connection URI to authoritative MongoDB replica set | **YES** | `mongodb+srv://user:pass@cluster.mongodb.net/skybolt_prod?retryWrites=true` | **NO (CRITICAL SECRET)** | All |
| `MONGODB_DB_NAME` | Primary database name | No (Default: `skybolt_rentals`) | `skybolt_rentals_prod` | **NO** | All |
| `MONGODB_TIMEOUT_MS` | Database connection timeout threshold | No (Default: 5000) | `5000` | **NO** | All |
| `MONGODB_MAX_POOL_SIZE` | Maximum concurrent connections in Mongoose pool | No (Default: 10 dev / 50 prod) | `50` | **NO** | Staging, Prod |
| `MONGODB_MIN_POOL_SIZE` | Minimum warm connections maintained in pool | No (Default: 2 dev / 10 prod) | `10` | **NO** | Staging, Prod |
| `JWT_SECRET` | Cryptographic secret for signing and verifying customer session JWTs | **YES (Min 32 chars)** | `32c0211a7884...` | **NO (CRITICAL SECRET)** | All |
| `JWT_EXPIRES_IN` | Duration before JWT session expires | No (Default: `7d`) | `7d` | **NO** | All |
| `AUTH_COOKIE_NAME` | Session cookie identifier name | No (Default: `skybolt_auth`) | `__Host-skybolt_auth` (prod) | **NO** | All |
| `AUTH_COOKIE_SECURE` | Forces cookie transmission strictly over HTTPS | Yes (Auto `true` in prod) | `true` | **NO** | Staging, Prod |
| `AUTH_COOKIE_SAME_SITE` | Cookie SameSite policy to prevent CSRF | No (Default: `lax`) | `lax` | **NO** | All |
| `AUTH_RATE_LIMIT_MAX` | Maximum login/registration attempts allowed per IP per 15 min | No (Default: 15) | `10` | **NO** | Staging, Prod |
| `PASSWORD_RESET_EXPIRES_MS` | Time limit for password reset tokens | No (Default: 900000) | `900000` (15 min) | **NO** | All |
| `BCRYPT_SALT_ROUNDS` | Password hashing complexity cost factor | No (Default: 10 dev / 12 prod) | `12` | **NO** | Staging, Prod |
| `RAZORPAY_KEY_ID` | Public client identifier for Razorpay Checkout SDK | **YES** | `rzp_live_abc12345` | **YES (Public Key)** | All |
| `RAZORPAY_KEY_SECRET` | Secret key for server-side order creation and signature validation | **YES (Prod)** | `secret_987654...` | **NO (CRITICAL SECRET)** | All |
| `RAZORPAY_WEBHOOK_SECRET` | Secret for verifying HMAC SHA-256 webhook signatures | **YES (Prod)** | `webhook_secret_...` | **NO (CRITICAL SECRET)** | All |
| `EMAIL_PROVIDER` | Transactional email provider backend (`mock`, `resend`, `sendgrid`) | No (Default: `mock`) | `resend` | **NO** | All |
| `EMAIL_PROVIDER_API_KEY` | API secret key for email service | Yes (if not mock) | `re_123456789...` | **NO (SECRET)** | Staging, Prod |
| `EMAIL_PROVIDER_FROM` | Verified sender email address and display name | Yes (Prod) | `SkyBolt Rentals <notifications@skyboltrentals.com>` | **NO** | Staging, Prod |
| `SMS_PROVIDER` | Transactional SMS provider backend (`mock`, `twilio`) | No (Default: `mock`) | `twilio` | **NO** | All |
| `SMS_PROVIDER_API_KEY` | Auth Token for Twilio SMS | Yes (if not mock) | `twilio_auth_token_...` | **NO (SECRET)** | Staging, Prod |
| `SMS_PROVIDER_ACCOUNT_SID` | Account SID for Twilio SMS | Yes (if not mock) | `AC1234567890abcdef` | **NO (SECRET)** | Staging, Prod |
| `SMS_PROVIDER_SENDER_ID` | Approved DLT / 10DLC alphanumeric sender identifier | No (Default: `SKYBOLT`) | `SKYBOLT` | **NO** | Staging, Prod |
| `NOTIFICATION_OUTBOX_POLL_INTERVAL_MS` | Polling frequency for notification worker | No (Default: 5000) | `3000` | **NO** | All |
| `NOTIFICATION_MAX_RETRIES` | Max delivery attempts before moving outbox job to failed state | No (Default: 3) | `5` | **NO** | All |
| `REDIS_URL` | Centralized Redis connection string with auth credentials | **YES (Prod)** | `rediss://:password@redis.internal:6379` | **NO (SECRET)** | All |
| `REDIS_KEY_PREFIX` | Namespace prefix for Redis cache and queue keys | No (Default: `skybolt:`) | `skybolt_prod:` | **NO** | All |
| `REDIS_CONNECT_TIMEOUT_MS` | Timeout for establishing connection to Redis | No (Default: 5000) | `5000` | **NO** | All |
| `CACHE_ENABLED` | Toggle for Redis cache-aside caching | No (Default: `true`) | `true` | **NO** | All |
| `CACHE_DEFAULT_TTL_SECONDS` | Default time-to-live for cached vehicle responses | No (Default: 300) | `300` | **NO** | All |
| `QUEUE_ENABLED` | Toggle for BullMQ background workers | No (Default: `true`) | `true` | **NO** | All |
| `AI_RECOMMENDATION_PROVIDER` | Recommendation engine provider (`mock`, `openai`, `gemini`) | No (Default: `mock`) | `openai` | **NO** | All |
| `AI_RECOMMENDATION_API_KEY` | Secret API key for OpenAI / Gemini recommendation queries | Yes (if AI enabled) | `sk-proj-123456...` | **NO (SECRET)** | Staging, Prod |
| `AI_RECOMMENDATION_MODEL` | AI model identifier | No (Default: `gpt-4o-mini`) | `gpt-4o-mini` | **NO** | All |
| `AI_RECOMMENDATION_TIMEOUT_MS` | Max latency allowed before falling back to deterministic heuristic | No (Default: 2500) | `2500` | **NO** | All |
