# SkyBolt Rentals — Production Deployment Audit (Phase 1)

## Executive Summary
This document provides a comprehensive operational, security, and infrastructure audit of **SkyBolt Rentals** prior to live production deployment. Every subsystem has been investigated directly from the active codebase.

---

## 1. Current Architecture
- **Client Tier**:
  - Vanilla HTML5 / CSS3 / ES Modules client located in `frontend/` served via Nginx with HTTP/2 and TLS termination.
  - React/TypeScript component foundation in `frontend/src/` for future SPA expansions.
- **API Application Tier**:
  - Stateless Node.js / Express / TypeScript REST API in `backend/src/`.
  - Layered architecture: Controllers -> Services -> Repositories -> Mongoose Models.
- **Worker Tier**:
  - Independent BullMQ background worker in `backend/src/worker.ts` with 5 queue processors (Notification, Booking, Maintenance, Reconciliation, Recommendation).
- **Authoritative Data Tier**:
  - MongoDB replica set (managed via MongoDB Atlas in production or Docker cluster in staging).
- **Transient & Caching Tier**:
  - Redis 7.x cluster providing cache-aside retrieval, mutual exclusion locks (`SET NX PX`), and BullMQ queue message brokers.
- **External Integration Tier**:
  - Razorpay (payment order creation, checkout verification, HMAC SHA-256 webhook capture).
  - Resend / SendGrid (transactional email notification delivery).
  - Twilio (transactional SMS delivery).
  - OpenAI / Gemini / Heuristic Engine (grounded, bounded vehicle recommendation engine).

---

## 2. Runtime Processes
In production, runtime processes are strictly segregated:
1. **API Web Process**: `node dist/server.js` (listens on `PORT=5001` or container port 5001).
2. **Background Worker Process**: `node dist/worker.js` (independent daemon with concurrency limits and graceful shutdown).
3. **Frontend Ingress / Reverse Proxy**: Nginx Alpine container serving static assets on port 80/443 and reverse proxying `/api` traffic to backend.

---

## 3. Required Environment Variables
Documented completely in [ENVIRONMENT_CONFIGURATION.md](file:///Users/kushagra/Desktop/SkyBolt-Rentals-main/docs/ENVIRONMENT_CONFIGURATION.md). Key variables:
- `PORT`, `NODE_ENV`, `API_PREFIX`, `CORS_ORIGIN`
- `MONGODB_URI`, `MONGODB_DB_NAME`, `MONGODB_TIMEOUT_MS`, `MONGODB_MAX_POOL_SIZE`
- `JWT_SECRET`, `JWT_EXPIRES_IN`, `AUTH_COOKIE_NAME`, `AUTH_COOKIE_SECURE`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `EMAIL_PROVIDER`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_PROVIDER_FROM`
- `SMS_PROVIDER`, `SMS_PROVIDER_API_KEY`, `SMS_PROVIDER_ACCOUNT_SID`
- `REDIS_URL`, `REDIS_KEY_PREFIX`, `CACHE_ENABLED`, `QUEUE_ENABLED`
- `AI_RECOMMENDATION_PROVIDER`, `AI_RECOMMENDATION_API_KEY`, `AI_RECOMMENDATION_MODEL`

---

## 4. Required External Services
1. **MongoDB Atlas** (v7.0+ Replica Set with TLS 1.3 and SCRAM-SHA-256 authentication).
2. **Redis Cloud / Upstash / AWS ElastiCache** (v7.x with TLS and AUTH).
3. **Razorpay** (Live merchant account with webhook URLs configured for `https://<domain>/api/v1/payments/webhook`).
4. **Resend or SendGrid** (Verified domain with SPF/DKIM DNS records).
5. **Twilio** (Registered 10DLC or Indian DLT template approved sender).
6. **OpenAI / Google AI Studio** (API key with quota limits for recommendations).

---

## 5. Required Ports
- `80 / 443`: Public HTTPS ingress (Nginx / Cloudflare / Load Balancer).
- `5001`: Internal private Express API listener (never exposed directly to public internet without reverse proxy).
- `27017`: MongoDB connection port (restricted to private VPC / IP whitelist).
- `6379`: Redis connection port (restricted to private VPC / IP whitelist).

---

## 6. Build Commands
- **Root**: `npm run build` (runs test suites and builds backend)
- **Backend**: `npm --prefix backend run build` (`tsc` compiling `src/` to `dist/`)
- **Docker**:
  - `docker build -f Dockerfile.backend -t skybolt-backend:latest .`
  - `docker build -f Dockerfile.worker -t skybolt-worker:latest .`
  - `docker build -f Dockerfile.frontend -t skybolt-frontend:latest .`

---

## 7. Start Commands
- **Backend API**: `npm --prefix backend start` (`node dist/server.js`)
- **Docker API**: `docker compose -f docker-compose.prod.yml up -d backend`

---

## 8. Worker Commands
- **Worker Daemon**: `npm --prefix backend run start:worker` (`node dist/worker.js`)
- **Docker Worker**: `docker compose -f docker-compose.prod.yml up -d worker`

---

## 9. Database Requirements
- Authoritative persistence layer for all transactions, fleet records, bookings, and audit events.
- Minimum connection pool: 10; Maximum connection pool: 50.
- Mandatory TLS (`ssl=true`).
- Connection timeout: 5000ms.
- Automated daily backups with 30-day retention and verified restoration drill.

---

## 10. Redis Requirements
- Must remain strictly supporting (MongoDB is authoritative).
- Memory limit: 512MB to 1GB with `volatile-lru` eviction policy.
- Fail-open caching: In event of Redis outage, application degrades gracefully to direct MongoDB queries without user-facing outages.

---

## 11. Payment Requirements
- Razorpay live keys injected strictly on server-side.
- Raw request body preserved in middleware for cryptographic HMAC SHA-256 webhook signature verification.
- Zero-trust amount and currency matching against authoritative booking pricing snapshots.
- Webhook idempotency and replay attack prevention using unique `eventId` indexing.

---

## 12. Notification Requirements
- Asynchronous transactional outbox pattern to guarantee booking creation never blocks on external network calls.
- Strict PII protection: Never log OTPs, reset tokens, or auth credentials.
- Exponential backoff retry policies for transient provider outages.

---

## 13. AI Requirements
- Bounded latency: 2500ms timeout.
- Provider-agnostic interface with deterministic heuristic fallback engine.
- Hard guardrail: Booking, payment, inventory, and pricing NEVER depend on AI. AI outputs are strictly sanitized against database candidates.

---

## 14. Current Deployment Blockers (Resolved in Task 18)
- [RESOLVED] Missing root-level `/health` and `/ready` probes for container orchestrators.
- [RESOLVED] Missing trusted proxy configuration (`trust proxy: 1`) for secure cookie handling and client IP rate limiting behind ALBs.
- [RESOLVED] Missing multi-stage container definitions and CI/CD pipelines.
- [RESOLVED] Missing automated backup and restoration verification scripts.

---

## 15. Security Concerns & Hardening Verification
- Zero secrets committed in Git (enforced via `.gitignore` and CI/CD regex scans).
- Strict Helmet CSP, HSTS, and XSS headers configured in Nginx and Express.
- Secure, HTTP-only, SameSite cookies for session management.
- Rate limiting on authentication (`15 req/15min`), contact, bookings, and recommendations.
- Mass assignment protections on user models (preventing customer registration as `ADMIN`).

---

## 16. Missing Observability (Addressed)
- Implemented structured JSON request logging with unique correlation IDs (`X-Request-ID`).
- Implemented provider-agnostic `ErrorTracker` capturing unhandled exceptions, worker job failures, and webhook errors.
- Documented 12 production-critical alert matrices with investigation and recovery procedures.

---

## 17. Missing Recovery Mechanisms (Addressed)
- Automated backup drill with checksum verification (`scripts/backup-mongodb.js` and `scripts/restore-mongodb.js`).
- Graceful shutdown handlers in API and Worker processes ensuring in-flight requests and jobs terminate cleanly within 10 seconds.
- Documented step-by-step rollback runbooks for frontend, backend, worker, database, and configuration.
