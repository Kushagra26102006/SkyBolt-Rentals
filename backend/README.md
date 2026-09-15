# SkyBolt Rentals — Production Backend Service

> **Node.js • TypeScript • Express.js • Vitest**

---

## 1. Overview

This directory houses the standalone backend service for **SkyBolt Rentals**, providing the REST API foundation (`/api/v1`) for authentication, vehicle fleet management, reservations, dynamic pricing, and payment processing.

### Architecture Highlights
- **Strict TypeScript**: 100% strict type safety (`tsc --noEmit`), zero unhandled `any`.
- **Layered Architecture**: Route -> Controller -> Service -> Repository -> Mongoose Model -> MongoDB.
- **Enterprise Database Connection**: Centralized Mongoose connection management with connection pool configuration, server selection timeouts, and graceful disconnection.
- **Health & Readiness Probes**: Separated liveness (`/health/live`) and readiness (`/health/ready`) endpoints reflecting real-time database state.
- **Enterprise Middleware**: Helmet security headers, CORS origin whitelist, IP rate limiting, and correlation IDs (`X-Request-ID`).
- **Structured Request Logging**: JSON request logging with automatic redaction of sensitive parameters.
- **Safe Process Lifecycle**: Graceful shutdown on `SIGTERM` / `SIGINT` (closing HTTP server first, then disconnecting MongoDB) and fatal handlers for `uncaughtException` / `unhandledRejection`.

---

## 2. Directory Structure

```text
backend/
├── src/
│   ├── config/              # Validated environment & database configuration
│   │   ├── database.ts      # Mongoose connection lifecycle & status
│   │   └── env.config.ts    # Zod-validated environment variables
│   ├── controllers/         # Request handling & HTTP envelope mapping
│   │   └── health.controller.ts
│   ├── middleware/          # Security, validation, logging, and error handling
│   │   ├── error.middleware.ts
│   │   ├── logging.middleware.ts
│   │   ├── rate-limit.middleware.ts
│   │   ├── request-id.middleware.ts
│   │   └── validate.middleware.ts
│   ├── models/              # Mongoose schema conventions & future entities
│   │   └── base.schema.ts   # Base schema options, timestamps & soft-delete
│   ├── repositories/        # Persistence contracts & Mongoose repository abstraction
│   │   └── base.repository.ts
│   ├── routes/              # Centralized route registration
│   │   ├── health.routes.ts
│   │   └── index.ts
│   ├── services/            # Pure business logic layer
│   │   └── health.service.ts
│   ├── types/               # TypeScript interfaces & API contracts
│   │   └── api.types.ts
│   ├── utils/               # ApiError, ApiResponse, asyncHandler helpers
│   │   ├── api-error.ts
│   │   ├── api-response.ts
│   │   └── async-handler.ts
│   ├── validators/          # Common request schema validators (Zod)
│   │   └── common.validator.ts
│   ├── app.ts               # Express application pipeline
│   └── server.ts            # HTTP server listener, DB connection & graceful shutdown
├── tests/                   # Automated Vitest integration tests
│   ├── helpers/
│   │   └── test-database.ts # Ephemeral test database server
│   ├── cors.test.ts
│   ├── database.test.ts     # MongoDB connection, status, readiness & failure tests
│   ├── error-handling.test.ts
│   ├── health.test.ts
│   ├── request-id.test.ts
│   └── validation.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

## 3. Getting Started

### Prerequisites
- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Environment Configuration
Copy the environment template:
```bash
cp .env.example .env.local
```

### Step 3: Run in Development Mode
```bash
npm run dev
```
The server will start on [http://localhost:5000](http://localhost:5000).

### Step 4: Run Tests
```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch
```

### Step 5: Type Check & Lint
```bash
npm run type-check
```

### Step 6: Build for Production
```bash
npm run build
```
Compiles TypeScript into `dist/`.

### Step 7: Start Production Server
```bash
npm start
```

---

## 4. Endpoints Implemented

| Method | Path | Description | Authentication |
| :---: | :--- | :--- | :---: |
| `GET` | `/api/v1` | Root API descriptor and status | Public |
| `GET` | `/api/v1/health` | Service health status and MongoDB status | Public |
| `GET` | `/api/v1/health/live` | Process liveness probe | Public |
| `GET` | `/api/v1/health/ready` | Readiness probe (200 if connected, 503 if DB disconnected) | Public |

Refer to [docs/API.md](../docs/API.md) for complete payload documentation and future endpoint specifications.
