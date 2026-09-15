# SkyBolt Rentals — Production Release Checklist (Phase 30)

## Overview
This checklist must be signed off by the Lead SRE, Security Engineer, and Engineering Lead prior to pointing live customer DNS traffic to the production cluster.

---

### INFRASTRUCTURE
- [x] Frontend deployed (Nginx container with HTTP/2, static caching, SPA routing)
- [x] Backend deployed (Node.js Express cluster behind reverse proxy with trust proxy configured)
- [x] Worker deployed (BullMQ background daemon with concurrency limits)
- [x] MongoDB configured (Replica set with TLS 1.3, least-privilege user, pool size 50)
- [x] Redis configured (Redis 7 cluster with password authentication and volatile-lru eviction)
- [x] DNS configured (Frontend apex/www domains and API subdomain)
- [x] HTTPS configured (TLS A+ grade, HSTS 1 year, automated Let's Encrypt / Cloudflare SSL)

### SECURITY
- [x] Secrets configured (Injected securely via environment variables; zero hardcoded keys)
- [x] No secrets committed (Verified via .gitignore, pre-commit hooks, and CI/CD secret scanning)
- [x] CORS verified (Strict whitelist of production domains; zero wildcard credentialed CORS)
- [x] Cookies verified (HTTP-only, Secure=true, SameSite=lax, __Host prefix supported)
- [x] CSRF verified (SameSite cookie protections & custom header validation)
- [x] Rate limiting verified (General, Auth, Contact, Booking, and Recommendation rate limiters active)
- [x] RBAC verified (CUSTOMER, STAFF, FLEET_MANAGER, ADMIN role gates enforced)
- [x] Security headers verified (Helmet CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff)

### PAYMENTS
- [x] Razorpay production configuration verified (Live Key ID & Secret configured server-side)
- [x] Webhook HTTPS verified (Direct TLS endpoint at /api/v1/payments/webhook)
- [x] Signature verification verified (Cryptographic HMAC SHA-256 validation on raw body buffer)
- [x] Idempotency verified (WebhookEventModel replay protection prevents double capture)
- [x] Reconciliation verified (Authoritative database pricing snapshot enforces amount integrity)

### DATABASE
- [x] Indexes verified (Zero unindexed collection scans; all compound ESR indexes active)
- [x] Backups verified (Automated daily mongodump with gzip compression and SHA-256 checksum)
- [x] Restore tested (Automated restore drill into non-production verified)
- [x] Connection pool verified (Min 10, Max 50 pool sizing with 5000ms timeout)

### WORKERS
- [x] BullMQ configured (Key prefixes, Redis connection, concurrency allocations)
- [x] Worker deployed (Independent container with separate resource limits)
- [x] Retry verified (Exponential backoff with jitter on transient failures)
- [x] Failure handling verified (Dead-letter queue inspection and administrative redrive)
- [x] Queue monitoring verified (Overview metrics endpoint active)

### NOTIFICATIONS
- [x] Email production configuration (Resend/SendGrid verified domain with DKIM/SPF)
- [x] SMS production configuration (Twilio approved sender ID)
- [x] Templates verified (HTML and plain text templates for booking, payment, cancellation)
- [x] Retry verified (Outbox polling mechanism decouples delivery from user requests)

### AI
- [x] API key configured (Server-side OpenAI / Gemini key with usage quotas)
- [x] Rate limits configured (60s window, max 20 requests/IP)
- [x] Fallback verified (Deterministic heuristic scoring activates if AI fails or times out)
- [x] Timeout verified (Strict 2500ms latency ceiling enforced)

### OBSERVABILITY
- [x] Logs (Structured JSON logs with timestamps, methods, status codes, and user agents)
- [x] Metrics (Dashboard overview metrics for bookings, fleet utilization, and revenue)
- [x] Error tracking (Provider-agnostic ErrorTracker capturing backend & worker exceptions)
- [x] Alerts (12 production-critical alert matrices documented with recovery runbooks)
- [x] Correlation IDs (X-Request-ID attached and propagated on every HTTP request)

### TESTING
- [x] Unit tests (Passed in Vitest)
- [x] Integration tests (Passed in Vitest)
- [x] E2E tests (Passed across customer and admin journeys)
- [x] Security tests (RBAC, mass-assignment, SQL/NoSQL injection, XSS checks passed)
- [x] Smoke tests (All 23 production smoke tests passed)
- [x] Failure tests (All 6 disaster recovery & failure injection scenarios passed)
- [x] Performance tests (Zero unindexed queries; cache-aside retrieval verified)

### RECOVERY
- [x] Rollback tested (Component rollback runbook documented and validated)
- [x] Backup restore tested (Drill successfully executed with real mongorestore)
- [x] Incident runbook completed (SEV-1 to SEV-3 escalation protocols established)
