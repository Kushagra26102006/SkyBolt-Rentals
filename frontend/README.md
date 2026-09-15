# SkyBolt Rentals — Frontend Client

> **HTML5 • CSS3 • Modern JavaScript (ES Modules) • Responsive Design**

---

## 1. Overview

This directory contains the user-facing web client for **SkyBolt Rentals**, providing a modern, responsive vehicle rental interface with dark/light themes, dynamic price calculations, multi-step booking wizard, and simulated user account management.

---

## 2. Directory Structure

```text
frontend/
├── assets/
│   ├── icons/            # SVG vector icons
│   └── images/           # WebP vehicle catalog photography & hero assets
├── css/
│   └── styles.css        # Responsive stylesheet, custom variables, and theme tokens
├── js/
│   ├── api.js            # Unified API HTTP client (`window.SkyBoltApi`)
│   ├── app.js            # Core UI bindings, mobile menu, and global initializers
│   ├── auth.js           # Prototype client-side session state & demo login
│   ├── booking.js        # Multi-step booking wizard & state machine
│   ├── config.js         # Centralized runtime configuration (`window.SkyBoltConfig`)
│   ├── dashboard.js      # Customer dashboard, active rentals & favorites
│   ├── data.js           # Seed vehicles & safe localStorage persistence wrapper
│   ├── details.js        # Vehicle detail view & dynamic price calculator
│   ├── toast.js          # Toast notification provider
│   ├── ui.js             # Theme toggle & UI micro-interactions
│   └── vehicles.js       # Fleet catalog filtering, sorting & search
├── about.html
├── bikes.html
├── booking.html
├── cars.html
├── contact.html
├── dashboard.html
├── index.html
├── login.html
├── register.html
├── scooters.html
├── vehicle-details.html
├── vehicles.html
└── README.md
```

---

## 3. Running Locally

From the project root:

```bash
npm run dev
```

Or directly serve the `frontend/` directory:

```bash
python3 -m http.server 8080 -d frontend
```

The frontend will be accessible at:
[http://localhost:8080](http://localhost:8080)
