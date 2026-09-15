# SkyBolt Rentals — Environment & Secrets Management Policy

> **Document:** `docs/ENVIRONMENT.md`  
> **Status:** Active Reference & Compliance Policy  
> **Scope:** Configuration Management, Secrets Demarcation, Environment Lifecycle & Security Hardening  

---

## 1. Fundamental Security Mandate

All engineers, contributors, and operators working on **SkyBolt Rentals** must strictly adhere to the following four core security tenets:

```text
1. Secrets must never be committed to Git.
2. Secrets must never be placed in frontend source code.
3. Secrets must never be stored in localStorage.
4. Secrets must never be exposed through public client-side configuration.
```

Any accidental credential exposure in commits or client-visible files constitutes a high-severity security incident requiring immediate secret rotation and git history remediation.

---

## 2. Public Configuration vs. Server-Only Secrets

A critical boundary exists between **Public Client-Side Configuration** and **Server-Only Secrets**:

```text
┌──────────────────────────────────────────────┐  ┌──────────────────────────────────────────────┐
│             PUBLIC CONFIGURATION             │  │             SERVER-ONLY SECRETS              │
│       (Browser-Visible / Non-Sensitive)      │  │        (Never Exposed to the Browser)        │
├──────────────────────────────────────────────┤  ├──────────────────────────────────────────────┤
│ • APP_ENV ('development', 'production')      │  │ • Database connection strings & passwords    │
│ • APP_BASE_URL (https://skyboltrentals.com)  │  │ • JWT signing secrets & encryption keys      │
│ • API_BASE_URL (https://api.skybolt.com/v1)  │  │ • Payment gateway secret keys (Stripe/Razor) │
│ • Client feature flags (e.g. enableReviews)  │  │ • Email/SMS API credentials (SendGrid, Twilio│
│ • Static asset CDN paths                     │  │ • OAuth client secrets & webhook HMAC keys   │
│ • Public API keys (e.g. Google Maps JS API)  │  │ • Cloud infrastructure access keys (AWS/GCP) │
└──────────────────────────────────────────────┘  └──────────────────────────────────────────────┘
```

> [!CAUTION]
> **Zero Secrets in Frontend Bundles**:  
> Any variable embedded in frontend HTML, CSS, or JavaScript is trivially viewable by every end-user using browser developer tools. Only non-sensitive URLs, flags, and public identifiers may be loaded into the client.

---

## 3. Environment Lifecycle Specifications

### 3.1 Development Environment (`development`)
- **Host**: `http://localhost:8080` (or `127.0.0.1`)
- **Purpose**: Local feature development, interactive UI testing, and component prototyping.
- **Configuration Setup**:
  1. Copy `.env.example` to `.env.local`:
     ```bash
     cp .env.example .env.local
     ```
  2. Configure local ports and URLs if different from the default `8080`.
- **Runtime Behavior**:
  - Verbose debug logging is enabled (`SkyBoltConfig.logger.debug`).
  - Full error messages and diagnostic contexts are printed to the console.
  - Development placeholders are used for API endpoints until backend services are active.

### 3.2 Testing Environment (`test`)
- **Host**: CI/CD Runner / Automated Test Runner / Staging Host
- **Purpose**: Automated syntax verification, link integrity audits, integration tests, and headless browser validation.
- **Configuration Setup**:
  - `.env.test` or environment variables injected via CI pipeline.
  - Fixed test seeds and deterministic time references.
- **Runtime Behavior**:
  - Diagnostic logging is filtered to warnings and errors (`logLevel: 'warn'`).
  - Strict assertions run without visual browser prompts.

### 3.3 Production Environment (`production`)
- **Host**: `https://skyboltrentals.com` (Edge CDN / SSL Protected)
- **Purpose**: Live customer traffic, fleet reservations, and payment processing.
- **Configuration Setup**:
  - Environment variables must be injected by cloud infrastructure (e.g., Vercel, AWS Secrets Manager, Kubernetes ConfigMaps/Secrets).
  - No `.env` files are deployed to public web root directories.
- **Runtime Behavior**:
  - Debug diagnostics are suppressed (`SkyBoltConfig.logger.debug` is a no-op).
  - Production errors are sanitized to user-friendly messages with zero stack traces or internal filesystem paths.
  - Strict Content Security Policy (CSP) and HTTPS are enforced.

---

## 4. Centralized Configuration Architecture (`js/config.js`)

In the existing Vanilla JavaScript architecture, configuration is managed through the centralized, frozen module [js/config.js](file:///Users/kushagra/Desktop/SkyBolt-Rentals-main/js/config.js).

### Configuration Attributes

```javascript
window.SkyBoltConfig = {
  env: 'development',         // 'development' | 'test' | 'production'
  isProduction: false,        // boolean convenience flag
  isDevelopment: true,        // boolean convenience flag
  isTest: false,              // boolean convenience flag
  version: '1.0.0',           // semantic version string
  appBaseUrl: '...',          // base URL of frontend application
  apiBaseUrl: '...',          // base URL of REST API
  logLevel: 'debug',          // 'debug' | 'info' | 'warn' | 'error'
  featureFlags: {             // immutable feature flag dictionary
    enablePayments: false,
    enableReviews: false,
    enableNotifications: false,
    enableAi: false
  },
  logger: {                   // environment-aware logging methods
    debug(...args),
    info(...args),
    warn(...args),
    error(msg, err)
  },
  validate()                  // self-validation method
};
```

### Self-Validating Configuration
The configuration module runs automatic validation on startup. If mandatory configuration parameters are missing or if forbidden secret-related keywords (`password`, `secret`, `token`, `private_key`) are detected, initialization halts immediately with an explicit error.

---

## 5. Feature Flags Framework

Feature flags govern the gradual rollout of upcoming backend systems:

| Flag Name | Default | Phase Activated | Description |
| :--- | :---: | :---: | :--- |
| `enablePayments` | `false` | Phase 9 | Activates live payment gateway modal and webhook processing. |
| `enableReviews` | `false` | Phase 14 | Enables customer review submissions for completed rentals. |
| `enableNotifications` | `false` | Phase 13 | Enables SMS and transactional email reminders. |
| `enableAi` | `false` | Future | Activates AI-driven vehicle recommendation assistant. |

---

## 6. Git Protection Rules

The [.gitignore](file:///Users/kushagra/Desktop/SkyBolt-Rentals-main/.gitignore) file strictly excludes all local environment and secret-bearing files:

```gitignore
.env
.env.local
.env.development.local
.env.test.local
.env.production
.env.production.local
.env.*.local
!.env.example
```

* `.env.example` remains tracked as a safe template.
* If any secret is accidentally committed to Git:
  1. Revoke and rotate the secret immediately at the provider.
  2. Rewrite Git commit history to purge the credential.
  3. Re-verify the repository with secret scanning tools before pushing.

---

## 7. MongoDB Database Configuration & Lifecycle

### 7.1 Database Environment Variables

| Variable Name | Environment | Default Value | Description |
| :--- | :---: | :--- | :--- |
| `MONGODB_URI` | All | `mongodb://localhost:27017/skybolt_rentals` | Connection string URI (never commit real passwords) |
| `MONGODB_DB_NAME` | All | `skybolt_rentals` | Target database name |
| `MONGODB_TIMEOUT_MS` | All | `5000` | Server selection & socket timeout (ms) |
| `MONGODB_MAX_POOL_SIZE`| All | `10` | Maximum connection pool size |
| `MONGODB_MIN_POOL_SIZE`| All | `2` | Minimum connection pool size |

### 7.2 Environment-Specific Database Strategies

1. **Development (`development`)**:
   - Run a local MongoDB instance via Docker:
     ```bash
     docker run -d --name skybolt-mongo -p 27017:27017 mongo:7
     ```
   - Or connect to a dedicated development MongoDB Atlas cluster.

2. **Automated Testing (`test`)**:
   - Integration tests utilize `mongodb-memory-server`.
   - Spins up an isolated, ephemeral in-memory MongoDB process automatically per test suite.
   - Zero external database dependencies or data pollution.

3. **Production (`production`)**:
   - `MONGODB_URI` is injected by cloud infrastructure (AWS Secrets Manager, Kubernetes Secret, or Doppler).
   - High-availability MongoDB Atlas replica set (or cluster) required to support multi-document ACID transactions.
   - Credentials and URI are strictly quarantined to the backend environment and never exposed to the frontend.

---

## 8. Authentication & Security Configuration (TASK 05)

### 8.1 Authentication Environment Variables

| Variable Name | Environment | Default Value | Description |
| :--- | :---: | :--- | :--- |
| `JWT_SECRET` | All | `development_super_secure_jwt_secret...` | Cryptographic secret for signing JWTs (min 32 chars) |
| `JWT_EXPIRES_IN` | All | `7d` | Stateless JWT expiration duration |
| `AUTH_COOKIE_NAME` | All | `skybolt_auth` | Name of the HTTP-only session cookie |
| `AUTH_COOKIE_SECURE` | Dev / Prod | `false` (dev), `true` (prod) | Enforces HTTPS-only transmission |
| `AUTH_COOKIE_SAME_SITE`| All | `lax` | Browser cookie cross-site policy (`lax` / `strict`) |
| `AUTH_RATE_LIMIT_WINDOW_MS` | All | `900000` (15m) | Window for auth rate limiting |
| `AUTH_RATE_LIMIT_MAX` | All | `15` | Maximum auth attempts allowed per IP per window |
| `PASSWORD_RESET_EXPIRES_MS`| All | `900000` (15m) | Password reset token expiration window |
| `BCRYPT_SALT_ROUNDS` | All | `10` | Salt work factor for bcrypt password hashing |

### 8.2 Security & Cookie Architecture
- **Stateless HTTP-Only Cookies**: JWTs are embedded in `HttpOnly` SameSite cookies to protect against XSS token harvesting.
- **CSRF Defense**: State-changing requests (`POST`, `PATCH`, `DELETE`) with cookie sessions are validated against `Origin` and `Referer` headers matching `CORS_ORIGIN`, supplemented by custom `X-Requested-With` headers.
- **Credential Protection**: Passwords are never stored or returned in plaintext; Mongoose models strictly set `passwordHash` to `select: false`.

