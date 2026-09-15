# SkyBolt Rentals — Production Engineering Roadmap

> **Document:** 17-Phase Engineering Delivery Roadmap  
> **Status:** Active Reference Document  
> **Version:** 1.0.0  
> **Target:** Transformation from Prototype to Enterprise Vehicle Rental Platform  

---

## Roadmap Overview

This roadmap defines the sequential transformation of **SkyBolt Rentals** from a client-side vanilla JavaScript prototype into a secure, scalable, multi-tier vehicle rental system. Each phase addresses specific architectural layers, establishes verifiable completion criteria, and mitigates identified production risks.

```text
Foundations & Infrastructure:
  [Phase 1: Foundation] ──> [Phase 2: Backend] ──> [Phase 3: Database]
                                                        │
Core Business Domains:                                  ▼
  [Phase 6: Availability] <── [Phase 5: Vehicles] <── [Phase 4: Authentication]
         │
         ▼
  [Phase 7: Booking] ──> [Phase 8: Pricing] ──> [Phase 9: Payments]
                                                      │
User & Administrative Portals:                         ▼
  [Phase 12: Fleet] <── [Phase 11: Admin] <── [Phase 10: Customer]
         │
Customer Experience & Engagement:
         ▼
  [Phase 13: Notifications] ──> [Phase 14: Reviews]
                                      │
Hardening, Quality & Operations:       ▼
  [Phase 17: Deployment] <── [Phase 16: Testing] <── [Phase 15: Security]
```

---

## Phase 1 — Foundation

* **Objective**: Audit prototype, isolate client-side data stores, clean dead code, establish documentation, and implement fundamental date and error handling guards.
* **Features**:
  - Comprehensive architectural and security audit.
  - Safe `localStorage` wrappers with error and quota resilience.
  - Basic frontend date validation (prevent past dates, enforce pickup <= return).
  - Normalization of search query parameters between landing page and catalog.
  - Documentation of architectural requirements and technical risks.
* **Dependencies**: None.
* **Risks**: Modifying existing code could inadvertently break client-side demo functionality.
* **Completion Criteria**:
  - All audit documents created in `docs/`.
  - Zero syntax errors in existing JavaScript modules.
  - Date inputs reject past dates and invalid ranges.
  - All 11 HTML pages load without JavaScript console exceptions.

---

## Phase 2 — Backend Architecture & API Foundation

* **Objective**: Establish the core server runtime, HTTP API structure, request routing, middleware stack, and environment configuration.
* **Features**:
  - Node.js / Express REST API application skeleton.
  - Modular layered directory layout: `routes/`, `controllers/`, `services/`, `middlewares/`, `utils/`.
  - Centralized environment configuration management (`dotenv` with schema validation via `zod` or `joi`).
  - Standardized JSON response envelope: `{ success: true, data: ..., error: null }`.
  - Global asynchronous error handling middleware and HTTP status code mapping.
  - Request logging (`morgan` / `pino`) and request ID tracing.
* **Dependencies**: Phase 1.
* **Risks**: Environment misconfigurations, cross-origin resource sharing (CORS) blocks during initial frontend integration.
* **Completion Criteria**:
  - Server starts reliably via `npm run dev` with health check endpoint (`/api/v1/health`) returning `200 OK`.
  - Structured request logging functional.
  - Unhandled promise rejections caught gracefully without server crashes.

---

## Phase 3 — Database Schema & Data Persistence Layer

* **Objective**: Replace in-memory arrays and client `localStorage` with a persistent, relational or document database.
* **Features**:
  - Relational database setup (PostgreSQL with Prisma / TypeORM or MongoDB with Mongoose).
  - Core database migrations:
    - `users` (UUID, email, password_hash, full_name, phone, role, created_at)
    - `vehicles` (UUID, name, category, fuel_type, transmission, seats, price_per_day, location_id, is_active)
    - `locations` (UUID, hub_name, city, address, coordinates)
    - `bookings` (UUID, reference_code, user_id, vehicle_id, pickup_date, return_date, status, financial breakdown)
    - `reviews` (UUID, booking_id, user_id, vehicle_id, rating, comment)
  - Database connection pooling, health checks, and initial database seeds for vehicle inventory.
* **Dependencies**: Phase 2.
* **Risks**: Poorly indexed date ranges causing slow queries; database connectivity drops during high traffic.
* **Completion Criteria**:
  - Automated database migration scripts execute idempotently.
  - Seed script populates initial fleet catalog and test accounts into the database.
  - Database pool gracefully handles disconnections and reconnects.

---

## Phase 4 — Authentication & Identity Management

* **Objective**: Replace vulnerable mock authentication with cryptographic password hashing, JWT authentication, and secure session cookies.
* **Features**:
  - Secure user registration endpoint (`POST /api/v1/auth/register`) with `bcrypt` (12 salt rounds).
  - User login endpoint (`POST /api/v1/auth/login`) issuing short-lived signed JWT access tokens (15m) and rotating refresh tokens (7d).
  - Secure storage using `HttpOnly`, `SameSite=Strict`, `Secure` cookies.
  - Role-Based Access Control (RBAC) middleware: `CUSTOMER`, `STAFF`, `ADMIN`.
  - Password reset flow with time-limited cryptographic reset tokens.
  - Input validation for email format, password complexity (min 8 chars, uppercase, digit, symbol).
* **Dependencies**: Phase 3.
* **Risks**: Token leakage via XSS if stored in `localStorage`; CSRF vulnerabilities if cookies are misconfigured.
* **Completion Criteria**:
  - No passwords or session tokens stored in browser `localStorage`.
  - Protected endpoints reject unauthenticated or expired token requests with `401 Unauthorized`.
  - RBAC middleware blocks unauthorized role escalation with `403 Forbidden`.

---

## Phase 5 — Vehicle Catalog Management Domain

* **Objective**: Transition vehicle browsing, filtering, sorting, and details to high-performance database-driven REST endpoints.
* **Features**:
  - Public endpoints:
    - `GET /api/v1/vehicles` (supports pagination, filtering by category, fuel, transmission, price range, city hub).
    - `GET /api/v1/vehicles/:id` (vehicle specification, high-resolution media gallery, current rating).
  - Admin endpoints:
    - `POST /api/v1/vehicles` (fleet addition with image upload via cloud storage).
    - `PATCH /api/v1/vehicles/:id` (rate modifications, spec updates, maintenance flags).
    - `DELETE /api/v1/vehicles/:id` (soft deletion / deactivation).
  - Full-text search on vehicle model, make, and features.
* **Dependencies**: Phase 4.
* **Risks**: Large payload sizes from uncompressed images; slow response times without proper database query indexes.
* **Completion Criteria**:
  - Dynamic frontend catalog consumes `/api/v1/vehicles` seamlessly.
  - Paginated catalog response delivers under 100ms.
  - Inactive or soft-deleted vehicles are automatically excluded from customer queries.

---

## Phase 6 — Vehicle Availability & Conflict Engine

* **Objective**: Build a robust, server-side temporal collision detection engine to guarantee no double-bookings.
* **Features**:
  - Server-side availability verification endpoint (`POST /api/v1/vehicles/:id/check-availability`).
  - Interval overlap algorithm:
    ```sql
    WHERE vehicle_id = $1 
      AND status IN ('CONFIRMED', 'ACTIVE')
      AND (pickup_date < $3 AND return_date > $2)
    ```
  - Temporary reservation holding/locking mechanism (10-minute hold while customer completes checkout).
  - Automatic release of expired holds via background worker / timer.
* **Dependencies**: Phase 5.
* **Risks**: Race conditions where two concurrent requests simultaneously book the same vehicle during checkout.
* **Completion Criteria**:
  - Concurrency test passes: 50 concurrent booking attempts for the same vehicle and dates result in exactly 1 confirmed reservation and 49 rejected with friendly availability notices.

---

## Phase 7 — Booking Lifecycle & State Machine

* **Objective**: Enforce a strict server-side finite state machine for all reservation lifecycles.
* **Features**:
  - Booking status states: `PENDING_PAYMENT` -> `CONFIRMED` -> `ACTIVE` -> `COMPLETED` | `CANCELLED` | `REFUNDED`.
  - Cryptographically random, collision-resistant booking reference generator (e.g. `SKY-2026-X89W2K`).
  - Endpoints:
    - `POST /api/v1/bookings` (create reservation hold).
    - `GET /api/v1/bookings/my-bookings` (customer dashboard reservations).
    - `POST /api/v1/bookings/:id/cancel` (with cancellation policy enforcement: >24h free, <24h penalty fee).
  - Server-side validation of customer identity, driving license verification, and contact phone numbers.
* **Dependencies**: Phase 6.
* **Risks**: Invalid state transitions (e.g., cancelling a completed booking, confirming without payment).
* **Completion Criteria**:
  - State machine strictly blocks illegal transitions.
  - Customer can view real-time reservation history in the dashboard.
  - Cancelled bookings immediately return inventory back to the availability pool.

---

## Phase 8 — Server-Side Dynamic Pricing Engine

* **Objective**: Eliminate client-side price computation and calculate all rates, surcharges, taxes, and deposits securely on the server.
* **Features**:
  - Price quote endpoint (`POST /api/v1/pricing/quote`).
  - Server-side calculation logic:
    - Base rental = `daily_rate * calculated_calendar_days`
    - Seasonal / Weekend surge multipliers.
    - Statutory taxes (GST / VAT 18%) computed to integer cents/paisa.
    - Security deposit rules based on vehicle category (Bikes: ₹1,000; Luxury Cars: ₹5,000).
    - Promotional coupon code validation and discount calculation.
  - Price quote returns a signed hash or quote ID valid for 15 minutes to guarantee price stability.
* **Dependencies**: Phase 7.
* **Risks**: Currency rounding discrepancies, time zone differences affecting day count calculations.
* **Completion Criteria**:
  - Client cannot alter prices; server computes and confirms final payable amount.
  - All financial calculations execute with integer precision to prevent floating-point rounding errors.

---

## Phase 9 — Payment Gateway Integration

* **Objective**: Integrate PCI-DSS compliant live payment processing with automatic webhooks.
* **Features**:
  - Integration with Stripe and/or Razorpay Payment Intents API.
  - Endpoints:
    - `POST /api/v1/payments/create-intent` (creates payment session with server-calculated total).
    - `POST /api/v1/payments/webhook` (idempotent signature-verified webhook handler).
  - Automatic transition of booking from `PENDING_PAYMENT` to `CONFIRMED` upon successful webhook receipt.
  - Automated security deposit pre-authorization holds and automated post-rental release.
  - Refund processing on authorized booking cancellations.
* **Dependencies**: Phase 8.
* **Risks**: Webhook delivery delays; double-charging on network retries; chargebacks.
* **Completion Criteria**:
  - Zero raw payment card data ever touches SkyBolt servers.
  - Webhook listener verifies cryptographic HMAC signatures and processes events idempotently.
  - Failed payments leave booking in `PENDING_PAYMENT` with retry option before automatic release.

---

## Phase 10 — Customer Portal & Profile Management

* **Objective**: Upgrade user dashboard with full profile customization, document verification, and booking management.
* **Features**:
  - Driver's license document upload with secure cloud storage (AWS S3 / Cloudinary with pre-signed URLs).
  - Profile update API (`PATCH /api/v1/users/profile`).
  - Saved favorites API synced with customer database record rather than ephemeral browser storage.
  - Booking invoice generation (downloadable PDF receipts with tax breakdown).
  - Rental trip history with active GPS pickup instructions.
* **Dependencies**: Phase 9.
* **Risks**: Unauthenticated access to user identification documents (PII leak).
* **Completion Criteria**:
  - Customer documents stored in private S3 buckets accessible only via short-lived pre-signed URLs.
  - Invoices generated with correct legal business credentials and tax IDs.

---

## Phase 11 — Administrative Operations & Analytics Portal

* **Objective**: Build a dedicated, secure back-office administrative panel for fleet managers and operations teams.
* **Features**:
  - Role-protected admin dashboard routes (`/admin/*`).
  - Fleet management dashboard (active rentals, vehicles in maintenance, upcoming returns).
  - Booking management table (filter by status, manual overrides, check-in / check-out inspection logging).
  - Financial reporting: daily revenue, tax collected, pending deposit refunds, utilization rates.
  - Customer management: license verification approval, account suspension.
* **Dependencies**: Phase 10.
* **Risks**: Inadequate access controls leading to unauthorized staff actions.
* **Completion Criteria**:
  - Full audit logging for all administrative modifications (who changed what, when).
  - Operational staff cannot view raw customer payment credentials.

---

## Phase 12 — Fleet Telematics, Maintenance & Multi-Hub Logistics

* **Objective**: Implement multi-city physical hub inventory management, vehicle maintenance schedules, and odometry tracking.
* **Features**:
  - Hub transfer management (vehicle picked up at Hub A, returned at Hub B with one-way fee).
  - Vehicle maintenance scheduling (service triggers by mileage or date; automatic lockout from catalog).
  - Fuel / Battery level check-in records with automated recharge/refueling penalty calculation.
  - Damage inspection checklist with photo uploads at pickup and return.
* **Dependencies**: Phase 11.
* **Risks**: Vehicle marked available while in maintenance; incorrect hub assignment.
* **Completion Criteria**:
  - Vehicles under maintenance automatically hidden from the booking availability engine.
  - Multi-hub inventory correctly re-allocates vehicle location upon return completion.

---

## Phase 13 — Notifications & Messaging Engine

* **Objective**: Implement transactional multi-channel notifications for booking milestones.
* **Features**:
  - Notification channels: Transactional Email (SendGrid / AWS SES), SMS (Twilio), and in-app toasts/alerts.
  - Automated triggers:
    - Welcome & email verification upon registration.
    - Instant booking confirmation with rental PDF voucher.
    - Pickup reminder 24 hours and 2 hours prior to reservation.
    - Return reminder 2 hours prior to scheduled return.
    - Cancellation confirmation and refund receipt.
* **Dependencies**: Phase 9.
* **Risks**: Spam filter flagging; delivery latency; messaging API quota exhaustion.
* **Completion Criteria**:
  - Asynchronous background queue (Redis + BullMQ) handles email/SMS dispatch without blocking API request threads.
  - Template engine produces branded, mobile-responsive HTML emails.

---

## Phase 14 — Verified Customer Reviews & Trust System

* **Objective**: Build a verified review and rating engine that only permits customers who actually completed rentals to submit reviews.
* **Features**:
  - Review submission endpoint (`POST /api/v1/reviews`) strictly validated against `COMPLETED` bookings.
  - Star ratings (1 to 5) across multiple criteria: vehicle condition, cleanliness, pickup experience, value.
  - Aggregated rating calculation automatically updating vehicle's average rating and review count.
  - Optional photo upload of rental experience with automated moderation.
* **Dependencies**: Phase 10.
* **Risks**: Review spam or malicious rating manipulation.
* **Completion Criteria**:
  - System rejects review attempts from users without a verified `COMPLETED` booking for the specified vehicle.
  - Only 1 review permitted per reservation ID.

---

## Phase 15 — Security Hardening, Audit & Compliance

* **Objective**: Conduct rigorous security hardening, penetration testing, vulnerability remediation, and data compliance checks.
* **Features**:
  - Content Security Policy (CSP) and HTTP security headers (`helmet`).
  - Rate limiting middleware (`express-rate-limit`) on authentication, search, and checkout routes.
  - Cross-Site Scripting (XSS) prevention: input sanitization and DOMPurify for rendered HTML.
  - SQL / NoSQL injection defense via strict ORM parameterization.
  - GDPR / Digital Personal Data Protection (DPDP) compliance: customer data export and right-to-be-forgotten deletion endpoints.
* **Dependencies**: Phases 2 through 14.
* **Risks**: Zero-day vulnerabilities in third-party npm packages; misconfigured CORS.
* **Completion Criteria**:
  - Automated vulnerability scanners (e.g. `npm audit`, OWASP ZAP) pass with 0 critical or high vulnerabilities.
  - A+ rating on Mozilla Observatory security header assessment.

---

## Phase 16 — Comprehensive Testing & Quality Assurance

* **Objective**: Implement automated testing across unit, integration, and end-to-end user workflows.
* **Features**:
  - Unit tests: Pricing calculator, date validation, auth token generators (Jest / Vitest).
  - API integration tests: Full booking flow, availability collision, payment webhooks (Supertest).
  - End-to-end browser tests: Complete 5-step checkout wizard, filter catalog, mobile drawer (Playwright).
  - Performance & load testing: Catalog search and availability engine under 1,000 virtual users (k6).
* **Dependencies**: Phase 15.
* **Risks**: Flaky E2E tests in CI/CD pipeline; database state contamination between tests.
* **Completion Criteria**:
  - Unit & integration test coverage exceeds 85% on business logic and financial calculations.
  - Automated CI test suite executes in under 5 minutes.

---

## Phase 17 — Production Deployment & Observability

* **Objective**: Deploy containerized application with high availability, automated CI/CD, SSL, and real-time monitoring.
* **Features**:
  - Docker containerization for frontend (Nginx) and backend (Node.js runtime).
  - Infrastructure setup: Cloud hosting (AWS ECS / DigitalOcean / Vercel + Managed Database).
  - CDN configuration (Cloudflare) for edge caching of static assets and DDoS protection.
  - Automated CI/CD pipeline (GitHub Actions) with linting, testing, Docker build, and zero-downtime deployment.
  - Real-time observability: Application Performance Monitoring (Sentry, Prometheus / Grafana, uptime monitoring).
* **Dependencies**: Phase 16.
* **Risks**: Production downtime during database schema migration; secret leak in deployment scripts.
* **Completion Criteria**:
  - Automated blue/green or rolling zero-downtime deployments.
  - Real-time alerting configured for 5xx error spikes or latency degradations.
  - Production SSL certificate active with automatic renewal.
