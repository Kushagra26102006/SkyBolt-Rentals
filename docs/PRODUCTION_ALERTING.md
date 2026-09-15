# SkyBolt Rentals — Production Alerting Specification (Phase 17)

## Overview
This document specifies production alert thresholds, severity classifications, escalation policies, and step-by-step remediation procedures for SkyBolt Rentals. Alerts are routed to PagerDuty / OpsGenie / Slack with automated escalation.

---

## 1. Alert Matrices

### Alert 1: API Complete Downtime (Process Liveness Failure)
- **Condition**: `GET /health` or `GET /api/v1/health/live` fails 3 consecutive times within 60s from synthetic probes.
- **Severity**: **SEV-1 (CRITICAL)**
- **Expected Response**: < 5 minutes (On-call page)
- **Investigation Steps**:
  1. Inspect container crash logs: `docker logs skybolt-backend-prod --tail 100`.
  2. Check host machine memory/CPU pressure (`htop`, `free -m`).
  3. Verify port 5001 binding: `ss -tulpn | grep 5001`.
- **Recovery Steps**:
  1. Restart backend container: `docker restart skybolt-backend-prod`.
  2. If crash loop persists, inspect recent commits and trigger automated rollback to previous release tag.

---

### Alert 2: Service Readiness Failure (Dependency Offline)
- **Condition**: `GET /ready` returns HTTP 503 for > 30 seconds.
- **Severity**: **SEV-1 (CRITICAL)**
- **Expected Response**: < 5 minutes
- **Investigation Steps**:
  1. Review response payload for failing check (`database` or `redis`).
  2. Test MongoDB connectivity from host: `mongosh "<MONGODB_URI>" --eval "db.adminCommand('ping')"`.
- **Recovery Steps**:
  1. If MongoDB primary failed, verify replica set election status in Atlas.
  2. Check firewall rules / VPC peering routes between API cluster and MongoDB.

---

### Alert 3: High 5xx HTTP Error Rate
- **Condition**: Server error rate > 2% of total requests over a 5-minute rolling window.
- **Severity**: **SEV-1 (CRITICAL)**
- **Expected Response**: < 10 minutes
- **Investigation Steps**:
  1. Query error tracking log: `grep "SkyBolt ErrorTracker" /var/log/skybolt/backend.log`.
  2. Filter top failing endpoints by statusCode 500.
  3. Inspect stack traces in ErrorTracker dashboard.
- **Recovery Steps**:
  1. If isolated to a specific third-party provider (e.g. AI or SMS), enable circuit breaker or toggle feature flag `ENABLE_AI=false`.
  2. If caused by application bug, hotfix or roll back deployment.

---

### Alert 4: Database Connection Drop or Connection Pool Exhaustion
- **Condition**: MongoDB active connections > 90% of `MONGODB_MAX_POOL_SIZE` or connection timeout errors logged.
- **Severity**: **SEV-1 (CRITICAL)**
- **Expected Response**: < 5 minutes
- **Investigation Steps**:
  1. Check Atlas connection metrics for connection leaks.
  2. Identify slow or unindexed queries: `db.currentOp({ "secs_running": { "$gt": 3 } })`.
- **Recovery Steps**:
  1. Temporarily increase `MONGODB_MAX_POOL_SIZE` from 50 to 100.
  2. Terminate hung long-running queries via `db.killOp(<opid>)`.

---

### Alert 5: Redis Cache & Queue Cluster Failure
- **Condition**: `isRedisConnected()` returns false for > 60 seconds.
- **Severity**: **SEV-2 (HIGH)**
- **Expected Response**: < 15 minutes
- **Investigation Steps**:
  1. Ping Redis server: `redis-cli -u "<REDIS_URL>" ping`.
  2. Check Redis memory usage: `redis-cli info memory`.
- **Recovery Steps**:
  1. Verify API is operating in graceful MongoDB fallback mode.
  2. Restart Redis container or failover to secondary Redis replica.

---

### Alert 6: BullMQ Worker Process Death
- **Condition**: Worker process inactive or zero job heartbeats for > 3 minutes.
- **Severity**: **SEV-2 (HIGH)**
- **Expected Response**: < 15 minutes
- **Investigation Steps**:
  1. Inspect worker container logs: `docker logs skybolt-worker-prod --tail 100`.
  2. Check for uncaught fatal exceptions or OOM kill events.
- **Recovery Steps**:
  1. Restart worker: `docker restart skybolt-worker-prod`.
  2. BullMQ will auto-recover stalled locks and resume pending jobs.

---

### Alert 7: Queue Backlog Surge
- **Condition**: Total waiting jobs across all queues > 500 for > 10 minutes.
- **Severity**: **SEV-2 (HIGH)**
- **Expected Response**: < 20 minutes
- **Investigation Steps**:
  1. Check queue metrics via `GET /api/v1/admin/queues`.
  2. Identify which queue is accumulating backlog (e.g. Notification vs Booking).
- **Recovery Steps**:
  1. Scale worker container instances horizontally: `docker compose up -d --scale worker=3`.
  2. Check third-party provider rate limits (e.g. SendGrid or Twilio throttling).

---

### Alert 8: Razorpay Payment Webhook Verification Failure Spike
- **Condition**: > 5 invalid webhook signatures within 10 minutes.
- **Severity**: **SEV-1 (CRITICAL)**
- **Expected Response**: < 10 minutes
- **Investigation Steps**:
  1. Check if `RAZORPAY_WEBHOOK_SECRET` in production `.env` matches Razorpay Dashboard.
  2. Verify reverse proxy is not modifying or mutating raw request payload buffers.
- **Recovery Steps**:
  1. Re-sync webhook secret in production secret manager.
  2. Verify with Razorpay API logs to confirm IP origin.

---

### Alert 9: Payment Reconciliation Mismatch
- **Condition**: Unreconciled payments detected where Razorpay status is `CAPTURED` but booking is not `CONFIRMED`.
- **Severity**: **SEV-1 (CRITICAL)**
- **Expected Response**: < 15 minutes
- **Investigation Steps**:
  1. Access reconciliation report: `GET /api/v1/payments/reconciliation/report`.
  2. Inspect specific order ID and booking reference.
- **Recovery Steps**:
  1. Run automated reconciliation job to sync authoritative state.
  2. If vehicle was double-booked due to manual intervention, trigger automated refund protocol.

---

### Alert 10: Notification Delivery Failure Spike
- **Condition**: Outbox retry exhaustion > 5% over 15 minutes.
- **Severity**: **SEV-3 (MEDIUM)**
- **Expected Response**: < 1 hour
- **Investigation Steps**:
  1. Check provider API credentials and account balance in Twilio / Resend.
  2. Check for invalid phone number or email formatting.
- **Recovery Steps**:
  1. Switch provider fallback (e.g. Resend -> SendGrid).
  2. Trigger outbox redrive once provider service recovers.

---

### Alert 11: High P95 API Response Latency
- **Condition**: P95 latency > 800ms over a 10-minute window for core rental endpoints.
- **Severity**: **SEV-2 (HIGH)**
- **Expected Response**: < 20 minutes
- **Investigation Steps**:
  1. Inspect slow query logs in MongoDB Atlas.
  2. Verify Redis cache hit ratio via `cacheService`.
- **Recovery Steps**:
  1. Verify all compound indexes are being utilized.
  2. Ensure external AI recommendation calls do not exceed 2500ms timeout.

---

### Alert 12: Unusual Booking Failure Rate
- **Condition**: Booking creation failures > 10% of attempts within 15 minutes.
- **Severity**: **SEV-1 (CRITICAL)**
- **Expected Response**: < 10 minutes
- **Investigation Steps**:
  1. Check availability mutex locks in database.
  2. Inspect booking validation error logs for recurring schema rejections.
- **Recovery Steps**:
  1. Clear any orphaned temporary reservation locks past `expiresAt`.
  2. Check fleet status constraints.
