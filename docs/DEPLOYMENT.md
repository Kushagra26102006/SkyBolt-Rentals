# SkyBolt Rentals — Production Deployment Guide (Phase 19 & 29)

## Executive Summary
This guide details the end-to-end production deployment workflow for SkyBolt Rentals. The deployment architecture supports containerized multi-tier hosting via Docker / Kubernetes / AWS ECS / Render.

---

## 1. Prerequisites
- Docker Engine 24+ & Docker Compose v2.
- Node.js 20 LTS.
- Managed MongoDB Atlas cluster (v7.0+) with user credentials and IP access list configured.
- Managed Redis cluster (v7.x) with TLS and authentication password.
- Razorpay live merchant credentials (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`).

---

## 2. Environment Preparation
1. Copy template:
   ```bash
   cp backend/.env.production.example backend/.env.production
   ```
2. Populate production secrets from your secure key vault (AWS Secrets Manager / Vault / 1Password).
3. Validate secret formatting:
   ```bash
   node -e "require('dotenv').config({ path: 'backend/.env.production' }); console.log('Config valid');"
   ```

---

## 3. Production Deployment Commands

### Approach A: Docker Compose Multi-Container Stack
```bash
# 1. Pull / Build Production Container Images
docker compose -f docker-compose.prod.yml build

# 2. Start Data & Cache Services
docker compose -f docker-compose.prod.yml up -d redis

# 3. Start Backend REST API Cluster
docker compose -f docker-compose.prod.yml up -d backend

# 4. Verify API Health & Readiness
curl -f http://localhost:5001/health
curl -f http://localhost:5001/ready

# 5. Start Background Workers
docker compose -f docker-compose.prod.yml up -d worker

# 6. Start Frontend Nginx Edge Ingress
docker compose -f docker-compose.prod.yml up -d frontend

# 7. Execute Smoke Test Suite
docker exec skybolt-backend-prod npx vitest run tests/production-smoke.test.ts
```

### Approach B: Bare-Metal / Systemd / Virtual Machine
```bash
# 1. Install & Build
npm --prefix backend ci --only=production
npm --prefix backend run build

# 2. Start API Service via PM2 / Systemd
NODE_ENV=production pm2 start dist/server.js --name "skybolt-api" -i max

# 3. Start Background Worker Daemon
NODE_ENV=production pm2 start dist/worker.js --name "skybolt-worker" -i 2
```

---

## 4. Staging Deployment Commands
```bash
# Launch self-contained staging stack with local MongoDB & Redis
docker compose -f docker-compose.staging.yml up -d --build

# Run automated smoke test against staging stack
docker exec skybolt-backend-staging npx vitest run tests/production-smoke.test.ts
```
