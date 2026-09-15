# SkyBolt Rentals — Production Readiness Audit Report

> **Task 01 Audit Document**  
> **Repository:** SkyBolt Rentals  
> **Status:** Completed  
> **Audit Date:** September 2026  
> **Target Audience:** Engineering Team, Product Leadership & Architecture Review  

---

## 1. Executive Summary

SkyBolt Rentals is currently structured as a client-side prototype built with Vanilla HTML5, CSS3, and modern JavaScript (ES6+). While the UI presentation, responsiveness, and design system (color tokens, typography, cards, and theme switching) provide a strong visual foundation, **the application currently possesses zero production-ready backend, security, or data persistence guarantees**. 

All operational logic—including authentication, vehicle catalog management, booking workflows, rental duration calculations, and financial charges—resides solely in the browser client and relies on unencrypted `localStorage`. 

This document details all technical debt, security vulnerabilities, architectural gaps, and operational risks discovered during the initial audit, classified by severity: **CRITICAL**, **HIGH**, **MEDIUM**, and **LOW**.

---

## 2. Inventory & Internal System Map

```text
Pages:
  ├── index.html            (Landing page with search widget, fleet showcase, why us, testimonials)
  ├── vehicles.html         (Search & multi-facet catalog filter)
  ├── vehicle-details.html  (Vehicle technical specs & instant rental estimate panel)
  ├── booking.html          (5-Step customer reservation wizard)
  ├── dashboard.html        (User dashboard: bookings, profile, favorites, cancellation modal)
  ├── bikes.html            (Category fleet page: bikes & motorcycles)
  ├── cars.html             (Category fleet page: cars & SUVs)
  ├── scooters.html         (Category fleet page: electric scooters)
  ├── about.html            (Company overview, trust metrics & vision)
  ├── contact.html          (Customer support & contact form)
  ├── login.html            (Customer authentication portal)
  └── register.html         (New customer account onboarding)

Components/UI:
  ├── Sticky Navigation Bar (Glassmorphic header, mobile hamburger drawer, session indicator)
  ├── Vehicle Cards (Media thumbnail, rating badge, specification pills, pricing, action links)
  ├── 5-Step Wizard Navigation (Progress indicator, panel transitions, calculation review)
  ├── Filter Sidebar (Range slider, radio pills, select dropdowns, keyword search)
  ├── Theme Switcher Engine (Dark/Light mode via data-theme attribute on <html>)
  ├── Toast Notification Engine (Non-intrusive alert stack)
  └── Modal Dialogs (Booking confirmation, reservation cancellation modal)

JavaScript Modules:
  ├── js/data.js            (Static vehicle dataset array & favorite store helpers)
  ├── js/app.js             (App init, theme switcher, navbar session state, mobile menu)
  ├── js/auth.js            (Registration & login handlers, mock user storage)
  ├── js/booking.js         (Checkout wizard stepper, dynamic price summary, booking store)
  ├── js/dashboard.js       (Auth route guard, bookings renderer, favorites renderer, cancellation)
  ├── js/details.js         (Vehicle detail renderer & single-page booking calculator)
  ├── js/toast.js           (Dynamic DOM toast notification engine)
  ├── js/ui.js              (Scroll shadow header, smooth scrolling, IntersectionObserver)
  └── js/vehicles.js        (Multi-facet filtering, keyword search, price/rating sorting)

Data Sources:
  ├── Static in-memory JS array (js/data.js - 12 vehicles)
  └── Browser localStorage keys:
      ├── skybolt_theme     (User UI theme preference: 'light' | 'dark')
      ├── skybolt_user      (Active logged-in session object)
      ├── skybolt_users     (Array of registered users including plaintext passwords)
      ├── skybolt_bookings  (Array of user reservation objects)
      └── skybolt_favorites (Array of favorite vehicle IDs)

External Dependencies:
  ├── FontAwesome CDN (v6.6.0)
  └── Google Fonts (Inter: 300, 400, 500, 600, 700, 800)
```

---

## 3. Findings & Production Risk Analysis

### 3.1 Security Vulnerabilities

| ID | Issue Title | Severity | Impact Description |
| :--- | :--- | :--- | :--- |
| **SEC-01** | **Plaintext Passwords in localStorage** | `CRITICAL` | `auth.js` (`saveUserToStore`) stores registered customer records including unhashed `password` in `localStorage['skybolt_users']`. Any script or XSS can read all user passwords. |
| **SEC-02** | **Bypassable / Fake Authentication** | `CRITICAL` | In `auth.js` (`initLoginForm`), the login handler checks if email matches an existing user, but **does not verify whether the password matches**. If no user matches, it creates a fake session on the fly. Anyone can log in as anyone with any password. |
| **SEC-03** | **Client-Side Authorization & Session Spoofing** | `CRITICAL` | Route protection in `dashboard.js` (`enforceAuthProtection`) checks `localStorage.getItem('skybolt_user')`. Any user can set this key in the browser console (`localStorage.setItem('skybolt_user', '{"name":"Admin"}')`) to gain full dashboard access. |
| **SEC-04** | **Unsafe DOM `innerHTML` Injection (XSS Risk)** | `HIGH` | Multiple modules (`vehicles.js`, `dashboard.js`, `booking.js`) inject vehicle names, customer inputs, and URL parameters directly into the DOM using template strings and `innerHTML` without HTML entity encoding or sanitization. |
| **SEC-05** | **Lack of CSRF / Session Tokens / HTTP-Only Cookies** | `HIGH` | No security cookies (`SameSite`, `HttpOnly`, `Secure`) exist. The system possesses no session invalidation, JWT verification, token rotation, or revocation mechanism. |
| **SEC-06** | **Missing Server-Side Input Sanitization** | `HIGH` | Phone numbers, emails, driving license strings, and names are never validated against strict server regexes or database constraints. Malicious payloads could be injected into persistent stores. |

---

### 3.2 Booking & Business Logic Flaws

| ID | Issue Title | Severity | Impact Description |
| :--- | :--- | :--- | :--- |
| **BKG-01** | **Client-Controlled Pricing Engine** | `CRITICAL` | Rental rates, days, tax (18%), deposit, and grand totals are calculated purely in client JavaScript and written directly to the stored booking object. A malicious actor can modify total to `₹1` in dev tools prior to confirming. |
| **BKG-02** | **No Real Vehicle Inventory or Availability Engine** | `CRITICAL` | There is no concurrency control, inventory lock, or database availability check. Ten users can reserve the exact same vehicle for the exact same date range simultaneously without conflict detection. |
| **BKG-03** | **Invalid & Past Booking Dates Permitted** | `HIGH` | Date inputs defaulted to hard-coded past dates (`2026-08-20` to `2026-08-23`). Without dynamic `min` constraints, users could book dates in the past or select return dates before pickup dates. |
| **BKG-04** | **Weak & Predictable Booking IDs** | `MEDIUM` | Booking references are generated via `Math.random()` (`SKY-2026-XXXXX` from 10000–99999). With only 90,000 possibilities, collision rate is high and IDs are trivially enumerable. |
| **BKG-05** | **Client-Controlled Booking Status** | `HIGH` | Bookings are marked as `'Confirmed'` immediately by client code without payment verification, identity verification, or fleet manager approval. Cancellation also happens directly on client state without business rule checks. |
| **BKG-06** | **Discrepancy Between Booking and Details Pricing** | `MEDIUM` | `booking.js` includes a ₹1,000 refundable security deposit in calculation, whereas `details.js` calculates only `subtotal + tax` without the security deposit, causing user confusion across pages. |

---

### 3.3 Data Storage & Persistence Issues

| ID | Issue Title | Severity | Impact Description |
| :--- | :--- | :--- | :--- |
| **DAT-01** | **Hardcoded Static Fleet Dataset** | `HIGH` | Fleet inventory of 12 vehicles is hard-coded into `js/data.js`. Updates require source code modification and redeployment; there is no database or administrative CMS. |
| **DAT-02** | **Inconsistent Data & Geographic Locations** | `MEDIUM` | Locations in `data.js` mix Indian cities ("Ludhiana") with US hubs ("New York Hub", "San Francisco Hub", "Chicago Downtown", "Los Angeles Station"). Furthermore, `index.html` used abbreviations ("ny", "sf") while `data.js` used full strings. In `bikes.html`, hardcoded cards cite "Central Park Hub", which does not exist in `data.js`. |
| **DAT-03** | **Currency Symbol Inconsistencies** | `LOW` | Landing page category cards display USD pricing ("Starting at $450/day"), whereas catalog, vehicle details, and booking steps use Indian Rupees ("₹450 / day"). |
| **DAT-04** | **Global, Unpartitioned LocalStorage Data** | `MEDIUM` | User bookings and profile data are stored under generic browser-wide keys (`skybolt_bookings`, `skybolt_user`). Multiple users sharing a workstation or browser profile will overwrite each other's bookings and data. |
| **DAT-05** | **Storage Quota & Failure Risk** | `MEDIUM` | `localStorage` has strict 5MB quotas and can throw unhandled `QuotaExceededError` or `SecurityError` in private browsing modes, causing the app to freeze if not wrapped safely. |

---

### 3.4 Code Quality & Technical Debt

| ID | Issue Title | Severity | Impact Description |
| :--- | :--- | :--- | :--- |
| **COD-01** | **Unused / Dead Script Imports** | `MEDIUM` | `contact.html` was importing `js/auth.js` despite containing no authentication forms, adding dead network payload and unnecessary execution overhead. |
| **COD-02** | **Missing Form Submission Handler on Contact Page** | `LOW` | `contact.html` had a `<form>` element with no JavaScript submit listener or action endpoint; submitting caused an unhandled browser page refresh. |
| **COD-03** | **Duplicated HTML Fleet Cards in Static Category Pages** | `MEDIUM` | `bikes.html`, `cars.html`, and `scooters.html` contain static, duplicated HTML cards instead of sharing the dynamic rendering engine in `vehicles.js`. If vehicle details change in `data.js`, these pages become desynchronized. |
| **COD-04** | **URL Parameter Mismatches Between Home & Catalog** | `MEDIUM` | `index.html` search form submitted `type=bikes`, `type=cars`, `type=scooters`, while `vehicles.js` expected `type=bike`, `type=car`, `type=scooter`, causing category preselection from home search to fail silently. |
| **COD-05** | **Missing Graceful Fallback for Invalid Vehicle IDs** | `MEDIUM` | Accessing `vehicle-details.html?id=9999` previously fell back silently to `vehicles[0]` without informing the user that their requested vehicle ID did not exist. |

---

### 3.5 Frontend, UX & Accessibility Issues

| ID | Issue Title | Severity | Impact Description |
| :--- | :--- | :--- | :--- |
| **UI-01** | **Hardcoded Past Dates in Form Defaults** | `HIGH` | Date pickers across `index.html`, `booking.html`, and `vehicle-details.html` were hardcoded to `2026-08-20`, which is in the past relative to execution time. |
| **UI-02** | **Lack of Loading States** | `LOW` | Because all data is synchronous, there are no skeleton screens, spinners, or loading states. Adding a real network API will require async loading indicators. |
| **UI-03** | **Unused Assets in Repository** | `LOW` | `assets/icons/` contains 8 WebP/PNG icons (cash, check-success, logo, navigation, person, rupee, secure-payment, traffic) that are unreferenced across the HTML and CSS codebases (which use FontAwesome). |

---

## 4. Classification Summary

```text
CRITICAL (Must fix before any production use):
  ├── SEC-01: Plaintext passwords in localStorage
  ├── SEC-02: Fake authentication with zero password check
  ├── SEC-03: Client-side route protection easily spoofed
  ├── BKG-01: Client-controlled pricing and payment totals
  └── BKG-02: Lack of server availability engine & inventory locking

HIGH (Significant operational, business, or security risk):
  ├── SEC-04: innerHTML XSS injection vectors
  ├── SEC-05: Missing session tokens, CSRF protection, and HttpOnly cookies
  ├── SEC-06: Missing server-side input sanitization
  ├── BKG-03: Past and invalid booking dates permitted
  ├── BKG-05: Client-controlled reservation status
  ├── DAT-01: Hardcoded fleet dataset requiring redeployments
  └── UI-01:  Hardcoded past dates in date picker inputs

MEDIUM (Degrades reliability, data integrity, or user experience):
  ├── BKG-04: Weak random booking IDs (SKY-2026-XXXXX)
  ├── BKG-06: Price discrepancy between details and booking flow
  ├── DAT-02: Inconsistent geographical hub locations
  ├── DAT-04: Global unpartitioned browser localStorage
  ├── DAT-05: Unhandled localStorage quota / security exceptions
  ├── COD-01: Dead script imports (auth.js in contact.html)
  ├── COD-03: Duplicated static HTML cards across category pages
  ├── COD-04: URL parameter mismatch between landing page and catalog
  └── COD-05: Missing invalid vehicle ID error state

LOW (Polish, minor inconsistency, or future optimization):
  ├── DAT-03: Dollar ($) vs Rupee (₹) symbol discrepancy
  ├── COD-02: Missing submit listener on contact inquiry form
  ├── UI-02:  Absence of asynchronous loading skeleton states
  └── UI-03:  Unreferenced asset files in assets/icons/
```

---

## 5. Immediate Foundation Fixes Implemented in Task 01

To stabilize the prototype without breaking existing user flows or introducing premature backend code:

1. **Date Validation Foundation**:
   - Replaced all hard-coded past dates (`2026-08-20`) with dynamic dates initialized to today and today + 3 days.
   - Enforced dynamic `min` attribute on pickup inputs (`today`) and return inputs (`pickupDate`).
   - Added automatic adjustment of return date when pickup date changes to prevent inverted ranges.
   - Enforced date validation checks in the booking wizard before advancing to customer review.

2. **Storage Safety & Exception Handling**:
   - Implemented safe localStorage utility wrappers with `try/catch` fallbacks to prevent crashes when cookies or storage are restricted or full.
   - Documented `localStorage` authentication explicitly as a non-secure prototype mechanism.

3. **URL Parameter & Search Normalization**:
   - Enhanced `vehicles.js` to normalize category inputs (`bikes` -> `bike`, `cars` -> `car`, `scooters` -> `scooter`) and parse location parameters from the home search widget.
   - Aligned select option values in `index.html` with catalog locations.

4. **Error Handling & Dead Code Cleanup**:
   - Removed unused `<script src="js/auth.js"></script>` from `contact.html`.
   - Added user feedback toast upon submitting the contact inquiry form.
   - Added a clear fallback notice in `vehicle-details.html` when an invalid vehicle ID is provided in the URL query string.
   - Added warning disclaimers regarding client-side pricing calculations.
