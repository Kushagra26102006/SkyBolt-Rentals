# SkyBolt Rentals — Day-2 Operations Runbook (Phase 29)

## Executive Summary
This runbook guides DevOps, SREs, and Platform Engineers through daily operations, routine maintenance, administrative tasks, and troubleshooting on SkyBolt Rentals.

---

## 1. Routine Maintenance Tasks

### 1.1 Daily Health & Queue Inspection
```bash
# Check API liveness & readiness
curl -s http://localhost:5001/health | jq .
curl -s http://localhost:5001/ready | jq .

# Inspect background queue depth
curl -s -H "Cookie: skybolt_auth=<ADMIN_TOKEN>" http://localhost:5001/api/v1/admin/queues | jq .
```

### 1.2 Weekly Backup Verification Drill
```bash
# Run automated database backup
node scripts/backup-mongodb.js

# Execute restoration drill into non-production drill database
node scripts/restore-mongodb.js
```

### 1.3 Monthly Index & Slow Query Review
```bash
# Query slow operations (> 100ms) in MongoDB
mongosh "<MONGODB_URI>" --eval "
  db.system.profile.find({ millis: { \$gt: 100 } }).sort({ ts: -1 }).limit(10);
"
```

---

## 2. Administrative Operational Commands

### 2.1 Vehicle Fleet Status Transition
```bash
# Update fleet vehicle status to MAINTENANCE
curl -X PATCH http://localhost:5001/api/v1/fleet/<VEHICLE_ID>/status \
  -H "Content-Type: application/json" \
  -H "Cookie: skybolt_auth=<ADMIN_TOKEN>" \
  -d '{"status": "MAINTENANCE", "reason": "Scheduled 10,000 km oil service"}'
```

### 2.2 Payment Manual Reconciliation Trigger
```bash
# Fetch unreconciled payments
curl -X GET http://localhost:5001/api/v1/payments/reconciliation/report \
  -H "Cookie: skybolt_auth=<ADMIN_TOKEN>"
```

### 2.3 Failed Notification Queue Redrive
```bash
# Redrive failed jobs in the notification dead-letter queue
curl -X POST http://localhost:5001/api/v1/admin/queues/notification/retry-failed \
  -H "Cookie: skybolt_auth=<ADMIN_TOKEN>"
```

---

## 3. Host System Resource Thresholds
- **CPU Alert**: Sustained > 80% utilization for 10 minutes.
- **Memory Alert**: Sustained > 85% resident memory.
- **Disk Space Alert**: Free disk space < 15% on `/data` volume.
