# SkyBolt Rentals — BullMQ Worker Operations Manual (Phase 9)

## Executive Summary
This document outlines the architecture, configuration, monitoring, and failure recovery protocols for SkyBolt Rentals' background workers (`backend/src/worker.ts`). Workers run independently from the Express API server to isolate CPU/IO-heavy operations, email/SMS transmissions, payment reconciliations, and maintenance routines.

---

## 1. Worker Topology & Concurrency Allocation

| Queue Name | Processor File | Concurrency | Retry Policy | Base Backoff | Priority Level |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `skybolt:notification` | `notification.processor.ts` | **10** | 3 attempts | Exponential (`1000ms * 2^attempts`) | HIGH |
| `skybolt:booking` | `booking.processor.ts` | **5** | 3 attempts | Exponential (`2000ms * 2^attempts`) | HIGH |
| `skybolt:reconciliation`| `reconciliation.processor.ts`| **2** | 3 attempts | Fixed (5000ms) | MEDIUM |
| `skybolt:maintenance` | `maintenance.processor.ts` | **2** | 3 attempts | Fixed (5000ms) | LOW |
| `skybolt:recommendation`| `recommendation.processor.ts`| **2** | 2 attempts | Fixed (2000ms) | LOW |

---

## 2. Worker Lifecycle & Graceful Shutdown

On receiving `SIGINT` or `SIGTERM`:
1. **Worker Pause**: BullMQ stops accepting new jobs from Redis immediately.
2. **In-Flight Completion**: Existing jobs are granted up to a 10-second grace window to finish processing.
3. **Queue Cleanup**: Calls `queueRegistry.closeAllQueues()`.
4. **Connection Teardown**: Closes Redis client and disconnects Mongoose cleanly.
5. **Clean Exit**: Exits with code `0`.

---

## 3. Job Idempotency & Replay Protection
- Every critical job (e.g. notification delivery or payment reconciliation) uses a deterministic, SHA-256 derived `jobId`.
- BullMQ deduplicates jobs submitted with an identical `jobId` within the queue window.
- Outbox workers update database status to `PROCESSING` atomically before initiating external network requests to prevent race conditions during worker restarts.

---

## 4. Dead-Letter Queue & Stalled Job Recovery
- **Stalled Job Detection**: BullMQ automatically inspects stalled locks every 30 seconds (`stalledInterval: 30000`). If a worker container crashes mid-execution, the lock expires and the job is automatically reassigned to an available healthy worker.
- **Permanent Failures**: Jobs that exhaust all retry attempts trigger an `ErrorTracker.captureException()` event, log a structured diagnostic, and are moved to the Failed set for administrative inspection.
- **Administrative Inspection Endpoint**:
  - `GET /api/v1/admin/queues` (Inspect backlog counts: waiting, active, completed, failed, delayed).
  - `POST /api/v1/admin/queues/:queueName/retry-failed` (Retry all failed jobs in dead-letter state).

---

## 5. Deployment Commands
```bash
# Run standalone worker in production
npm --prefix backend run start:worker

# Docker standalone worker
docker compose -f docker-compose.prod.yml up -d worker
```
