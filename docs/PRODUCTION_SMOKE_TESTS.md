# SkyBolt Rentals — Production Smoke Tests Documentation (Phase 22)

## Overview
The SkyBolt Rentals smoke test suite (`backend/tests/production-smoke.test.ts`) verifies end-to-end functionality across all critical customer journeys, administrative operations, payment gateways, and background worker queues.

---

## 1. How to Execute Smoke Tests

### Local or CI Runner
```bash
# Run standalone smoke test suite
npm --prefix backend run test tests/production-smoke.test.ts
```

### Staging or Pre-Production Environment
```bash
# Execute against live staging container
NODE_ENV=staging npx --prefix backend vitest run tests/production-smoke.test.ts
```

---

## 2. Tested Scenarios Specification

| # | Test Scenario | Verification Invariant |
| :--- | :--- | :--- |
| **1** | Frontend Loads | Root API baseline metadata returns status 200 with platform identity. |
| **2** | API Responds | Vehicle catalog endpoint responds cleanly. |
| **3** | Health Endpoint | `GET /health` returns HTTP 200 with process uptime and live status. |
| **4** | Readiness Endpoint | `GET /ready` returns HTTP 200 confirming authoritative MongoDB connection. |
| **5** | User Registration | Customer registration succeeds, hashes password with bcrypt, and sets secure HTTP-only cookie. |
| **6** | Login | Customer login succeeds with valid email/password. |
| **7** | Logout | Session cookie is cleared with expired max-age. |
| **8** | Vehicle Listing | Active fleet catalog returned with verified pagination metadata. |
| **9** | Vehicle Details | Single vehicle query returns complete technical specifications. |
| **10** | Availability Check | Date interval eligibility verifies zero conflicting bookings. |
| **11** | Dynamic Quote | Dynamic pricing calculation produces authoritative breakdown with base rate, GST, deposit. |
| **12** | Booking Creation | Mutex lock created; booking registered in `PENDING` state with unique reference. |
| **13** | Payment Order | Razorpay order created with exact minor units (paise) derived from pricing snapshot. |
| **14** | Payment Flow | Cryptographic HMAC SHA-256 signature verification succeeds; payment captured. |
| **15** | Webhook Processing | Razorpay webhook cryptographically verified and recorded in idempotent event store. |
| **16** | Booking Confirmation | Verified payment capture transitions booking status to `CONFIRMED` and `PAID`. |
| **17** | Booking Cancellation | Authorized customer cancellation releases reservation and records status history. |
| **18** | Fleet Management | Admin user updates vehicle operational status with audit reason. |
| **19** | Review Retrieval | Vehicle review summary calculates average rating and verified review counts. |
| **20** | Notification Generation | Transactional notifications queued in database outbox for background delivery. |
| **21** | Queue Processing | BullMQ queue registry reports active queues and operational job counts. |
| **22** | Admin Dashboard | Authenticated admin retrieves overview metrics across fleet, bookings, and revenue. |
| **23** | Unauthorized Rejection | Unauthorized non-admin attempt to access protected control-center routes is rejected with 401/403. |
