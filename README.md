# SkyBolt Rentals

> **Ride Your Way. Anywhere.**  
> A modern, responsive, and portfolio-ready vehicle rental web application built with Vanilla HTML5, CSS3, and JavaScript.

![SkyBolt Rentals Banner](frontend/assets/images/hero-bg.webp)

---

## 🌟 Key Features

- **Responsive Architecture & Design System**: Custom CSS design system with HSL/Hex color tokens, typography scales, glassmorphism headers, responsive grids, and dark/light contrast compliance.
- **Dynamic Vehicle Catalog**: Interactive fleet catalog (`vehicles.html`) with multi-facet filtering (Vehicle Category, Price Range, Location, Fuel Type, Transmission, Minimum Rating), search keyword matching, and real-time result counters.
- **Client-Side Sorting**: Instantly sort vehicles by `Price: Low to High`, `Price: High to Low`, `Highest Rated`, or `Popular`.
- **Persistent Favorites**: Add or remove vehicles from favorites with state persisted in browser `localStorage`.
- **Real-Time Booking Calculator Engine**: Dynamic rental calculator (`vehicle-details.html`) that computes rental duration, daily rates, subtotal, 18% tax, security deposit, and total amount instantly as dates change.
- **5-Step Checkout Wizard**: Step-by-step reservation workflow (`booking.html`) featuring vehicle selection, dates/locations, customer verification, price breakdown review, and reference ID confirmation (`SKY-2026-XXXXX`).
- **Protected User Dashboard**: Session-guarded user dashboard (`dashboard.html`) allowing users to manage active reservations, cancel bookings in real-time, view past history, inspect saved favorites, and update profile details.
- **Toast Notification Engine**: Custom, non-intrusive notification system (`js/toast.js`) replacing native browser `alert()` popups.
- **SEO & Accessibility Compliant**: Complete Open Graph metadata, semantic HTML5 tags (`<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`), ARIA attributes, keyboard `:focus-visible` focus rings, and `@media (prefers-reduced-motion: reduce)` accessibility support.

---

## 🛠️ Tech Stack

- **Frontend Core**: Vanilla HTML5, JavaScript (ES6+ Modules)
- **Styling**: Modular Vanilla CSS3 (Custom Design System Tokens, CSS Grid, Flexbox, Clamp typography)
- **Icons & Fonts**: FontAwesome 6.6.0, Google Fonts (`Inter`)
- **Storage**: Browser `localStorage` API
- **Animations**: CSS Transitions, Keyframe Animations, `IntersectionObserver` scroll-reveal observer

---

## 📁 Project Structure

```text
SkyBolt-Rentals/
├── frontend/                 # Client-side web application
│   ├── assets/               # High quality vehicle photography, icons, and hero assets
│   ├── css/                  # Responsive stylesheet & custom design tokens
│   ├── js/                   # Frontend logic modules (api.js, booking.js, vehicles.js, etc.)
│   ├── index.html            # Landing page (Hero, search widget, categories, reviews)
│   ├── vehicles.html         # Dynamic catalog with sidebar filters & search
│   ├── vehicle-details.html  # Vehicle specs view & dynamic pricing calculator
│   ├── booking.html          # 5-Step checkout reservation wizard
│   ├── dashboard.html        # Protected user dashboard (Active rentals, favorites)
│   ├── bikes.html            # Dedicated motorcycle catalog
│   ├── cars.html             # Dedicated car & SUV catalog
│   ├── scooters.html         # Dedicated e-scooter catalog
│   ├── about.html            # Brand story & trust pillars
│   ├── contact.html          # 24/7 Support details & inquiry form
│   ├── login.html            # Auth login page with demo credentials
│   └── register.html         # Account registration page
│
├── backend/                  # Production Node.js + Express + TypeScript backend API
│   ├── src/
│   │   ├── config/           # Database connection (Mongoose) & validated env config (Zod)
│   │   ├── controllers/      # Route controllers & response serializers
│   │   ├── middleware/       # Security headers, CORS, rate limits, request IDs, error handlers
│   │   ├── models/           # Mongoose base schemas, timestamps & virtuals
│   │   ├── repositories/     # Base repository persistence abstraction
│   │   ├── routes/           # Versioned route registry (/api/v1/*)
│   │   ├── services/         # Pure business logic & health checks
│   │   ├── types/            # TypeScript interfaces & API contracts
│   │   ├── utils/            # ApiError, ApiResponse, asyncHandler helpers
│   │   ├── app.ts            # Express application factory
│   │   └── server.ts         # Server entrypoint with graceful shutdown
│   ├── tests/                # Automated Vitest integration test suites
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
│
├── docs/                     # Production architectural & engineering documentation
│   ├── API.md                # Comprehensive REST API specifications
│   ├── ARCHITECTURE.md       # 5-tier enterprise system architecture & data layer
│   ├── ENVIRONMENT.md        # Environment variables & security lifecycle
│   ├── PRODUCTION_ROADMAP.md # 17-Phase production transformation plan
│   └── PROJECT_AUDIT.md      # Comprehensive audit report
│
├── scripts/                  # Automated verification & build integrity scripts
│   └── verify-integrity.js
├── .env.example              # Safe environment variable template
├── .gitignore                # Production Git exclusion rules
└── package.json              # Root orchestration scripts
```

---

## 🚀 Setup & Environment Configuration

### Prerequisites
- Modern Web Browser (Chrome, Firefox, Safari, Edge)
- **Node.js** >= 16.0.0 (for automated testing and verification scripts)
- **Python 3** (optional, for lightweight local HTTP server)

### 1. Installation
Clone the repository to your local machine:
```bash
git clone https://github.com/your-username/SkyBolt-Rentals.git
cd SkyBolt-Rentals
```

### 2. Environment Configuration
Copy the environment template and customize settings if needed:
```bash
cp .env.example .env.local
```
* Refer to [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) for full details on public client configuration vs. server secrets.
* Application configuration is centralized in [js/config.js](js/config.js) and accessible via `window.SkyBoltConfig`.

### 3. Start Development Server
Run the local development server:
```bash
# Using npm
npm run dev

# Or directly with Python 3
python3 -m http.server 8080
```
Open [http://localhost:8080](http://localhost:8080) in your web browser.

### 4. Run Automated Testing & Build Verification
Verify JavaScript syntax, link integrity, asset availability, and environment protection:
```bash
# Run syntax and integrity checks (Frontend)
npm test

# Run build / static verification check (Frontend)
npm run build
```

### 5. Start Backend API & Background Worker Services
The system is architected for production scalability with dedicated API and Worker processes:
```bash
# Start backend API in development mode (port 5001)
npm run backend:dev

# Start standalone BullMQ Background Worker in development mode
npm run backend:worker:dev

# Run complete backend automated test suite (32 test files, 336+ tests across TASKS 05-15)
npm run backend:test

# Compile production bundles
npm run backend:build

# Start compiled production services
npm run backend:start          # Production HTTP API Server
npm run backend:worker:start   # Production BullMQ Background Worker
```

### 6. Production Multi-Service Architecture
For production deployments (Render, Railway, Fly.io, AWS ECS), run independent services:
- **API Service**: `node dist/server.js` (Handles HTTP requests, cache-aside reads, and enqueuing jobs)
- **Worker Service**: `node dist/worker.js` (Processes `notification-queue`, `booking-queue`, `maintenance-queue`, and `reconciliation-queue`)
- **Authoritative Database**: MongoDB 6+ / Atlas
- **Cache & Queue Infrastructure**: Redis 7+ / Upstash / Redis Cloud

---

## 📚 Project Documentation

Detailed architectural and engineering documentation is available in the `docs/` and `backend/` directories:
- [docs/PROJECT_AUDIT.md](docs/PROJECT_AUDIT.md) — Comprehensive technical audit and risk register.
- [docs/PRODUCTION_ROADMAP.md](docs/PRODUCTION_ROADMAP.md) — 17-Phase production engineering roadmap.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System architecture, data models, API contracts, and future config strategy.
- [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) — Secrets policy, environment lifecycle, and configuration guidelines.
- [docs/API.md](docs/API.md) — Production API specification, response envelopes, and endpoint contracts.
- [backend/README.md](backend/README.md) — Backend service architecture, setup, testing, and deployment guide.

---

## 🔮 Future Improvements & Backend Roadmap

- **Node.js / Express Backend**: Migrate client-side `localStorage` data stores to a Node.js REST API with Express routing.
- **MongoDB / PostgreSQL Database**: Replace static dataset with a persistent database schema for real-time inventory tracking.
- **Payment Gateway Integration**: Integrate Stripe or Razorpay API for live payment processing.
- **JWT Authentication**: Secure user passwords with bcrypt hashing and JSON Web Tokens.

---

## 👤 Author & License

- **Developed By**: Kushagra (Senior Frontend Engineering & UI/UX Design)
- **License**: MIT License
