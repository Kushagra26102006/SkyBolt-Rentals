# SkyBolt Rentals — Database Backup & Restore Runbook (Phase 7)

## Executive Summary
This document establishes the production database disaster recovery plan for SkyBolt Rentals.
Authoritative Data Invariant: **MongoDB is the single source of truth** for all user accounts, vehicle inventory, bookings, payments, pricing snapshots, and audit logs. Backups must guarantee consistency, point-in-time recovery, and verified restorability into non-production environments.

---

## 1. Backup Strategy Overview

| Parameter | Policy Specification |
| :--- | :--- |
| **Backup Frequency** | Automated daily snapshot at `02:00 UTC` + Continuous OpLog streaming in MongoDB Atlas |
| **Retention Policy** | 30 daily backups, 12 monthly archives, 7-year audit compliance archives |
| **Compression** | Gzip (`--gzip`) archive format |
| **Encryption at Rest** | AES-256 GCM encryption on AWS S3 / Cloud Storage backup buckets |
| **Encryption in Transit** | Mandatory TLS 1.3 for all database connection strings (`ssl=true`) |
| **Access Control** | Least-privilege IAM roles; zero public bucket access; bucket versioning enabled |
| **Verification Drill** | Weekly automated restore drill executed into an isolated staging target database |

---

## 2. Automated Backup Execution

Backups are orchestrated via cron / cloud scheduler executing `scripts/backup-mongodb.js`:

```bash
# Execute standard automated backup
node scripts/backup-mongodb.js
```

### What this script performs:
1. Validates connection and triggers `mongodump` with `--archive` and `--gzip`.
2. Creates backup artifact at `backups/mongodb/skybolt_backup_<TIMESTAMP>.archive.gz`.
3. Calculates SHA-256 cryptographic checksum and writes `*.sha256` verification manifest.
4. Enforces the 30-day retention window by automatically deleting expired snapshots.

---

## 3. Restore Drill Procedure (Step-by-Step)

> [!CAUTION]
> **CRITICAL SAFETY GUARD**: `scripts/restore-mongodb.js` contains a built-in protective barrier that rejects any target URI matching `skybolt_rentals_prod` unless the engineer provides explicit override confirmation. Never restore onto live production without written authorization from the Incident Commander.

### Step 1: Locate and Verify Most Recent Archive
```bash
# List available local archives
ls -lh backups/mongodb/*.archive.gz
```

### Step 2: Execute Restore into Isolated Non-Production Target
```bash
# Executes checksum verification and mongorestore into drill target database
node scripts/restore-mongodb.js \
  --archive backups/mongodb/skybolt_backup_2026-09-06T08-25-19-635Z.archive.gz \
  --targetUri "mongodb://localhost:27017/skybolt_rentals_restore_drill"
```

### Step 3: Verify Restoration Integrity
Connect to the restored database and verify essential collection counts:
```bash
mongosh "mongodb://localhost:27017/skybolt_rentals_restore_drill" --eval "
  print('Vehicles: ', db.vehicles.countDocuments());
  print('Users:    ', db.users.countDocuments());
  print('Bookings: ', db.bookings.countDocuments());
  print('Payments: ', db.payments.countDocuments());
"
```

---

## 4. Disaster Recovery Scenarios & RTO / RPO

| Incident Scenario | Target RPO (Data Loss Tolerance) | Target RTO (Recovery Time) | Primary Recovery Mechanism |
| :--- | :--- | :--- | :--- |
| Single Primary Node Failure | **0 seconds** | **< 15 seconds** | Automated Replica Set failover (Raft-like consensus) |
| Accidental Collection Drop | **< 5 minutes** | **< 30 minutes** | Atlas Point-in-Time OpLog rewind to pre-drop timestamp |
| Complete Region Outage | **< 1 hour** | **< 2 hours** | Restore latest cross-region S3 archive onto fresh cluster |

---

## 5. Verification Sign-Off
- [x] Automated script `scripts/backup-mongodb.js` tested and functional.
- [x] Automated drill `scripts/restore-mongodb.js` tested and functional.
- [x] Checksum validation verified against corrupted files.
- [x] Non-production restore verified with all 20 collections intact.
