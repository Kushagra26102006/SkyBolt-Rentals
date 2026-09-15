# SkyBolt Rentals — Razorpay Payment Production Runbook (Phase 10)

## Executive Summary
This runbook governs the deployment, configuration, operational management, and disaster recovery of the Razorpay live payment gateway on SkyBolt Rentals.
Authoritative Payment Invariant: **Server-side validation is authoritative.** The client frontend is completely untrusted; amounts, currencies, booking associations, and capture states are derived strictly from database pricing snapshots and cryptographically verified Razorpay webhooks.

---

## 1. Credentials & Secrets Management

| Credential Name | Environment Scope | Exposed to Frontend? | Description |
| :--- | :--- | :--- | :--- |
| `RAZORPAY_KEY_ID` | Client & Server | **YES** | Public identifier required by the Razorpay Checkout modal |
| `RAZORPAY_KEY_SECRET` | Server Only | **NO (STRICT SECRET)** | Secret used for server-side HMAC payment signature validation |
| `RAZORPAY_WEBHOOK_SECRET` | Server Only | **NO (STRICT SECRET)** | Secret used for HMAC SHA-256 webhook payload signature validation |

---

## 2. Pre-Flight Production Launch Checklist

### A. Razorpay Merchant Dashboard Setup
- [ ] Business KYC verified and approved on the Razorpay Dashboard.
- [ ] International payments enabled / disabled according to company policy.
- [ ] Auto-capture configured to manual or immediate based on settlement policies.
- [ ] Webhook URL registered: `https://api.skyboltrentals.com/api/v1/payments/webhook`.
- [ ] Webhook events subscribed:
  - `payment.captured`
  - `payment.failed`
  - `order.paid`
  - `refund.processed`
- [ ] Secret generated and copied directly into AWS Secrets Manager / production `.env.production`.

### B. Technical & Infrastructure Verification
- [ ] Express middleware preserves raw body buffer (`req.rawBody`) for HMAC calculation.
- [ ] Webhook replay protection verified: `WebhookEventModel` rejects duplicate `eventId`s.
- [ ] Amount integrity check: Razorpay order amount in paise matches `Math.round(pricingSnapshot.total * 100)`.
- [ ] Currency verification: Strictly enforces `INR`.
- [ ] TLS certificate verified on webhook domain with valid A+ rating.

---

## 3. Webhook Cryptographic Verification Architecture

```text
Razorpay Cloud -> HTTPS POST /api/v1/payments/webhook
                   |
                   +--> Extract raw request buffer (req.rawBody)
                   +--> Read header X-Razorpay-Signature
                   +--> Calculate HMAC SHA-256 (rawBody, RAZORPAY_WEBHOOK_SECRET)
                   +--> If mismatch: Reject 400 Bad Request
                   +--> Check WebhookEventModel for eventId (Replay Guard)
                   +--> If already exists: Return 200 OK (Status: IGNORED)
                   +--> Transition Payment to CAPTURED & Booking to CONFIRMED
                   +--> Enqueue transactional notifications
```

---

## 4. Operational Failure Scenarios & Troubleshooting

### Scenario A: Webhook Delivery Delayed or Dropped
- **Symptom**: Customer sees payment successful on Razorpay screen, but booking remains `PENDING`.
- **Mitigation**: The frontend calls `POST /api/v1/payments/verify` with `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature`. The server verifies the signature synchronously and immediately confirms the booking.
- **Reconciliation Safety**: A background reconciliation job queries Razorpay's Orders API periodically for any bookings in `PENDING` state for > 15 minutes.

### Scenario B: Payment Amount Tampering
- **Attack Vector**: Malicious client alters request payload to pay ₹100 instead of ₹10,000.
- **Protection**: `createPaymentOrder` reads total strictly from `booking.pricingSnapshot.total`. Any mismatch in `verifyPayment` raises `PAYMENT_AMOUNT_MISMATCH` and aborts capture.

---

## 5. Rollback Considerations
If payment processing encounters live production defects:
1. Immediately switch `ENABLE_PAYMENTS=false` in application configuration to pause checkout.
2. In Razorpay Dashboard, toggle Webhooks off or temporarily reroute to a fallback staging endpoint.
3. Drain payment reconciliation queue before rolling back application versions.
