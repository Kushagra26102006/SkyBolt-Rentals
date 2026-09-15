# SkyBolt Rentals — Production API Specification Foundation

> **Base URL**: `http://localhost:5000/api/v1` (Development) | `https://api.skyboltrentals.com/api/v1` (Production)  
> **API Version**: `v1`  
> **Architecture Style**: RESTful JSON  
> **Protocol**: HTTPS / TLS 1.3 (Production)  

---

## 1. Overview & Architectural Principles

The SkyBolt Rentals API provides backend services for vehicle fleet browsing, real-time temporal availability locks, pricing calculations, reservations, customer profile management, and payment processing.

### Key Tenets
1. **Predictable REST Semantics**: Resource-oriented URLs, standard HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), and canonical HTTP status codes.
2. **Unified Envelope Contract**: Every JSON response is enclosed in a standard envelope.
3. **Correlation & Request Tracing**: Every incoming and outgoing request is tagged with an `X-Request-ID` header.
4. **Resilient Rate Limiting**: All public traffic is protected by IP rate limiting to prevent denial-of-service and brute force attacks.
5. **Strict CORS Policy**: Restricted to authorized web client origins; wildcards (`*`) are disallowed for credentialed access.

---

## 2. Standard Response Envelopes

### 2.1 Success Envelope
All successful API responses return `success: true`:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "uptimeSeconds": 142,
    "timestamp": "2026-09-04T03:30:00.000Z",
    "environment": "development",
    "version": "1.0.0"
  },
  "message": "Optional human-readable confirmation message"
}
```

### 2.2 Error Envelope
All error responses return `success: false` accompanied by a semantic machine-readable error code and human-readable message:

```json
{
  "success": false,
  "error": {
    "code": "UNPROCESSABLE_ENTITY",
    "message": "Invalid request data",
    "details": [
      {
        "field": "email",
        "message": "Invalid email address format"
      }
    ]
  }
}
```

> [!NOTE]
> **Production Information Leak Prevention**:  
> In production environments (`NODE_ENV=production`), server stack traces, database queries, and internal filesystem paths are never exposed in error responses.

---

## 3. Canonical HTTP Status Codes

The API utilizes standard HTTP status codes:

| Code | Constant | Meaning |
| :---: | :--- | :--- |
| `200` | `OK` | Standard successful response. |
| `201` | `CREATED` | Resource successfully created. |
| `204` | `NO_CONTENT` | Action succeeded with no body returned. |
| `400` | `BAD_REQUEST` | Malformed request or invalid JSON payload. |
| `401` | `UNAUTHORIZED` | Missing or invalid authentication token (Task 04+). |
| `403` | `FORBIDDEN` | Authenticated user lacks necessary permissions. |
| `404` | `NOT_FOUND` | The requested endpoint or resource does not exist. |
| `409` | `CONFLICT` | Resource conflict (e.g. duplicate email, overlapping booking). |
| `422` | `UNPROCESSABLE_ENTITY` | Payload syntax is valid but fails schema validation rules. |
| `429` | `TOO_MANY_REQUESTS` | Rate limit threshold exceeded. |
| `500` | `INTERNAL_SERVER_ERROR`| Unhandled server exception. |
| `503` | `SERVICE_UNAVAILABLE` | Service down or undergoing database maintenance. |

---

## 4. Active Endpoints (Foundation)

### 4.1 API Root Metadata
Retrieves basic API descriptor metadata and links.

* **Route**: `GET /api/v1`
* **Authentication**: None
* **Headers**: `Accept: application/json`
* **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "name": "SkyBolt Rentals API",
      "version": "1.0.0",
      "description": "Production vehicle rental API foundation",
      "status": "active",
      "docs": "/docs/API.md"
    },
    "message": "Welcome to SkyBolt Rentals API v1"
  }
  ```

### 4.2 System Health & Dependency Status
Comprehensive health status of the application process and its backing MongoDB connection.

* **Route**: `GET /api/v1/health`
* **Authentication**: None
* **Headers**: `Accept: application/json`
* **Response `200 OK` (Healthy)**:
  ```json
  {
    "success": true,
    "data": {
      "status": "ok",
      "uptimeSeconds": 312,
      "timestamp": "2026-09-04T03:31:00.123Z",
      "environment": "development",
      "version": "1.0.0",
      "database": "connected"
    },
    "message": "SkyBolt Rentals API and database are healthy"
  }
  ```
* **Response `200 OK` (Degraded Dependency)**:
  ```json
  {
    "success": true,
    "data": {
      "status": "degraded",
      "uptimeSeconds": 312,
      "timestamp": "2026-09-04T03:31:00.123Z",
      "environment": "development",
      "version": "1.0.0",
      "database": "disconnected"
    },
    "message": "SkyBolt Rentals API is running with degraded dependencies"
  }
  ```

### 4.3 Container Liveness Probe (`/health/live`)
Confirms the Node.js process is active and event loop is processing requests.

* **Route**: `GET /api/v1/health/live`
* **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "status": "ok",
      "uptimeSeconds": 312,
      "timestamp": "2026-09-04T03:31:00.123Z"
    },
    "message": "Process is live"
  }
  ```

### 4.4 Container Readiness Probe (`/health/ready`)
Determines if the service is ready to accept production customer traffic by verifying active MongoDB connectivity.

* **Route**: `GET /api/v1/health/ready`
* **Response `200 OK` (Ready)**:
  ```json
  {
    "success": true,
    "data": {
      "ready": true,
      "database": "connected",
      "timestamp": "2026-09-04T03:31:00.123Z"
    },
    "message": "Service is ready to accept traffic"
  }
  ```
* **Response `503 Service Unavailable` (Not Ready)**:
  ```json
  {
    "success": false,
    "error": {
      "code": "DATABASE_UNAVAILABLE",
      "message": "Service is not ready: Database connection unavailable"
    },
    "data": {
      "ready": false,
      "database": "disconnected",
      "timestamp": "2026-09-04T03:31:00.123Z"
    }
  }
  ```

---

## 5. Security & Request Headers

---

## 5. Active Authentication & User Management Endpoints (TASK 05)

### 5.1 Register Customer Account
Creates a new customer account, hashes password using bcryptjs, issues a signed JWT, and attaches an HTTP-only SameSite cookie.

* **Route**: `POST /api/v1/auth/register`
* **Authentication**: None
* **Rate Limit**: 15 requests per 15 minutes
* **Request Body**:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane.doe@example.com",
    "password": "Password123!",
    "phone": "+91 9876543210",
    "licenseNumber": "DL-99221-KA"
  }
  ```
* **Response `201 CREATED`**:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "6a9a5069c42be5fa12300a7e",
        "name": "Jane Doe",
        "email": "jane.doe@example.com",
        "phone": "+91 9876543210",
        "role": "CUSTOMER",
        "status": "ACTIVE",
        "avatar": "",
        "licenseNumber": "DL-99221-KA",
        "emailVerified": false,
        "phoneVerified": false,
        "createdAt": "2026-09-04T05:00:00.000Z",
        "updatedAt": "2026-09-04T05:00:00.000Z"
      }
    },
    "message": "User registered successfully"
  }
  ```
* **Set-Cookie**: `skybolt_auth=<jwt>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`

---

### 5.2 User Login
Authenticates an existing user and attaches an HTTP-only session cookie.

* **Route**: `POST /api/v1/auth/login`
* **Authentication**: None
* **Rate Limit**: 15 requests per 15 minutes
* **Request Body**:
  ```json
  {
    "email": "jane.doe@example.com",
    "password": "Password123!"
  }
  ```
* **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "6a9a5069c42be5fa12300a7e",
        "name": "Jane Doe",
        "email": "jane.doe@example.com",
        "role": "CUSTOMER",
        "status": "ACTIVE"
      }
    },
    "message": "Authentication successful"
  }
  ```
* **Error `401 UNAUTHORIZED`**: Generic error `{"success": false, "error": {"code": "UNAUTHORIZED", "message": "Invalid email or password"}}` (prevents user enumeration).
* **Error `403 FORBIDDEN`**: Returned if status is `SUSPENDED` or `DEACTIVATED`.

---

### 5.3 User Logout
Clears the HTTP-only session cookie.

* **Route**: `POST /api/v1/auth/logout`
* **Authentication**: None
* **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": null,
    "message": "Logged out successfully"
  }
  ```

---

### 5.4 Current User Session Verification
Returns the authenticated user's safe profile.

* **Route**: `GET /api/v1/auth/me`
* **Authentication**: Required (`Cookie: skybolt_auth=<jwt>` or `Authorization: Bearer <token>`)
* **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "6a9a5069c42be5fa12300a7e",
        "name": "Jane Doe",
        "email": "jane.doe@example.com",
        "role": "CUSTOMER",
        "status": "ACTIVE"
      }
    }
  }
  ```
* **Error `401 UNAUTHORIZED`**: Missing or expired session.

---

### 5.5 Change Password
Changes password for the authenticated user. Requires verification of the current password.

* **Route**: `POST /api/v1/auth/change-password`
* **Authentication**: Required
* **Request Body**:
  ```json
  {
    "currentPassword": "OldPassword123!",
    "newPassword": "NewSecurePassword123!"
  }
  ```
* **Response `200 OK`**: `{"success": true, "data": null, "message": "Password updated successfully"}`

---

### 5.6 Forgot Password
Dispatches password reset flow without leaking account existence.

* **Route**: `POST /api/v1/auth/forgot-password`
* **Authentication**: None
* **Request Body**: `{"email": "jane.doe@example.com"}`
* **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "message": "If an account exists with that email, password reset instructions have been dispatched."
    }
  }
  ```

---

### 5.7 Reset Password
Executes password reset using a cryptographically random, single-use token.

* **Route**: `POST /api/v1/auth/reset-password`
* **Authentication**: None
* **Request Body**:
  ```json
  {
    "token": "4f9b2d8e...",
    "newPassword": "NewPassword123!"
  }
  ```
* **Response `200 OK`**: `{"success": true, "data": null, "message": "Password has been reset successfully. Please sign in with your new password."}`

---

### 5.8 User Profile Inspection & Update
* **GET `/api/v1/users/me`**: Returns profile of authenticated user.
* **PATCH `/api/v1/users/me`**: Updates allowed profile fields (`name`, `phone`, `avatar`, `licenseNumber`). Strictly rejects mass assignment of `role`, `status`, `email`, or credentials.

---

## 6. Security Architecture & Headers

### 6.1 Request Correlation (`X-Request-ID`)
- The client may supply an existing tracking ID in the `X-Request-ID` header (alphanumeric, 8–64 characters).
- If omitted or invalid, the backend generates a cryptographically random UUIDv4.
- The `X-Request-ID` is echoed in all responses and included in structured server logs.

### 6.2 Content Security & Security Headers
Configured via Helmet:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Strict-Transport-Security` (HSTS)
- `X-DNS-Prefetch-Control: off`

### 6.3 Cross-Origin Resource Sharing (CORS) & Cookies
- Allowed origins are populated strictly from the `CORS_ORIGIN` environment variable (e.g. `http://localhost:8080`).
- Supports credentials (`Access-Control-Allow-Credentials: true`).
- Allowed Methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`.

### 6.4 Rate Limiting
- **General Endpoints**: 100 requests per 15 minutes.
- **Authentication Endpoints**: 15 requests per 15 minutes.

---

---

## 7. Vehicle Catalog API (Active - Task 06)

### 7.1 GET `/api/v1/vehicles`
Public vehicle fleet browsing with server-side filtering, allowlisted sorting, keyword search, and bounded pagination.

- **Authentication**: Optional
- **Authorization**: Public (Returns only `ACTIVE` vehicles and public fields); Staff (`ADMIN`, `FLEET_MANAGER`) can view vehicles of all lifecycle statuses if authenticated.
- **Query Parameters**:
  - `category` (string, optional): One of `CAR`, `SUV`, `SEDAN`, `HATCHBACK`, `BIKE`, `SCOOTER`, `EV`, `LUXURY`
  - `brand` (string, optional): Filter by vehicle brand name
  - `fuelType` (string, optional): One of `PETROL`, `DIESEL`, `ELECTRIC`, `HYBRID`, `MANUAL`
  - `transmission` (string, optional): One of `AUTOMATIC`, `MANUAL`
  - `minPrice` (integer, optional): Minimum base rental rate (in INR integer units)
  - `maxPrice` (integer, optional): Maximum base rental rate (in INR integer units)
  - `seats` (integer, optional): Minimum passenger seats
  - `location` (string, optional): Location name / Hub city
  - `search` (string, optional): Keyword search matching vehicle name, brand, or model
  - `sort` (string, optional): Allowlisted sort order: `popular` (default), `price_asc`, `price_desc`, `rating_desc`, `newest`
  - `page` (integer, optional, default: `1`): Current page number
  - `limit` (integer, optional, default: `20`, maximum: `100`): Results per page
- **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "6a9a52...",
        "vehicleCode": "SKY-VHC-001",
        "brand": "Honda",
        "model": "Activa 5G",
        "name": "Honda Activa 5G",
        "year": 2022,
        "category": "SCOOTER",
        "status": "ACTIVE",
        "specifications": {
          "seats": 2,
          "transmission": "AUTOMATIC",
          "fuelType": "PETROL",
          "engineCC": 109,
          "mileage": "55 kmpl"
        },
        "rental": {
          "rentalType": "DAILY",
          "baseRate": 300,
          "currency": "INR",
          "deposit": 1000
        },
        "location": {
          "name": "Ludhiana",
          "city": "Ludhiana"
        },
        "images": [
          {
            "url": "assets/images/honda-activa.png",
            "altText": "Honda Activa 5G Scooter",
            "isPrimary": true
          }
        ],
        "features": ["Single-channel ABS", "Underseat Storage"],
        "rating": {
          "average": 4.7,
          "count": 142
        },
        "createdAt": "2026-09-04T05:00:00.000Z",
        "updatedAt": "2026-09-04T05:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 12,
      "totalPages": 1
    }
  }
}
```
- **Error Codes**:
  - `422 UNPROCESSABLE_ENTITY`: Invalid query parameter format or unallowlisted sort value

---

### 7.2 GET `/api/v1/vehicles/:id`
Retrieve detailed vehicle record by MongoDB ObjectId or unique human-readable `vehicleCode`.

- **Authentication**: Optional
- **Authorization**: Public (active vehicles); Staff (`ADMIN`, `FLEET_MANAGER` can access draft/maintenance/retired vehicles and view sensitive fields)
- **Path Parameters**:
  - `id` (string, required): 24-character hexadecimal MongoDB `_id` OR human-readable `vehicleCode` (e.g. `SKY-VHC-001`)
- **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "vehicle": {
      "id": "6a9a52...",
      "vehicleCode": "SKY-VHC-001",
      "brand": "Honda",
      "model": "Activa 5G",
      "name": "Honda Activa 5G",
      "year": 2022,
      "category": "SCOOTER",
      "specifications": { ... },
      "rental": { "rentalType": "DAILY", "baseRate": 300, "currency": "INR" },
      "location": { "name": "Ludhiana", "city": "Ludhiana" },
      "images": [ ... ],
      "features": [ ... ],
      "rating": { "average": 4.7, "count": 142 },
      "status": "ACTIVE"
    }
  }
}
```
- **Error Codes**:
  - `404 VEHICLE_NOT_FOUND`: Vehicle ID or code does not exist in active fleet

---

### 7.3 POST `/api/v1/vehicles`
Create a new vehicle record in the fleet catalog.

- **Authentication**: Required (`skybolt_auth` HTTP-only cookie)
- **Authorization**: Restricted to `ADMIN` or `FLEET_MANAGER` roles. (`CUSTOMER` role rejected with `403 FORBIDDEN`).
- **Request Body**:
```json
{
  "vehicleCode": "SKY-VHC-013",
  "name": "BMW M4 Competition Coupe",
  "brand": "BMW",
  "model": "M4",
  "year": 2024,
  "category": "LUXURY",
  "registrationNumber": "DL-01-AB-1234",
  "specifications": {
    "seats": 4,
    "transmission": "AUTOMATIC",
    "fuelType": "PETROL",
    "engineCC": 2993,
    "luggageCapacity": 440
  },
  "rental": {
    "rentalType": "DAILY",
    "baseRate": 4500,
    "currency": "INR",
    "deposit": 50000
  },
  "location": {
    "name": "Delhi Airport Hub",
    "city": "New Delhi"
  },
  "images": [
    { "url": "https://images.unsplash.com/bmw-m4.jpg", "isPrimary": true }
  ],
  "features": ["Carbon Roof", "M Sport Exhaust", "Harmon Kardon"]
}
```
- **Response (201 Created)**: Returns the newly created vehicle DTO (including `registrationNumber` for admin/fleet manager).
- **Error Codes**:
  - `401 UNAUTHORIZED`: Missing or invalid auth session
  - `403 FORBIDDEN`: Insufficient role permissions (`CUSTOMER`)
  - `409 VEHICLE_ALREADY_EXISTS`: Duplicate vehicleCode
  - `409 DUPLICATE_REGISTRATION`: License plate number already registered in fleet
  - `422 UNPROCESSABLE_ENTITY`: Validation failure or mass assignment attempt

---

### 7.4 PATCH `/api/v1/vehicles/:id`
Partial update to existing fleet vehicle record.

- **Authentication**: Required (`skybolt_auth` cookie)
- **Authorization**: `ADMIN` or `FLEET_MANAGER`. Only `ADMIN` can transition a vehicle from `RETIRED` back to `ACTIVE`.
- **Request Body**: Partial vehicle properties (protected fields like `_id`, `createdAt`, `isDeleted`, `internalCost` are strictly rejected).
- **Response (200 OK)**: Returns updated vehicle object.
- **Error Codes**:
  - `401 UNAUTHORIZED`
  - `403 FORBIDDEN`: Role cannot perform this update or non-admin attempted reactivation
  - `404 VEHICLE_NOT_FOUND`
  - `409 DUPLICATE_REGISTRATION`
  - `422 UNPROCESSABLE_ENTITY`: Mass assignment violation or invalid data

---

### 7.5 DELETE `/api/v1/vehicles/:id`
Soft-retire a vehicle from service.

- **Authentication**: Required (`skybolt_auth` cookie)
- **Authorization**: Strictly restricted to `ADMIN` role. (`FLEET_MANAGER` and `CUSTOMER` rejected with `403`).
- **Behavior**: Sets `status: 'RETIRED'`. Does not hard-delete MongoDB document, protecting future booking/fleet references.
- **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "vehicle": {
      "id": "6a9a52...",
      "vehicleCode": "TEST-ADMIN-001",
      "status": "RETIRED"
    }
  },
  "message": "Vehicle successfully retired from active fleet."
}
```

---

---

## 8. Availability Engine & Inventory Locking API (Active - Task 07)

> [!IMPORTANT]
> **Availability vs Final Reservation**:
> An availability check (`GET /api/v1/vehicles/:id/availability`) indicates availability at the exact millisecond queried, but does NOT lock inventory. To guarantee reservation rights and eliminate double-booking race conditions during checkout, clients place an inventory hold (`POST /api/v1/vehicles/:id/holds`).

### 8.1 GET `/api/v1/vehicles/:id/availability`
Server-authoritative check verifying if a vehicle is rentable for the specified date range `[pickupAt, returnAt)`.

- **Authentication**: Optional (Public)
- **Path Parameters**:
  - `id` (string, required): MongoDB ObjectId or `vehicleCode`
- **Query Parameters**:
  - `pickupAt` (string, required): ISO-8601 UTC timestamp (e.g. `2026-10-10T10:00:00.000Z`)
  - `returnAt` (string, required): ISO-8601 UTC timestamp (e.g. `2026-10-15T10:00:00.000Z`)
- **Response (200 OK - Available)**:
```json
{
  "success": true,
  "data": {
    "vehicleId": "6a9a52...",
    "available": true,
    "pickupAt": "2026-10-10T10:00:00.000Z",
    "returnAt": "2026-10-15T10:00:00.000Z"
  }
}
```
- **Response (200 OK - Unavailable)**:
```json
{
  "success": true,
  "data": {
    "vehicleId": "6a9a52...",
    "available": false,
    "reason": "VEHICLE_UNAVAILABLE",
    "pickupAt": "2026-10-10T10:00:00.000Z",
    "returnAt": "2026-10-15T10:00:00.000Z"
  }
}
```
- **Error Codes**:
  - `404 VEHICLE_NOT_FOUND`: Vehicle ID or code does not exist
  - `422 UNPROCESSABLE_ENTITY`: Invalid ISO date format, inverted date range (`pickupAt >= returnAt`), past pickup date, or duration exceeding 90 days.

---

### 8.2 POST `/api/v1/vehicles/:id/holds`
Create a temporary inventory hold/lock for a vehicle, preventing concurrent overlapping reservations.

- **Authentication**: Required (`skybolt_auth` cookie)
- **Path Parameters**:
  - `id` (string, required): MongoDB ObjectId or `vehicleCode`
- **Request Body**:
```json
{
  "pickupAt": "2026-10-10T10:00:00.000Z",
  "returnAt": "2026-10-15T10:00:00.000Z"
}
```
- **Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "hold": {
      "id": "6b1f74...",
      "holdToken": "hold_d3b07384d113edec49eaa6238ad5ff00",
      "vehicleId": "6a9a52...",
      "userId": "6a9a41...",
      "pickupAt": "2026-10-10T10:00:00.000Z",
      "returnAt": "2026-10-15T10:00:00.000Z",
      "expiresAt": "2026-10-10T08:15:00.000Z",
      "status": "HELD",
      "createdAt": "2026-10-10T08:00:00.000Z"
    }
  },
  "message": "Inventory hold placed successfully."
}
```
- **Error Codes**:
  - `401 UNAUTHORIZED`: Authentication session required
  - `404 VEHICLE_NOT_FOUND`
  - `409 VEHICLE_UNAVAILABLE`: Vehicle is already reserved or held for overlapping dates
  - `409 VEHICLE_NOT_RENTABLE`: Vehicle is in `MAINTENANCE`, `INACTIVE`, or `RETIRED` status
  - `422 UNPROCESSABLE_ENTITY`: Validation failure

---

### 8.3 DELETE `/api/v1/holds/:id`
Explicitly release an active inventory hold before its natural TTL expiration.

- **Authentication**: Required (`skybolt_auth` cookie)
- **Authorization**: Must be the user who placed the hold.
- **Path Parameters**:
  - `id` (string, required): Hold ObjectId
- **Response (200 OK)**:
```json
{
  "success": true,
  "data": null,
  "message": "Inventory hold released successfully."
}
```
- **Error Codes**:
  - `401 UNAUTHORIZED`
  - `403 FORBIDDEN`: Attempting to release a hold owned by another user
  - `404 HOLD_NOT_FOUND`: Hold not found or already released/expired

---

## 9. Booking & Reservation Endpoints (Task 08)

All booking endpoints require an authenticated user session (`requireAuth`). The server authoritatively derives customer identity and ownership (`req.user.id`).

### 9.1 POST `/api/v1/bookings`
Creates an authoritative reservation with mutex concurrency locking, anti-double-booking protection, baseline pricing snapshot, and optional idempotency.

- **Authentication**: Required (`skybolt_auth` cookie or Bearer token)
- **Headers**:
  - `Idempotency-Key` (string, optional): Unique UUID/string for safe retries (24h cache).
- **Request Body**:
```json
{
  "vehicleId": "66d6a59b964344558e8b1111",
  "pickupAt": "2026-09-10T10:00:00.000Z",
  "returnAt": "2026-09-13T10:00:00.000Z",
  "pickupLocation": "Indiranagar Hub",
  "returnLocation": "Indiranagar Hub",
  "notes": "Flight arriving early"
}
```
*Note: Any client-provided `userId`, `status`, `paymentStatus`, or `pricingSnapshot` is strictly rejected or discarded.*

- **Response (201 Created)**:
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Booking created successfully",
  "data": {
    "id": "66d6c29b964344558e8b9999",
    "bookingReference": "SKY-20260910-A4B1C2",
    "userId": "66d6a11b964344558e8b0001",
    "vehicleId": "66d6a59b964344558e8b1111",
    "vehicle": {
      "brand": "Hyundai",
      "model": "Creta",
      "variant": "SX(O)",
      "registrationNumber": "KA-01-EQ-9021",
      "image": "https://images.unsplash.com/photo-1549399542-7e3f8b79c341",
      "name": "Hyundai Creta"
    },
    "pickupAt": "2026-09-10T10:00:00.000Z",
    "returnAt": "2026-09-13T10:00:00.000Z",
    "pickupLocation": {
      "locationId": "",
      "name": "Indiranagar Hub",
      "address": "Bengaluru"
    },
    "returnLocation": {
      "locationId": "",
      "name": "Indiranagar Hub",
      "address": "Bengaluru"
    },
    "status": "PENDING",
    "paymentStatus": "UNPAID",
    "pricing": {
      "currency": "INR",
      "baseAmount": 2500,
      "subtotal": 7500,
      "tax": 1350,
      "discount": 0,
      "fees": 1000,
      "total": 9850,
      "pricingVersion": "v1_base"
    },
    "createdAt": "2026-09-04T10:30:00.000Z",
    "updatedAt": "2026-09-04T10:30:00.000Z"
  }
}
```
- **Error Codes**:
  - `400 BAD_REQUEST`: Malformed date or parameters.
  - `401 UNAUTHORIZED`: Authentication required.
  - `404 VEHICLE_NOT_FOUND`: Vehicle does not exist.
  - `409 VEHICLE_NOT_RENTABLE`: Vehicle in `MAINTENANCE`, `INACTIVE`, or `RETIRED` status.
  - `409 VEHICLE_UNAVAILABLE`: Vehicle has overlapping blocking reservation.
  - `409 IDEMPOTENCY_CONFLICT`: Idempotency key reused with different payload.
  - `422 UNPROCESSABLE_ENTITY`: Validation failure (`pickupAt >= returnAt` or past date).

### 9.2 GET `/api/v1/bookings`
Retrieves paginated booking history for the authenticated customer. Customers can only view their own bookings.

- **Authentication**: Required
- **Query Parameters**:
  - `status` (string, optional): Filter by `PENDING`, `PAYMENT_PENDING`, `CONFIRMED`, `ACTIVE`, `COMPLETED`, `CANCELLED`, `EXPIRED`.
  - `sort` (string, optional): `newest` (default), `oldest`, `pickup_soonest`, `pickup_latest`.
  - `page` (number, optional, default: 1).
  - `limit` (number, optional, default: 20, max: 100).
- **Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "data": [ ...BookingDTO... ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "totalPages": 1
  }
}
```

### 9.3 GET `/api/v1/bookings/:id`
Retrieves single booking detail by MongoDB ObjectId or `bookingReference`.

- **Authentication**: Required
- **Authorization**: Customer can only retrieve bookings they own. Access to another user's booking returns `404` to prevent information disclosure.
- **Path Parameters**:
  - `id` (string, required): Booking ObjectId or reference (`SKY-YYYYMMDD-XXXXXX`).
- **Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "data": { ...BookingDTO... }
}
```
- **Error Codes**:
  - `401 UNAUTHORIZED`
  - `404 BOOKING_NOT_FOUND`

### 9.4 POST `/api/v1/bookings/:id/cancel`
Cancels an active booking and immediately releases the inventory reservation in the availability engine.

- **Authentication**: Required
- **Authorization**: Must be the owner or authorized staff/admin.
- **Request Body (Optional)**:
```json
{
  "reason": "CUSTOMER_REQUEST",
  "notes": "Changed travel itinerary"
}
```
- **Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking cancelled successfully.",
  "data": {
    "id": "66d6c29b964344558e8b9999",
    "status": "CANCELLED",
    "cancellation": {
      "reason": "CUSTOMER_REQUEST",
      "notes": "Changed travel itinerary",
      "cancelledAt": "2026-09-04T10:45:00.000Z",
      "cancelledBy": "66d6a11b964344558e8b0001"
    }
  }
}
```
- **Error Codes**:
  - `401 UNAUTHORIZED`
  - `403 FORBIDDEN`: Non-owner attempting cancellation.
  - `404 BOOKING_NOT_FOUND`
  - `409 INVALID_STATE_TRANSITION`: Attempting to cancel already `CANCELLED`, `COMPLETED`, or `EXPIRED` booking.

---

## 10. Pricing Engine & Quote Endpoints (Task 09)

The pricing engine is server-authoritative. Client requests cannot determine or alter rental prices, duration, taxes, discounts, or totals.

### 10.1 POST `/api/v1/pricing/quote`
Calculates an authoritative pricing quote with transparent breakdown, duration discounts, coupon validation, taxes, and fees without creating a reservation.

- **Authentication**: Optional (Publicly accessible for live fleet browsing and checkout estimates)
- **Request Body**:
```json
{
  "vehicleId": "66d6a59b964344558e8b1111",
  "pickupAt": "2026-09-10T10:00:00.000Z",
  "returnAt": "2026-09-13T10:00:00.000Z",
  "couponCode": "SKYBOLT10",
  "pickupLocation": "Indiranagar Hub"
}
```
- **Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "vehicleId": "66d6a59b964344558e8b1111",
    "vehicleName": "Hyundai Creta",
    "currency": "INR",
    "duration": {
      "value": 3,
      "unit": "DAY",
      "hoursTotal": 72
    },
    "baseRate": 2500,
    "baseAmount": 7500,
    "discountAmount": 375,
    "feeAmount": 1000,
    "taxAmount": 1282.5,
    "subtotal": 7125,
    "total": 9407.5,
    "breakdown": {
      "duration": {
        "value": 3,
        "unit": "DAY",
        "hoursTotal": 72
      },
      "baseRatePerDay": 2500,
      "grossBaseAmount": 7500,
      "discounts": [
        {
          "type": "DURATION",
          "name": "Extended Rental Discount (5%)",
          "amount": 375,
          "ratePercentage": 5
        }
      ],
      "totalDiscount": 375,
      "taxableSubtotal": 7125,
      "taxes": [
        {
          "name": "GST (18%)",
          "ratePercentage": 18,
          "taxableAmount": 7125,
          "taxAmount": 1282.5
        }
      ],
      "totalTax": 1282.5,
      "fees": [
        {
          "type": "DEPOSIT",
          "name": "Refundable Security Deposit",
          "amount": 1000,
          "isRefundable": true
        }
      ],
      "totalFees": 1000,
      "finalTotal": 9407.5,
      "currency": "INR"
    },
    "pricingVersion": "v2_engine",
    "calculatedAt": "2026-09-04T10:30:00.000Z"
  }
}
```
- **Error Codes**:
  - `400 BAD_REQUEST`: Malformed date/time format.
  - `404 VEHICLE_NOT_FOUND`: Vehicle ID not found.
  - `409 VEHICLE_NOT_RENTABLE`: Vehicle in `MAINTENANCE` or `INACTIVE` status.
  - `422 UNPROCESSABLE_ENTITY`: Invalid date range (`pickupAt >= returnAt`) or invalid coupon code.

---

---

## 11. Payment & Webhook Endpoints (TASK 10)

Production-grade, server-authoritative payment integration via Razorpay with cryptographic HMAC SHA-256 signature verification, raw body webhook validation, and idempotency.

### 11.1 Create Razorpay Order
- **Route**: `POST /api/v1/payments/orders`
- **Authentication**: Required (JWT cookie or Bearer token)
- **Role**: Customer (must own the booking)
- **Zero-Trust Guarantee**: Client-provided amount and currency are strictly ignored. Order amount is derived authoritatively from `booking.pricingSnapshot.total` in integer paise.
- **Request Body**:
```json
{
  "bookingId": "SKY-20260904-8E4F1B"
}
```
- **Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "keyId": "rzp_test_placeholder_key_id",
    "orderId": "order_66d6a59b964344558e8b2222",
    "amount": 277000,
    "currency": "INR",
    "bookingId": "66d6a59b964344558e8b1111",
    "bookingReference": "SKY-20260904-8E4F1B",
    "paymentReference": "PAY-20260904-9C1D4A",
    "customerName": "Alice Customer",
    "customerEmail": "alice.customer@skybolt.test",
    "customerContact": "+91 9800001111"
  }
}
```
- **Error Codes**:
  - `401 UNAUTHORIZED`: Authentication required.
  - `404 BOOKING_NOT_FOUND`: Booking not found or not owned by authenticated user.
  - `409 PAYMENT_ALREADY_PROCESSED`: Booking is already confirmed/paid.
  - `409 BOOKING_NOT_PAYABLE`: Booking in cancelled/expired state.

### 11.2 Verify Payment Signature (Client Callback)
- **Route**: `POST /api/v1/payments/verify`
- **Authentication**: Required (JWT cookie or Bearer token)
- **Role**: Customer (must own the booking)
- **Verification Formula**: `hmac_sha256(order_id + "|" + razorpay_payment_id, RAZORPAY_KEY_SECRET) === razorpay_signature`
- **Request Body**:
```json
{
  "bookingId": "SKY-20260904-8E4F1B",
  "razorpay_order_id": "order_66d6a59b964344558e8b2222",
  "razorpay_payment_id": "pay_66d6a59b964344558e8b3333",
  "razorpay_signature": "e5b871c5040e0600cf..."
}
```
- **Response (200 OK)**:
```json
{
  "success": true,
  "message": "Payment verified and booking confirmed successfully.",
  "data": {
    "booking": {
      "id": "66d6a59b964344558e8b1111",
      "bookingReference": "SKY-20260904-8E4F1B",
      "status": "CONFIRMED",
      "paymentStatus": "PAID",
      "pricing": {
        "total": 2770,
        "currency": "INR"
      }
    },
    "payment": {
      "id": "66d6a59b964344558e8b4444",
      "paymentReference": "PAY-20260904-9C1D4A",
      "provider": "RAZORPAY",
      "providerOrderId": "order_66d6a59b964344558e8b2222",
      "providerPaymentId": "pay_66d6a59b964344558e8b3333",
      "amount": 2770,
      "currency": "INR",
      "status": "CAPTURED",
      "signatureVerified": true,
      "createdAt": "2026-09-04T10:35:00.000Z"
    }
  }
}
```
- **Error Codes**:
  - `400 PAYMENT_SIGNATURE_INVALID`: Signature mismatch.
  - `400 PAYMENT_AMOUNT_MISMATCH`: Paid amount does not match authoritative booking snapshot.
  - `403 PAYMENT_NOT_OWNED`: Payment belongs to another user.
  - `404 PAYMENT_NOT_FOUND`: Order not found in database.

### 11.3 Razorpay Webhook Callback
- **Route**: `POST /api/v1/payments/webhook`
- **Authentication**: None (Razorpay server-to-server)
- **Signature Header**: `x-razorpay-signature`
- **Verification Formula**: `hmac_sha256(rawBodyBuffer, RAZORPAY_WEBHOOK_SECRET) === x-razorpay-signature`
- **Supported Events**: `payment.captured`, `order.paid`, `payment.failed`
- **Idempotency Guarantee**: Processed event IDs are persisted in `WebhookEventModel`; duplicate event deliveries are safely acknowledged with `200 OK` without duplicate side effects.
- **Response (200 OK)**:
```json
{
  "success": true,
  "status": "PROCESSED",
  "message": "Webhook event \"payment.captured\" processed successfully."
}
```

### 11.4 Get Payment Status
- **Route**: `GET /api/v1/payments/:id`
- **Authentication**: Required (JWT cookie or Bearer token)
- **Role**: Customer (own payments) or Staff/Admin
- **Response (200 OK)**: Returns payment DTO without internal gateway secrets.

### 11.5 Customer Payment History
- **Route**: `GET /api/v1/payments`
- **Authentication**: Required
- **Query Parameters**: `page` (default 1), `limit` (default 20), `status`, `bookingId`
- **Response (200 OK)**: Paginated customer payments list.

### 11.6 Payment Reconciliation Report (Operational)
- **Route**: `GET /api/v1/payments/reconciliation/report`
- **Authentication**: Required
- **Role**: `STAFF`, `FLEET_MANAGER`, `ADMIN` (Customers denied with 403)
- **Response (200 OK)**: Scans for captured payments without confirmed bookings, unconfirmed holds, and amount/currency mismatches.

---

## 12. Contact Inquiries

### 12.1 Submit Inquiry
- **Route**: `POST /api/v1/contact`
- **Authentication**: Public (Rate-limited: 5 per 15 min)
- **Request Body**:
  ```json
  {
    "name": "Alex Mercer",
    "email": "alex@example.com",
    "phone": "+919876543210",
    "subject": "rental",
    "message": "Inquiry regarding long-term commercial booking options."
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "data": {
      "inquiryId": "65f0e...",
      "status": "PENDING",
      "receivedAt": "2026-09-04T17:00:00.000Z"
    },
    "message": "Thank you for reaching out! Your inquiry has been received."
  }
  ```

### 12.2 List Inquiries (Admin/Staff)
- **Route**: `GET /api/v1/contact`
- **Authentication**: Required
- **Role**: `STAFF`, `ADMIN`
- **Query Parameters**: `page`, `limit`, `status` (`PENDING`, `RESOLVED`, `SPAM`, `ARCHIVED`)
- **Response (200 OK)**: Paginated inquiry records.

---

## 13. Active API Modules (Roadmap Alignment)

```text
/api/v1
├── /auth               [ACTIVE - Task 05]
├── /users              [ACTIVE - Task 05]
├── /vehicles           [ACTIVE - Task 06]
├── /vehicles/:id/availability [ACTIVE - Task 07]
├── /vehicles/:id/holds        [ACTIVE - Task 07]
├── /holds/:id                 [ACTIVE - Task 07]
├── /bookings                  [ACTIVE - Task 08]
│   ├── POST   /        (Create booking + Mutex reservation lock)
│   ├── GET    /        (Customer history with pagination & sorting)
│   ├── GET    /:id     (Detail by ID or reference with ownership check)
│   └── POST   /:id/cancel (Cancellation + inventory release)
├── /pricing                   [ACTIVE - Task 09]
│   └── POST   /quote   (Authoritative price breakdown & quote)
├── /payments                  [ACTIVE - Task 10]
│   ├── POST   /orders  (Authoritative Razorpay order initiation)
│   ├── POST   /verify  (Cryptographic signature verification & atomic confirmation)
│   ├── POST   /webhook (Server-to-server webhook handling & replay idempotency)
│   ├── GET    /:id     (Single payment status DTO)
│   ├── GET    /        (Customer payment history)
│   └── GET    /reconciliation/report (Staff discrepancy detection)
├── /hubs                      [ACTIVE - Task 11]
├── /fleet                     [ACTIVE - Task 11]
├── /admin                     [ACTIVE - Task 12]
│   ├── GET    /metrics (Live real-time operational aggregates)
│   ├── GET    /audit-logs (Security & administrative audit trail)
│   ├── GET    /maintenance (Active and scheduled maintenance logs)
│   ├── GET    /transfers (Inter-hub logistics pipeline)
│   ├── /admin/notifications   [ACTIVE - Task 13]
│   └── /admin/reviews         [ACTIVE - Task 14]
├── /notifications             [ACTIVE - Task 13]
├── /contact                   [ACTIVE - Production Hardened]
└── /reviews & /bookings/:id/review [ACTIVE - Task 14]
```

---

## 14. Verified Customer Reviews & Ratings (Task 14)

### 14.1 Review Eligibility Pre-Flight Check
- **Route**: `GET /api/v1/bookings/:bookingId/review-eligibility`
- **Authentication**: Required (`CUSTOMER`, `STAFF`, `ADMIN`)
- **Description**: Verifies whether an authenticated customer is eligible to submit a review for the specified booking.
- **Eligibility Conditions**:
  1. Authenticated user owns the booking.
  2. Booking status is `COMPLETED`.
  3. Rental completion is within the unexpired 30-day review window (`Date.now() - completedAt <= 30 days`).
  4. No existing active review already submitted for this booking.

### 14.2 Submit Verified Review
- **Route**: `POST /api/v1/bookings/:bookingId/review`
- **Authentication**: Required (`CUSTOMER`)
- **Description**: Submits an authoritative verified review. User ID and Vehicle ID are securely derived by the server from the authenticated session and completed booking record.
- **Request Body**:
  ```json
  {
    "rating": 5,
    "title": "Unforgettable road trip!",
    "comment": "The Tesla Model S Plaid exceeded every expectation. Seamless pickup and pristine condition."
  }
  ```
- **Validation Rules**:
  - `rating`: Integer strictly between 1 and 5.
  - `title`: String, 3 to 120 characters, stripped of HTML.
  - `comment`: String, 10 to 2000 characters, stripped of executable HTML/scripts.
  - Reject client injection of `userId`, `vehicleId`, or `verificationStatus`.

### 14.3 Public Vehicle Reviews & Rating Aggregates
- **Route**: `GET /api/v1/vehicles/:vehicleId/reviews`
- **Authentication**: Optional
- **Query Parameters**:
  - `page`: Integer (default 1)
  - `limit`: Integer (default 10, max 50)
  - `sort`: `newest` | `highest` | `lowest` | `most_helpful`
  - `rating`: Integer 1–5 filter

### 14.4 Customer Personal Reviews
- **Route**: `GET /api/v1/me/reviews`
- **Authentication**: Required
- **Response (200 OK)**: Paginated reviews authored by the authenticated customer.

### 14.5 Edit & Soft-Delete Review
- `PATCH /api/v1/reviews/:id`: Allowed within 30 days of submission; updates `editedAt`.
- `DELETE /api/v1/reviews/:id`: Soft-deletes review (`status: DELETED`, `isDeleted: true`) and atomically recalculates vehicle rating.

### 14.6 Helpful Voting & Abuse Reporting
- `POST /api/v1/reviews/:id/helpful`: Idempotently toggles helpful vote. Compound unique index `{ reviewId: 1, userId: 1 }`.
- `POST /api/v1/reviews/:id/report`: Submits abuse report. Compound unique index `{ reviewId: 1, reportedBy: 1 }`.

### 14.7 Admin Review Moderation & Report Resolution
- `GET /api/v1/admin/reviews`: Admin review audit list with filter/sort.
- `PATCH /api/v1/admin/reviews/:id/moderate`: Moderation status change (`PUBLISHED`, `HIDDEN`, `REJECTED`).
- `GET /api/v1/admin/reviews/reports`: Queue of unresolved abuse reports.
- `PATCH /api/v1/admin/reviews/reports/:id`: Resolve or dismiss report with optional action (`HIDE_REVIEW` / `REJECT_REVIEW`).

---

## 15. Redis Caching & Background Queues (TASK 15)

### 15.1 Health Check Probe with Redis
- **Route**: `GET /api/v1/health`
- **Authentication**: None
- **Description**: Exposes system health probe including authoritative MongoDB connection state and safe Redis connection status (no internal credentials or connection strings exposed).
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "status": "ok",
      "uptimeSeconds": 3412,
      "environment": "production",
      "version": "1.0.0",
      "database": { "status": "connected" },
      "redis": {
        "status": "healthy",
        "connected": true
      }
    }
  }
  ```

### 15.2 Real-Time Queue Metrics
- **Route**: `GET /api/v1/admin/queues`
- **Authentication**: Required (`ADMIN`)
- **Description**: Returns live count of waiting, active, completed, failed, and delayed jobs across all 4 production BullMQ queues.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "name": "notification-queue",
        "queueName": "notification-queue",
        "waiting": 0,
        "active": 0,
        "completed": 124,
        "failed": 0,
        "delayed": 0,
        "paused": false
      },
      {
        "name": "booking-queue",
        "queueName": "booking-queue",
        "waiting": 0,
        "active": 0,
        "completed": 45,
        "failed": 0,
        "delayed": 3,
        "paused": false
      },
      {
        "name": "maintenance-queue",
        "queueName": "maintenance-queue",
        "waiting": 0,
        "active": 0,
        "completed": 12,
        "failed": 0,
        "delayed": 1,
        "paused": false
      },
      {
        "name": "reconciliation-queue",
        "queueName": "reconciliation-queue",
        "waiting": 0,
        "active": 0,
        "completed": 96,
        "failed": 0,
        "delayed": 1,
        "paused": false
      }
    ]
  }
  ```

### 15.3 Paginated Queue Jobs Inspection
- **Route**: `GET /api/v1/admin/queues/:queueName/jobs`
- **Authentication**: Required (`ADMIN`)
- **Query Parameters**:
  - `status`: `failed` | `waiting` | `active` | `completed` | `delayed` (default: `failed`)
  - `page`: Integer (default 1)
  - `limit`: Integer (default 20, max 50)
- **Security**: All job payloads are recursively sanitized to redact passwords, secrets, tokens, and authorization keys.

### 15.4 Admin Job Retry & Audit
- **Route**: `POST /api/v1/admin/queues/:queueName/jobs/:jobId/retry`
- **Authentication**: Required (`ADMIN`)
- **Description**: Re-queues a failed or completed job for execution. Records immutable audit record (`action: QUEUE_JOB_RETRY`).

### 15.5 Admin Job Removal & Audit
- **Route**: `POST /api/v1/admin/queues/:queueName/jobs/:jobId/clean`
- **Authentication**: Required (`ADMIN`)
- **Description**: Removes an unwanted job from the queue. Records immutable audit record (`action: QUEUE_JOB_CLEAN`).

