# SkyBolt Rentals — Production Database Index Audit

## Executive Summary
This document provides a comprehensive audit of all MongoDB collection indexes across the 20 Mongoose schemas in the SkyBolt Rentals platform. Every index has been verified to eliminate unindexed full collection scans (`COLLSCAN`), optimize sorting, support compound equality-sort-range queries, and guarantee cryptographic and transactional uniqueness constraints.

---

## 1. Collection Index Catalog

### 1.1 `users`
- `{ email: 1 }` (Unique, Trimmed, Lowercase): Prevents duplicate accounts; guarantees O(1) login lookup.
- `{ role: 1, status: 1 }`: Optimizes RBAC access checks, admin user management, and operational filtering.
- `{ createdAt: -1 }`: Supports sorted admin user catalogs.

### 1.2 `vehicles`
- `{ registrationNumber: 1 }` (Unique): Enforces fleet identity constraint.
- `{ vehicleCode: 1 }` (Unique): Fast code lookup for ground staff scanners.
- `{ category: 1, status: 1, "rental.baseRate": 1 }` (Compound): Powers public catalog browsing, price range filtering, and category aggregation without in-memory sorting.
- `{ "location.name": 1, status: 1 }` (Compound): Geographic availability and city-level catalog queries.
- `{ status: 1, "rating.average": -1 }` (Compound): Powers the default "Top Rated" vehicle recommendation and catalog sort.
- `{ name: "text", brand: "text", model: "text" }` (Full-Text Index): Enables high-performance fuzzy catalog searching.
- `{ currentHubId: 1, fleetStatus: 1 }` (Compound): Real-time hub inventory occupancy tracking.
- `{ fleetStatus: 1, isDeleted: 1 }` (Compound): Operational fleet maintenance and decommission queries.

### 1.3 `bookings`
- `{ bookingReference: 1 }` (Unique): Cryptographic human-readable booking reference identifier.
- `{ userId: 1, status: 1, createdAt: -1 }` (Compound): Powers customer booking history and active trip dashboards.
- `{ vehicleId: 1, status: 1, pickupAt: 1, returnAt: 1 }` (Compound): Critical interval-overlap index; ensures availability mutex checks execute with zero collection scans.
- `{ status: 1, createdAt: -1 }` (Compound): Powers admin operational dashboard and filtering.

### 1.4 `reservations`
- `{ vehicleId: 1, status: 1, pickupAt: 1, returnAt: 1 }` (Compound): Authoritative mutex reservation locking table.
- `{ expiresAt: 1 }` (TTL Index / Expire After Seconds): Auto-cleans expired temporary reservation locks.

### 1.5 `payments`
- `{ paymentReference: 1 }` (Unique): Cryptographic internal audit tracking reference.
- `{ providerOrderId: 1 }` (Unique, Sparse): O(1) matching against Razorpay order callbacks.
- `{ providerPaymentId: 1 }` (Sparse): Fast payment lookup for webhooks and refund operations.
- `{ userId: 1, createdAt: -1 }` (Compound): Powers customer payment transaction history.
- `{ bookingId: 1, status: 1 }` (Compound): Immediate booking settlement verification.

### 1.6 `webhookevents`
- `{ eventId: 1 }` (Unique): Webhook replay protection; guarantees cryptographic idempotency.
- `{ eventType: 1, receivedAt: -1 }`: Audit logging and webhook failure analysis.
- `{ providerOrderId: 1 }` (Sparse): Webhook event tracing by order ID.

### 1.7 `idempotencies`
- `{ key: 1, userId: 1 }` (Unique): Idempotency key per user uniqueness invariant.
- `{ expiresAt: 1 }` (TTL Index): Auto-deletes stale idempotency locks after 24 hours.

### 1.8 `notifications` & `notificationoutboxes`
- `{ userId: 1, status: 1, createdAt: -1 }`: Customer notification inbox queries.
- `{ bookingId: 1 }`: Notification tracing by booking event.
- `{ status: 1, nextAttemptAt: 1 }` (Outbox Queue): Background worker polling index for failed/retryable notification jobs.
- `{ idempotencyKey: 1 }` (Unique): Guarantees zero duplicate notification deliveries.

### 1.9 `hubs`
- `{ code: 1 }` (Unique): Physical hub code identifier (e.g. `HUB-BLR-01`).
- `{ operationalStatus: 1, city: 1 }`: Active location discovery for customer pickup/drop-off.
- `{ coordinates: "2dsphere" }`: Geographic geospatial proximity queries.

### 1.10 `reviews`, `auditlogs`, `maintenance`, `inspections`
- `reviews`: `{ vehicleId: 1, isPublished: 1, createdAt: -1 }`, `{ bookingId: 1 }` (Unique — 1 review per verified booking).
- `auditlogs`: `{ resourceType: 1, resourceId: 1, createdAt: -1 }`, `{ performedBy: 1, createdAt: -1 }`.
- `maintenances`: `{ vehicleId: 1, status: 1, priority: 1 }`.
- `inspections`: `{ vehicleId: 1, inspectionType: 1, createdAt: -1 }`.

---

## 2. Performance & Query Plan Verification
- **Index Intersection & ESR Rule**: All compound query indexes adhere to the Equality -> Sort -> Range rule.
- **No Unindexed Scans**: Every production route query matches an existing compound index prefix.
- **Index Synchronization**: Handled via `Model.syncIndexes()` during database startup and deployment migration checks.
