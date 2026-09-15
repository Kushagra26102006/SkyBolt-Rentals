# SkyBolt Rentals — Production Rollback Runbook (Phase 24)

## Executive Summary
This runbook provides deterministic, step-by-step procedures to revert frontend client assets, backend API servers, background workers, database schemas, and environment configurations in the event of a critical production release failure.

---

## 1. Rollback Authority & Triggers

### 1.1 Authorized Roles
- **Release Commander** / **Lead SRE**
- **Security Incident Lead**

### 1.2 Automatic Rollback Triggers
- Core booking or payment creation failure rate > 5% within 15 minutes of release.
- Unhandled 5xx server error rate > 2% lasting > 5 minutes.
- Database connection corruption or migration deadlocks.
- Webhook signature validation failure across all incoming Razorpay webhooks.

---

## 2. Component Rollback Procedures

### 2.1 Backend API Rollback
```bash
# Step 1: Identify previous stable release commit/tag
PREVIOUS_RELEASE_TAG="v1.0.17"

# Step 2: In Containerized / Docker environment
docker pull skybolt/backend:${PREVIOUS_RELEASE_TAG}
docker service update --image skybolt/backend:${PREVIOUS_RELEASE_TAG} skybolt_backend

# Or with docker-compose:
sed -i.bak "s/skybolt-backend:.*/skybolt-backend:${PREVIOUS_RELEASE_TAG}/" docker-compose.prod.yml
docker compose -f docker-compose.prod.yml up -d --no-deps backend

# Step 3: Verify Liveness & Readiness
curl -f http://localhost:5001/health
curl -f http://localhost:5001/ready
```

### 2.2 Background Worker Rollback
```bash
# Step 1: Rollback worker container to matching release tag
docker compose -f docker-compose.prod.yml up -d --no-deps worker

# Step 2: Verify worker log stream
docker logs skybolt-worker-prod --tail 50 -f
```

### 2.3 Frontend Client Rollback
```bash
# Step 1: In CDN / S3 / Static host
aws s3 sync /opt/skybolt/releases/previous/frontend/ s3://skybolt-frontend-prod/ --delete

# Step 2: Invalidate CDN Edge Cache
aws cloudfront create-invalidation --distribution-id $CF_DIST_ID --paths "/*"

# Step 3: Verify Client Configuration & Hash
curl -I https://skyboltrentals.com/js/config.js
```

### 2.4 Database Schema / Migration Rollback
- **Principle**: Schema changes in SkyBolt Rentals follow the **Expand -> Migrate -> Verify -> Contract** pattern. New code must be backward compatible with existing documents.
- If an index addition causes write latency spikes:
```bash
# Drop offending index safely in MongoDB
mongosh "<MONGODB_URI>" --eval "
  db.bookings.dropIndex('offending_index_name');
"
```

---

## 3. Post-Rollback Verification Suite
Run the automated smoke test suite against the rolled-back deployment immediately:
```bash
npm --prefix backend run test:smoke
```

Ensure all 23 scenarios pass before resolving the incident.
