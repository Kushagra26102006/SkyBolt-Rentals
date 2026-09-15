# SkyBolt Rentals — System Architecture Document

> **Status:** Current State Analysis & Target Production Architecture  
> **Scope:** Architectural Foundation, Domain Modeling, Interface Contracts & Migration Strategy  
> **Document:** `docs/ARCHITECTURE.md`  

---

## 1. Current Architecture (Prototype State)

### 1.1 High-Level Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER BROWSER CLIENT                           │
│                                                                         │
│  ┌───────────────────────┐         ┌─────────────────────────────────┐  │
│  │     HTML / Views      │         │       JavaScript Modules        │  │
│  │  - index.html         │         │  - app.js (Theme & Navbar)      │  │
│  │  - vehicles.html      │<───────>│  - vehicles.js (Filter/Search)  │  │
│  │  - vehicle-details    │         │  - details.js (Specs/Calc)      │  │
│  │  - booking.html       │         │  - booking.js (Wizard Engine)   │  │
│  │  - dashboard.html     │         │  - auth.js (Client Mock Auth)   │  │
│  │  - login / register   │         │  - toast.js & ui.js             │  │
│  └───────────────────────┘         └────────────────┬────────────────┘  │
│                                                     │                   │
│                                    ┌────────────────┴────────────────┐  │
│                                    │        Local Data Layer         │  │
│                                    │  - data.js (Hardcoded Array)    │  │
│                                    │  - Browser localStorage         │  │
│                                    │    * skybolt_user               │  │
│                                    │    * skybolt_users              │  │
│                                    │    * skybolt_bookings           │  │
│                                    │    * skybolt_favorites          │  │
│                                    └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                             (No Network API)
                             (No Remote Database)
```

### 1.2 Characteristics and Limitations of Current State

1. **Client-Side Monolith**: All application logic (state transitions, data management, financial math, input validation) executes entirely inside the user's browser.
2. **Ephemeral & Insecure Storage**: Application state is split between static memory (`data.js`) and unencrypted browser `localStorage`.
3. **No Centralized Truth**: Each user's browser is an isolated silo. Vehicle reservations made on one device are completely invisible to any other client.
4. **Untrusted Client Computations**: The frontend acts as the pricing engine, payment validator, and inventory manager, violating fundamental security principles.

---

## 2. Proposed Production Architecture

### 2.1 Target Enterprise Architecture Flow

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       5-TIER LAYERED ARCHITECTURAL FLOW                     │
└─────────────────────────────────────────────────────────────────────────────┘

  1. Frontend Client (Vanilla HTML5 / CSS3 Responsive UI)
     └── Centralized Runtime Configuration (`js/config.js`)
            │
            ▼
  2. Frontend API Client (`js/api.js`)
     ├── Unified Transport (`fetch` with AbortController timeouts)
     ├── Correlation ID (`X-Request-ID` generation & propagation)
     └── Standard Error Envelope Normalization
            │
            ▼ (HTTP / TLS 1.3 / JSON)
  3. API Gateway & Express Server (`backend/src/app.ts`)
     ├── Security Headers (`helmet`)
     ├── Strict Origin Whitelist (`cors`)
     ├── IP Rate Limiting (`express-rate-limit`)
     ├── Correlation ID Middleware (`X-Request-ID`)
     ├── Structured Request Logger (with sensitive parameter redaction)
     └── Request Validation Middleware (Zod schemas)
            │
            ▼
  4. Controllers & Routing (`backend/src/controllers/` & `routes/`)
     ├── Route Definitions (`/api/v1/*`)
     ├── HTTP Status Mapping & Envelope Serialization
     └── Asynchronous Handler Wrapper (`asyncHandler`)
            │
            ▼
  5. Services (`backend/src/services/`)
     └── Pure Business Logic, Invariants & State Machines
            │
            ▼
  6. Repositories (`backend/src/repositories/`)
     └── Persistence Abstraction & Query Construction
            │
            ▼
  7. Mongoose ODM Models (`backend/src/models/`)
     └── Schema Validation, Document Hooks & Virtuals
            │
            ▼
  8. MongoDB Database Engine
     └── Document Store (MongoDB Atlas / Replica Set)
```

### 2.2 External Integrations & Infrastructure Status

The following external services are architecturally mapped and scheduled across upcoming roadmap phases:

| External Service Domain | Target Provider | Architectural Status | Implementation Phase |
| :--- | :--- | :---: | :---: |
| **Document Database** | MongoDB 7+ / Atlas (Mongoose ODM) | `ACTIVE` | Task 04 |
| **Authentication Engine** | Bcrypt + JWT (HttpOnly Cookies) | `PLANNED` | Phase 4 / Task 05 |
| **Payment Gateway** | Stripe / Razorpay | `PLANNED` | Phase 9 |
| **Transactional Email** | SendGrid / AWS SES | `PLANNED` | Phase 13 |
| **SMS Notifications** | Twilio Messaging API | `PLANNED` | Phase 13 |
| **Geolocation & Maps** | Google Maps JavaScript API | `PLANNED` | Phase 12 |
| **Object Cloud Storage** | AWS S3 / Cloudinary | `PLANNED` | Phase 10 |
| **Distributed Cache / Queue** | Redis + BullMQ | `PLANNED` | Phase 6 |
| **Monitoring & Sentry** | Sentry SDK + Prometheus | `PLANNED` | Phase 16 |

---

## 3. Component Definitions & Functional Responsibilities

### 3.1 Frontend Tier
- **Presentation & Navigation**: Renders dynamic vehicle catalogs, interactive filters, reservation wizards, and user dashboards.
- **Client-Side Form Validation**: Immediate UI feedback (e.g., matching passwords, valid email syntax, minimum date selections).
- **Asynchronous API Client**: Centralized HTTP client (using `fetch` with request/response interceptors) that handles authentication headers, token refresh flows, and unified error presentation.

### 3.2 Backend API Services (Micro-modules)

1. **Authentication Service**:
   - Handles account registration, cryptographic password hashing (bcrypt), and credential verification.
   - Issues short-lived access JWTs and rotating refresh tokens via secure `HttpOnly` cookies.
   - Enforces Role-Based Access Control (`CUSTOMER`, `STAFF`, `ADMIN`).

2. **Users Service**:
   - Manages customer profile records, phone verification, and driving license image uploads.
   - Provides GDPR-compliant account export and account closure workflows.

3. **Vehicles Service**:
   - Serves fleet catalog with server-side filtering, sorting, pagination, and multi-attribute search.
   - Supports administrative CRUD operations for vehicle additions, spec updates, and photo management.

4. **Availability Engine**:
   - Evaluates temporal booking conflicts across all vehicle reservations.
   - Implements atomic locking (e.g., 10-minute hold reservation during payment checkout) using Redis distributed locks.

5. **Bookings Service**:
   - Enforces the reservation state machine (`PENDING` -> `CONFIRMED` -> `ACTIVE` -> `COMPLETED` | `CANCELLED`).
   - Generates unique, non-enumerable booking reference codes (`SKY-2026-XXXXXX`).
   - Manages cancellation policies, penalty fee calculations, and inventory release.

6. **Pricing Engine**:
   - Authoritative source for all financial calculations.
   - Computes base rental totals, dynamic surge rates, seasonal adjustments, mandatory taxes (GST/VAT 18%), and category-specific security deposits.
   - Validates discount coupons and referral credits.

7. **Payments Service**:
   - Interfaces directly with PCI-DSS certified payment gateways (Stripe / Razorpay).
   - Handles pre-authorization holds for security deposits.
   - Consumes signed webhook events to transition booking states asynchronously.

8. **Notifications Service**:
   - Asynchronous queue-based dispatcher for transactional emails (SendGrid/SES) and SMS reminders (Twilio).
   - Manages booking receipts, rental reminder notifications, and cancellation summaries.

9. **Reviews Service**:
   - Restricts review submissions exclusively to customers with completed rentals for that specific vehicle.
   - Recalculates vehicle aggregate ratings and verified review counts automatically.

10. **Admin & Fleet Management Service**:
    - Centralized back-office interface for fleet managers.
    - Manages multi-city physical hub allocations, maintenance downtime, and damage inspection logs.

---

## 4. Core Domain Data Models (Entity-Relationship Overview)

```text
┌──────────────────────┐        ┌──────────────────────┐        ┌──────────────────────┐
│       locations      │        │       vehicles       │        │        users         │
├──────────────────────┤        ├──────────────────────┤        ├──────────────────────┤
│ id (PK, UUID)        │1      *│ id (PK, UUID)        │*      1│ id (PK, UUID)        │
│ name (VARCHAR)       ├───────<┤ location_id (FK)     │        │ email (UNIQUE)       │
│ city (VARCHAR)       │        │ name (VARCHAR)       │        │ password_hash (TEXT) │
│ address (TEXT)       │        │ category (ENUM)      │        │ full_name (VARCHAR)  │
│ is_active (BOOLEAN)  │        │ price_per_day (INT)  │        │ phone (VARCHAR)      │
└──────────────────────┘        │ fuel_type (ENUM)     │        │ license_no (VARCHAR) │
                                │ transmission (ENUM)  │        │ role (ENUM)          │
                                │ is_active (BOOLEAN)  │        │ created_at (TIMESTMP)│
                                └──────────┬───────────┘        └──────────┬───────────┘
                                           │1                              │1
                                           │                               │
                                           │*                              │*
                                ┌──────────┴───────────────────────────────┴───────────┐
                                │                       bookings                       │
                                ├──────────────────────────────────────────────────────┤
                                │ id (PK, UUID)                                        │
                                │ reference_code (VARCHAR, UNIQUE)                     │
                                │ user_id (FK -> users.id)                             │
                                │ vehicle_id (FK -> vehicles.id)                       │
                                │ pickup_date (DATE)                                   │
                                │ return_date (DATE)                                   │
                                │ status (ENUM: PENDING, CONFIRMED, ACTIVE, COMPLETED) │
                                │ base_amount (INT)                                    │
                                │ tax_amount (INT)                                     │
                                │ deposit_amount (INT)                                 │
                                │ total_amount (INT)                                   │
                                │ payment_intent_id (VARCHAR)                          │
                                │ created_at (TIMESTAMP)                               │
                                └──────────────────────────┬───────────────────────────┘
                                                           │1
                                                           │
                                                           │0..1
                                ┌──────────────────────────┴───────────┐
                                │                       reviews        │
                                ├──────────────────────────────────────┤
                                │ id (PK, UUID)                        │
                                │ booking_id (FK -> bookings.id, UNIQ) │
                                │ vehicle_id (FK -> vehicles.id)       │
                                │ user_id (FK -> users.id)             │
                                │ rating (SMALLINT, 1-5)               │
                                │ comment (TEXT)                       │
                                │ created_at (TIMESTAMP)               │
                                └──────────────────────────────────────┘
```

---

## 5. Key REST API Endpoint Contracts

### 5.1 Authentication (`/api/v1/auth`)
- `POST /register`: Registers a customer, returns safe user object, sets auth cookie.
- `POST /login`: Authenticates email + password, returns JWT session cookie.
- `POST /logout`: Clears session cookies and revokes refresh tokens.
- `GET  /me`: Returns current authenticated user profile.

### 5.2 Vehicles (`/api/v1/vehicles`)
- `GET  /`: Query catalog (`?category=bike&minPrice=200&maxPrice=800&locationId=...&sort=price_asc&page=1&limit=12`).
- `GET  /:id`: Fetch complete vehicle specifications and availability status.
- `POST /`: (Admin only) Create new vehicle listing.
- `PATCH /:id`: (Admin only) Modify rates, specs, or availability flags.

### 5.3 Availability & Quotes (`/api/v1/quotes`)
- `POST /`: Submit `{ vehicleId, pickupDate, returnDate }`, returns validated price quote, tax computation, and availability confirmation.

### 5.4 Bookings (`/api/v1/bookings`)
- `POST /`: Submit reservation request `{ quoteId, customerInfo }`. Creates temporary hold and payment intent.
- `GET  /my-bookings`: Fetches active and past bookings for the authenticated user.
- `POST /:id/cancel`: Requests cancellation of an upcoming booking under business policy rules.

### 5.5 Payments (`/api/v1/payments`)
- `POST /webhook`: Ingests asynchronous payment events from payment processor (Stripe/Razorpay) to confirm booking.

---

## 6. Security Architecture & Boundary Controls

```text
Untrusted Zone (Browser Client)
─────────────────────────────── [TLS 1.3 / HTTPS Encryption] ───────────────────────────────
Demilitarized Zone (API Gateway & Edge)
  - Cloudflare DDoS Mitigation & WAF
  - Helmet Security Headers (Content Security Policy, HSTS, X-Frame-Options)
  - Rate Limiting (100 req/min general, 5 req/min auth)
  - CORS Whitelist (Restricted to official SkyBolt domain)
─────────────────────────────── [JWT Signature & Cookie Check] ────────────────────────────
Application Core
  - Input Validation: Strict schema enforcement (Zod / Joi) on all payloads
  - Contextual Authorization: Users can only access their own booking records
  - Role Guards: Staff/Admin endpoints strictly enforce administrative privileges
  - Secrets Management: Zero credentials in source code; injected via environment variables
─────────────────────────────── [Internal Network / VPC] ──────────────────────────────────
Data Layer
  - PostgreSQL with parameter-binding queries (Zero SQL injection)
  - Data at rest encrypted via AES-256
  - Private subnets (Database inaccessible from public Internet)
```

---

## 7. Migration Strategy (From Prototype to Production)

To transition gracefully without disrupting active development:

1. **Step 1: API Client Layer Integration**:
   - Replace direct `localStorage` read/write calls in the frontend with a unified API client module (`js/api.js`).
   - Initially, `api.js` can mock responses or proxy to localStorage during development.

2. **Step 2: Incremental Endpoint Adoption**:
   - **Phase A**: Migrate vehicle catalog read operations to `GET /api/v1/vehicles`.
   - **Phase B**: Migrate user authentication to real `/api/v1/auth` endpoints.
   - **Phase C**: Migrate booking submission and calculation to server-side endpoints.

3. **Step 3: Deprecate Mock Stores**:
   - Completely remove client-side `skybolt_users` and `skybolt_bookings` keys from localStorage.
   - Restrict localStorage usage strictly to non-sensitive user UI preferences (`skybolt_theme`).

---

## 8. Future Configuration Architecture & Secrets Hierarchy

When backend services and external integrations are introduced in subsequent phases, configuration and credentials will follow a strict, isolated secrets hierarchy. No server secrets will ever be bundled into frontend client code.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SERVER ENVIRONMENT & SECRETS INVENTORY                 │
├───────────────────┬───────────────────────────┬─────────────────────────────┤
│ Domain            │ Configuration Variables   │ Target Storage Mechanism    │
├───────────────────┼───────────────────────────┼─────────────────────────────┤
│ 1. Database       │ DATABASE_URL              │ AWS Secrets Manager / Vault │
│                   │ DB_POOL_MIN, DB_POOL_MAX  │ Injected at container boot  │
├───────────────────┼───────────────────────────┼─────────────────────────────┤
│ 2. Authentication │ JWT_SECRET                │ Encrypted KMS / Env Secret  │
│                   │ JWT_ACCESS_EXPIRY (15m)   │ Server runtime only         │
│                   │ JWT_REFRESH_EXPIRY (7d)   │                             │
├───────────────────┼───────────────────────────┼─────────────────────────────┤
│ 3. Payments       │ STRIPE_SECRET_KEY         │ Payment Vault / Server Env  │
│                   │ STRIPE_WEBHOOK_SECRET     │ (Client receives only       │
│                   │ RAZORPAY_KEY_SECRET       │ STRIPE_PUBLISHABLE_KEY)     │
├───────────────────┼───────────────────────────┼─────────────────────────────┤
│ 4. Email Service  │ SENDGRID_API_KEY          │ Transactional Mail Dispatch │
│                   │ EMAIL_FROM_ADDRESS        │ Server-side BullMQ worker   │
├───────────────────┼───────────────────────────┼─────────────────────────────┤
│ 5. SMS Service    │ TWILIO_ACCOUNT_SID        │ Messaging Gateway Secrets   │
│                   │ TWILIO_AUTH_TOKEN         │ Never exposed to frontend   │
│                   │ TWILIO_PHONE_NUMBER       │                             │
├───────────────────┼───────────────────────────┼─────────────────────────────┤
│ 6. Cloud Storage  │ AWS_ACCESS_KEY_ID         │ Private S3 / Cloudinary     │
│                   │ AWS_SECRET_ACCESS_KEY     │ Direct uploads via short-   │
│                   │ AWS_S3_BUCKET_NAME        │ lived pre-signed URLs only  │
├───────────────────┼───────────────────────────┼─────────────────────────────┤
│ 7. Geolocation    │ GOOGLE_MAPS_API_KEY       │ Client key with HTTP referer│
│    & Maps         │ MAPBOX_ACCESS_TOKEN       │ restriction to skybolt domain│
├───────────────────┼───────────────────────────┼─────────────────────────────┤
│ 8. Redis / Cache  │ REDIS_URL                 │ Private VPC Subnet          │
│                   │ REDIS_PASSWORD            │ Distributed lock / sessions │
├───────────────────┼───────────────────────────┼─────────────────────────────┤
│ 9. Observability  │ SENTRY_DSN                │ Client DSN (public error id)│
│    & Monitoring   │ SENTRY_AUTH_TOKEN         │ CI/CD release tracking      │
│                   │ PROMETHEUS_METRICS_PORT   │ Private internal scraper    │
└───────────────────┴───────────────────────────┴─────────────────────────────┘
```

### Configuration Resolution Sequence
1. **Frontend Client**: Consumes `window.SkyBoltConfig` (`js/config.js`), restricted to public origins, public IDs, and feature flags.
2. **Backend Services**: Load environment variables via validated schemas (`zod` or `joi`) from Docker/Kubernetes runtime secrets.
3. **Continuous Integration**: Secrets are injected via GitHub Actions Secrets during test and deployment steps, never stored in repository files.

---

## 9. MongoDB Database Foundation & Indexing Strategy

### 9.1 Base Model Conventions
All upcoming Mongoose models follow standardized schema architecture defined in `backend/src/models/base.schema.ts`:
- **Identifiers**: Default to native 12-byte BSON `ObjectId`. Frontends receive standard `id` string via `toJSON` virtual mapping.
- **Timestamps**: Enabled across all collections (`createdAt`, `updatedAt`).
- **Collection Naming**: Strict plural lowercase (e.g. `users`, `vehicles`, `bookings`, `payments`, `reviews`).
- **Soft Deletion**: Standardized `{ isDeleted: Boolean, deletedAt: Date }` for reversible resource cleanup.

### 9.2 Database Indexing Strategy
To ensure sub-10ms query times under high concurrent rental operations, the following compound and specialized indexes are mapped:

| Target Model | Index Definition | Query Optimization Goal |
| :--- | :--- | :--- |
| **Users** | `{ email: 1 }` (unique) | O(1) credential lookups during authentication |
| **Vehicles** | `{ category: 1, isAvailable: 1, location: 1 }` | Catalog multi-filter and location search queries |
| **Locations** | `{ slug: 1 }` (unique), `{ coordinates: "2dsphere" }` | Geospatial hub discovery & nearest branch lookups |
| **Bookings** | `{ vehicleId: 1, status: 1, pickupDate: 1, returnDate: 1 }` | **Critical availability collision queries** |
| **Bookings** | `{ customerId: 1, createdAt: -1 }` | Customer reservation history & dashboard timeline |
| **Bookings** | `{ referenceCode: 1 }` (unique) | Instant customer lookup by `SKY-2026-XXXXXX` |
| **Payments** | `{ razorpayOrderId: 1 }` (unique), `{ bookingId: 1 }` | Idempotent payment webhook verification & reconciliation |
| **Reviews** | `{ vehicleId: 1, rating: -1 }` | Aggregate vehicle rating calculations |

### 9.3 ACID Multi-Document Transactions
Critical reservation and financial operations require multi-document atomicity:
1. **Booking Confirmation**: Marking vehicle reserved + creating booking record + logging payment state.
2. **Cancellation & Inventory Release**: Updating booking status to `CANCELLED` + releasing reservation block + creating refund journal entry.
* **Requirement**: MongoDB Atlas or self-hosted Replica Set deployment supporting `client.startSession()` and `session.withTransaction()`.

---

## 10. Authentication, Authorization & User Management Architecture (TASK 05)

### 10.1 Multi-Layered Authentication Architecture

```text
Browser Client (React / HTML)
       │
       │  HTTP Request + skybolt_auth (HttpOnly, SameSite=Lax Cookie)
       ▼
   Helmet + CORS (credentials: true)
       │
   CSRF Protection (Origin / Referer Verification)
       │
   Rate Limiting (15 req / 15 min for auth endpoints)
       │
   Cookie Parser
       │
   requireAuth Middleware (jwt.verify, DB user status check)
       │
   requireRole Middleware (RBAC: CUSTOMER | STAFF | FLEET_MANAGER | ADMIN)
       │
   AuthController / UserController
       │
   AuthService / UserService
       │
   UserRepository (select: false on passwordHash)
       │
   Mongoose UserModel (timestamps, soft delete, safe DTO transform)
       │
   MongoDB (users collection with unique email index)
```

### 10.2 Security Highlights
1. **Zero Client Token Storage**: Authentication tokens are never stored in `localStorage` or `sessionStorage`. They are held strictly inside an `HttpOnly` cookie (`skybolt_auth`), immune to JavaScript XSS extraction.
2. **Authoritative Server Verification**: Every authenticated request evaluates the user against the database to guarantee accounts marked `SUSPENDED` or `DEACTIVATED` are blocked instantly.
3. **Mass Assignment Prevention**: Strict Zod schemas reject unexpected fields (`role`, `status`, `passwordHash`) on registration and profile update endpoints.
4. **Password Security**: Passwords are required to be at least 8 characters and are hashed using `bcryptjs` with salt work factor 10. Hashes are marked `select: false` on Mongoose schema to prevent accidental serialization.
5. **Account Enumeration Defense**: Login and forgot-password endpoints respond with timing-safe generic messages so malicious actors cannot deduce whether an email address is registered.

---

## 11. Vehicle Catalog Architecture (TASK 06)

### 11.1 Domain Architecture Pipeline

```text
React / Frontend Client
       │
       │  HTTP /api/v1/vehicles (with filters, sorting, search, pagination)
       ▼
   Express Router (src/routes/vehicle.routes.ts)
       │
       ├── requireAuth & requireRole('ADMIN', 'FLEET_MANAGER') [for POST, PATCH, DELETE]
       ├── validateRequest(listVehiclesQuerySchema / createVehicleSchema / updateVehicleSchema)
       ▼
   VehicleController (src/controllers/vehicle.controller.ts)
       │
   VehicleService (src/services/vehicle.service.ts)
       │  • Business Rules & Status Transition Control
       │  • Registration Number Uniqueness & Formatting
       │  • Pagination & Sorting Mapping
       │  • Public vs Admin Serialization Separation
       ▼
   VehicleRepository (src/repositories/vehicle.repository.ts)
       │  • Compound Queries & Bounded Projections
       │  • Dual-lookup by ObjectId or vehicleCode
       │  • Soft-retire operations
       ▼
   Mongoose VehicleModel (src/models/vehicle.model.ts)
       │  • Strict Schema Validation & Enums
       │  • Compound & Text Indexes
       ▼
   MongoDB (vehicles collection)
```

### 11.2 Vehicle Schema & Lifecycle Design

```text
Vehicle Document
├── identity
│   ├── vehicleCode (Unique index, e.g. SKY-VHC-001)
│   ├── brand, model, name, variant, year
│   └── registrationNumber (Unique, sparse, select: false)
│
├── category (CAR | SUV | SEDAN | HATCHBACK | BIKE | SCOOTER | EV | LUXURY)
│
├── specifications
│   ├── seats, doors
│   ├── transmission (AUTOMATIC | MANUAL)
│   ├── fuelType (PETROL | DIESEL | ELECTRIC | HYBRID | MANUAL)
│   ├── engineCC, mileage, luggageCapacity
│
├── rental
│   ├── rentalType (DAILY | HOURLY | WEEKLY)
│   ├── baseRate (integer currency units)
│   ├── currency (e.g. INR)
│   └── deposit
│
├── location
│   ├── locationId (Reference to future Location model)
│   ├── name, city, address
│
├── images: Array<{ url, thumbnailUrl, altText, isPrimary, sortOrder }>
├── features: Array<string>
├── rating: { average, count }
├── status: DRAFT | ACTIVE | INACTIVE | MAINTENANCE | RETIRED
├── isDeleted: boolean (Soft delete flag)
└── timestamps: createdAt, updatedAt
```

### 11.3 Lifecycle State Machine & Access Control
- `DRAFT`: Initial creation state for unreleased fleet assets. Visible only to `ADMIN` and `FLEET_MANAGER`.
- `ACTIVE`: Available for public catalog display and customer browsing.
- `INACTIVE` / `MAINTENANCE`: Temporarily removed from public catalog during servicing. Only staff can view or update.
- `RETIRED`: Decommissioned vehicles. Soft-deleted from active operations. Non-admin users cannot reactivate a `RETIRED` vehicle.

### 11.4 Database Indexes & Query Optimizations
1. **Compound Index for Catalog Queries**:
   - `{ category: 1, status: 1, 'rental.baseRate': 1 }`: Supports fast category + active status filtering combined with price range queries and sorting.
2. **Compound Index for Location Search**:
   - `{ 'location.name': 1, status: 1 }`: Optimizes city and pickup station searches.
3. **Compound Index for Rating Sorting**:
   - `{ status: 1, 'rating.average': -1 }`: Accelerates popularity/rating sorting on active fleet.
4. **Text Index for Keyword Search**:
   - `{ name: 'text', brand: 'text', model: 'text' }`: Provides high-performance text search across titles and brands without full collection scans.
5. **Unique Indexes**:
   - `{ vehicleCode: 1 }` (unique, uppercase)
   - `{ registrationNumber: 1 }` (unique, sparse, select: false)

### 11.5 Public vs Admin Serialization
- **Public DTO (`toSafeVehicle`)**:
  - Exposes: `id`, `vehicleCode`, `name`, `brand`, `model`, `year`, `category`, `specifications`, `rental`, `location`, `images`, `features`, `rating`, `status`.
  - Omits: Sensitive fleet data (`registrationNumber`), administrative notes (`adminNotes`), and internal soft-delete flags (`isDeleted`, `deletedAt`).
- **Admin DTO (`toAdminVehicle`)**:
  - Accessible only to authorized `ADMIN` and `FLEET_MANAGER` sessions. Exposes complete operational data including registration numbers and fleet notes.

### 11.6 Future Integration Points
- **Task 07 (Availability & Calendar Engine)**: Will query vehicles by `_id` and evaluate reservations from a dedicated `reservations` / `booking_locks` collection.
- **Task 08 (Booking Engine)**: Will reference `vehicle._id` in reservation documents.
- **Task 09 (Authoritative Pricing Engine)**: Will use `rental.baseRate` as the starting calculation unit, adding dynamic multipliers, GST taxes, deposits, and discounts.

---

## 12. Availability Engine & Inventory Locking Architecture (TASK 07)

### 12.1 Availability & Locking Pipeline

```text
React / Frontend Booking UI
       │
       │  HTTP /api/v1/vehicles/:id/availability (or /holds)
       ▼
   Express Router (src/routes/availability.routes.ts)
       │
       ├── validateRequest(availabilityQuerySchema / createHoldSchema)
       ├── requireAuth (required for holds, optional for availability checks)
       ▼
   AvailabilityController (src/controllers/availability.controller.ts)
       │
   AvailabilityService (src/services/availability.service.ts)
       │  • Interval Semantics & Boundary Validation
       │  • Vehicle Operational Status Verification
       │  • AsyncKeyedMutex (Serializes concurrent hold operations per vehicleId)
       ▼
   ReservationRepository (src/repositories/reservation.repository.ts)
       │  • Overlap Query: (pickupAt < requested.returnAt AND returnAt > requested.pickupAt)
       │  • Evaluates blocking statuses (CONFIRMED, ACTIVE, non-expired HELD)
       │  • Bulk non-blocking queries for catalog search (zero N+1)
       ▼
   Mongoose ReservationModel (src/models/reservation.model.ts)
       │  • Compound index: { vehicleId: 1, status: 1, pickupAt: 1, returnAt: 1 }
       │  • Expiration TTL index: { status: 1, expiresAt: 1 }
       ▼
   MongoDB (reservations collection)
```

### 12.2 Date Interval Semantics & Timezone Policy
- **Storage**: Native BSON `Date` values in UTC.
- **Input / Wire**: Strict ISO-8601 UTC strings (`YYYY-MM-DDTHH:mm:ss.sssZ`).
- **Interval Formula**: Half-open interval `[pickupAt, returnAt)`.
- **Authoritative Overlap Formula**:
  Two intervals `A` and `B` overlap if and only if:
  ```text
  A.pickupAt < B.returnAt AND A.returnAt > B.pickupAt
  ```
- **Boundary Semantics**:
  Adjacent intervals where `A.returnAt == B.pickupAt` (e.g. Return at 10:00 AM on 12 Sep, Pickup at 10:00 AM on 12 Sep) do **NOT** overlap, allowing continuous operational utilization of the vehicle.

### 12.3 Status Categorization & Operational Gates
- **Vehicle Operational Status Gate**:
  - `status: 'ACTIVE'`: Rentable.
  - `status: 'MAINTENANCE'`: Returns `available: false`, reason: `VEHICLE_MAINTENANCE`.
  - `status: 'INACTIVE' | 'DRAFT' | 'RETIRED'`: Returns `available: false`, reason: `VEHICLE_NOT_RENTABLE`.
- **Reservation Blocking Statuses**:
  - `CONFIRMED`: Active confirmed booking.
  - `ACTIVE`: Vehicle currently out on trip.
  - `HELD`: Temporary hold with future `expiresAt` (`expiresAt > now`).
- **Reservation Non-Blocking Statuses**:
  - `CANCELLED`, `COMPLETED`, `EXPIRED`, or `HELD` with past `expiresAt`.

### 12.4 Concurrency Protection & Inventory Locking
To eliminate the classic race condition where simultaneous concurrent requests pass availability checks and double-book a vehicle:
1. `AvailabilityService` employs an `AsyncKeyedMutex` keyed by `vehicleId`.
2. Hold creation operations (`POST /vehicles/:id/holds`) are atomically serialized for that specific vehicle.
3. The mutex-guarded sequence atomically inspects live database overlaps and creates the `HELD` record with a cryptographically secure `holdToken` and a 15-minute expiration timestamp (`expiresAt`).
4. Any competing concurrent request for overlapping dates immediately detects the newly placed hold and is safely rejected with `409 Conflict` (`VEHICLE_UNAVAILABLE`).
5. Expired holds naturally become non-blocking in future interval queries without requiring synchronous background workers.

---

## 13. Production Booking State Machine & Reservations Architecture (Task 08)

```text
React / Web Frontend
       │
       ▼ (HTTP POST /api/v1/bookings with Bearer / Cookie & Idempotency-Key)
Booking Controller
       │
       ▼ (Validates schema, strips untrusted fields, derives userId from session)
Booking Service
       │
       ├──► Idempotency Layer (Inspects / writes IdempotencyModel with 24h TTL)
       │
       ├──► Availability Service (lockAndExecute mutex per vehicleId)
       │         │
       │         ▼ (Checks overlapping blocking intervals [pickupAt, returnAt))
       │    Reservation Repository (Atomically creates CONFIRMED reservation)
       │
       ├──► Baseline Pricing Calculator (Server-authoritative baseline; Task 09 boundary)
       │
       ├──► Booking State Machine (Asserts initial PENDING state)
       │
       ▼
Booking Repository / Model (Persists Booking with unique reference & snapshots)
```

### 13.1 Booking Domain Model
- **`bookingReference`**: Unique, human-readable identifier (`SKY-YYYYMMDD-XXXXXX`), generated using `crypto.randomBytes(3).toString('hex').toUpperCase()`, indexed with unique database constraint.
- **`userId`**: Strictly derived from `req.user.id`. Customer inputs attempting to manipulate `userId` are ignored or rejected.
- **`vehicleId`**: References an active, rentable vehicle.
- **`reservationId`**: Directly links to the Task 07 `ReservationModel` record to prevent double-booking.
- **`pickupAt` / `returnAt`**: Native BSON `Date` objects in UTC enforcing `pickupAt < returnAt`.
- **`status`**: Controlled strictly by `BookingStateMachine`.
- **`paymentStatus`**: Completely decoupled from booking status (`UNPAID`, `PENDING`, `PAID`, `FAILED`, `REFUNDED`).
- **Snapshots**:
  - `pricingSnapshot`: Immutable baseline financial breakdown.
  - `vehicleSnapshot`: Vehicle specifications and media at time of reservation.
  - `locationSnapshot`: Hub name and address.
- **`statusHistory`**: Audit trail recording `{ from, to, changedAt, changedBy, reason }`.

### 13.2 Booking State Machine & Transition Matrix
```text
  [ DRAFT ]
      │
      ▼
  [ PENDING ] ──────┬───────────────┐
      │             │               │
      ▼             ▼               ▼
 [ PAYMENT_PENDING ]──► [ CANCELLED ]   [ EXPIRED ]
      │             │               ▲
      ▼             │               │
 [ CONFIRMED ] ─────┘               │
      │                             │
      ▼                             │
  [ ACTIVE ]                        │
      │                             │
      ▼                             │
 [ COMPLETED ]                      │
                                    │
 (From PENDING / PAYMENT_PENDING) ──┘
```

#### State Transition Rules:
| State | Next Allowed States | Permitted Roles | Notes |
| :--- | :--- | :--- | :--- |
| `DRAFT` | `PENDING` | Customer / System | Initial creation |
| `PENDING` | `PAYMENT_PENDING`, `CANCELLED`, `EXPIRED` | Customer / System | Cancellation releases reservation |
| `PAYMENT_PENDING` | `CONFIRMED`, `CANCELLED`, `EXPIRED` | Payment Service / Staff | Task 10 payment confirmation |
| `CONFIRMED` | `ACTIVE`, `CANCELLED` | Staff / Customer | Vehicle handover or cancellation |
| `ACTIVE` | `COMPLETED` | Operational / Staff | Vehicle returned |
| `COMPLETED` | *(None)* | Terminal | Rental concluded |
| `CANCELLED` | *(None)* | Terminal | Inventory released |
| `EXPIRED` | *(None)* | Terminal | Inventory released |

*All invalid transitions (e.g. `COMPLETED -> CONFIRMED`, `CANCELLED -> ACTIVE`, `EXPIRED -> CONFIRMED`) are rejected with `409 Conflict` / `INVALID_STATE_TRANSITION`.*

### 13.3 Double-Booking Prevention & Concurrency Control
- Check-and-reserve is executed under `AvailabilityService.lockAndExecute(vehicleId, ...)` utilizing keyed `AsyncKeyedMutex`.
- When creating a booking, a blocking `ReservationModel` record (`status: 'CONFIRMED'`) is atomically inserted before releasing the vehicle lock.
- Any concurrent request for overlapping intervals detects the blocking record and is rejected with `409 VEHICLE_UNAVAILABLE`.
- When a booking is cancelled via `POST /api/v1/bookings/:id/cancel`, the linked reservation is updated to `CANCELLED`, instantly releasing the inventory.

### 13.4 Server-Side Idempotency
- `IdempotencyModel` stores `{ key, userId, requestFingerprint, responseStatus, responseBody, expiresAt }`.
- Scoped uniqueness on `{ key: 1, userId: 1 }`.
- Auto-expires after 24 hours via MongoDB TTL index.
- Safe client retries return the exact cached response without creating duplicate database records or charging multiple times.
- Reusing a key with different request parameters triggers `409 IDEMPOTENCY_CONFLICT`.

### 13.5 Task Integration Boundaries
- **Task 09 Boundary (Authoritative Pricing)**: Task 08 creates the `pricingSnapshot` schema and populates baseline pricing (`rental.baseRate * days`). Task 09 will implement dynamic pricing rules, coupons, duration discounts, and tax engines server-side.
- **Task 10 Boundary (Razorpay Payments)**: Task 08 separates `paymentStatus` from `booking.status` and supports `PAYMENT_PENDING`. Task 10 will own Razorpay order creation, SDK integration, payment verification webhooks, and transitioning `PAYMENT_PENDING -> CONFIRMED` upon verified payment.

---

## 14. Production Authoritative Server Pricing Engine Architecture (Task 09)

```text
React / Web Client
       │
       ▼ (POST /api/v1/pricing/quote OR POST /api/v1/bookings)
Pricing Controller / Booking Service
       │
       ▼ (Authoritative vehicle fetch from MongoDB: baseRate, currency, status)
Pricing Engine (PricingService.calculatePrice)
       │
       ├──► 1. Duration Calculation (24h standard rental day + 1h grace period)
       │
       ├──► 2. Gross Base Amount (baseRatePerDay * days)
       │
       ├──► 3. Duration Discounts (5% for 3-6d, 10% for 7-13d, 15% for 14d+)
       │
       ├──► 4. Coupon Validation (CouponModel: percentage/fixed, min spend, max cap)
       │
       ├──► 5. Clamped Taxable Subtotal (grossBase - totalDiscounts >= 0)
       │
       ├──► 6. Tax Calculation (18% GST on taxable subtotal)
       │
       ├──► 7. Fee Calculation (Refundable Security Deposit ₹1,000)
       │
       ▼
Final Authoritative Total (subtotal + tax + fees)
       │
       ├──► PricingQuoteDTO (Returned to client for display)
       │
       ▼
Immutable Pricing Snapshot (Persisted in Booking with pricingVersion: 'v2_engine')
```

### 14.1 Duration Policy
- **Authoritative Unit**: Standard 24-hour rental day (`DAY`).
- **Interval**: Half-open interval `[pickupAt, returnAt)`.
- **Grace Window**: 1 hour past the 24-hour cycle is permitted before triggering the next rental day billing (e.g. 24h 45m = 1 day; 25h 15m = 2 days).
- **Minimum Period**: 1 day (any valid rental < 24 hours counts as 1 rental day).

### 14.2 Money Representation & Precision
- **Currency**: Standardized to `INR`.
- **Precision**: 2 decimal places (paise precision) rounded deterministically with `roundMoney(amount) = Math.round((amount + Number.EPSILON) * 100) / 100`.
- **Zero Floating-Point Drift**: Eliminates standard IEEE 754 arithmetic inaccuracies.
- **Non-Negative Guard**: Total discounts cannot exceed gross rental amount (subtotal cannot drop below ₹0).

### 14.3 Taxes & Fees
- **Tax Model**: Standard 18% GST computed strictly on the taxable rental subtotal (after discounts).
- **Fee Model**: Standard refundable security deposit of ₹1,000 added post-tax.
- **Configurable Rules**: Abstracted in `pricing.rules.ts` to allow business adjustments without rewriting core engine logic.

### 14.4 Minimal Production Coupon Model
- Managed via `CouponModel` with compound unique index on `code`.
- Enforces validity dates (`startsAt`, `expiresAt`), minimum booking spend, maximum discount caps, and usage limits.

### 14.5 Razorpay Integration Boundary (Task 10)
```text
Task 09 (Authoritative Pricing)
       ↓
Immutable Pricing Snapshot (total, subtotal, tax, fees)
       ↓
Task 10 (Razorpay Payments)
       ↓
Creates Razorpay Order using authoritative snapshot.total (in paise: total * 100)
       ↓
Verified Payment Webhook / Client Callback confirms matching amount
       ↓
Booking CONFIRMED
```

---

## 15. Production Razorpay Payment Architecture, Webhooks & Reconciliation (TASK 10)

```text
Customer (Browser / React)
        │
        ├──► 1. Initiate Checkout (POST /api/v1/payments/orders with bookingId)
        │       │
        │       ▼
        │    Backend Payment Service
        │       │  • Verify Booking Ownership (booking.userId === authenticatedUser.id)
        │       │  • Verify Booking State (PENDING or PAYMENT_PENDING)
        │       │  • Load Authoritative Pricing Snapshot (Task 09)
        │       │  • Calculate Minor Units (paise = Math.round(snapshot.total * 100))
        │       │  • Prevent Duplicate Orders: reuse existing ORDER_CREATED order
        │       ▼
        │    Razorpay API (createOrder)
        │       │  • Creates order with integer paise amount & safe metadata notes
        │       ▼
        │    PaymentModel
        │       │  • Saves record with status 'ORDER_CREATED', unique paymentReference
        │       ▼
        │    Returns Safe Checkout DTO (keyId, orderId, amount, currency, bookingRef)
        │
        ├──► 2. Razorpay Checkout Modal (Client)
        │       │  • Opens Razorpay modal with server-returned orderId and keyId
        │       │  • Customer pays via UPI, Card, Netbanking, or Wallet
        │       ▼
        ├──► 3. Client Verification Callback (POST /api/v1/payments/verify)
        │       │  • Submits: razorpay_order_id, razorpay_payment_id, razorpay_signature
        │       ▼
        │    Backend Cryptographic Verification
        │       │  • Formula: hmac_sha256(order_id + "|" + payment_id, KEY_SECRET) === signature
        │       │  • Verifies payment amount & currency match authoritative snapshot
        │       │  • Atomic State Transition: Payment -> CAPTURED, Booking -> CONFIRMED, Reservation -> CONFIRMED
        │
        └──► 4. Official Razorpay Webhooks (POST /api/v1/payments/webhook)
                │  • Raw request body buffer preserved via Express verify middleware
                │  • Formula: hmac_sha256(rawBody, WEBHOOK_SECRET) === x-razorpay-signature
                │  • Replay Protection: WebhookEventModel records eventId; duplicate events safely ignored
                │  • Events handled: 'payment.captured', 'order.paid', 'payment.failed'
                │  • FAILED payments never falsely confirm bookings
```

### 15.1 Payment State Machine
Transitions are strictly enforced via `PaymentStateMachine`:
- `CREATED` -> `['ORDER_CREATED', 'FAILED']`
- `ORDER_CREATED` -> `['PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED']`
- `PENDING` -> `['AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED']`
- `AUTHORIZED` -> `['CAPTURED', 'FAILED']`
- `CAPTURED` -> `['REFUNDED', 'PARTIALLY_REFUNDED']`
- Terminal states: `FAILED`, `CANCELLED`, `REFUNDED`

### 15.2 Zero-Trust Security Guarantees
1. **Zero Client Trust on Money**:
   - `amount` and `currency` are never accepted from frontend requests.
   - Sourced strictly from the immutable `booking.pricingSnapshot.total`.
2. **Secret Key Segregation**:
   - `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are backend-only secrets.
   - React assets and client responses contain only the public `keyId`.
3. **Double Verification & Race Safety**:
   - Both client verification (`/payments/verify`) and webhooks (`/payments/webhook`) are idempotent.
   - Concurrent delivery of client callback and webhook resolves to a single consistent `CAPTURED` payment and `CONFIRMED` booking.
4. **Preserved Raw Body**:
   - Webhook HMAC SHA-256 computation runs against unmodified raw byte buffers via `express.json({ verify: ... })`.
5. **No Sensitive Card/Bank Data Storage**:
   - Card numbers, CVV, PIN, OTP, and bank credentials are never handled, stored, or logged by the backend (PCI compliance).

### 15.3 Payment Reconciliation Service Foundation
The `PaymentReconciliationService` establishes a clean architectural boundary to detect anomalies:
- `CAPTURED_PAYMENT_UNCONFIRMED_BOOKING`: Payment captured but booking remained unconfirmed.
- `CONFIRMED_BOOKING_UNPAID`: Booking marked confirmed without captured payment.
- `AMOUNT_MISMATCH`: Stored payment amount differs from booking snapshot total.
- Operational endpoint `GET /api/v1/payments/reconciliation/report` is restricted to authorized `STAFF`, `FLEET_MANAGER`, and `ADMIN` roles.



