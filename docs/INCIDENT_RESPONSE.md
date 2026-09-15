# SkyBolt Rentals — Production Incident Response Protocol (Phase 25)

## Executive Summary
This document establishes standard operating procedures for managing, mitigating, resolving, and learning from production incidents at SkyBolt Rentals.

---

## 1. Severity Classifications

| Severity Level | Definition & Criteria | Target Acknowledge | Target Mitigation | Communication Cadence |
| :--- | :--- | :--- | :--- | :--- |
| **SEV-1 (CRITICAL)** | - Platform-wide outage<br>- Payment corruption / failure<br>- Booking / inventory corruption<br>- Security vulnerability or credential compromise | **< 5 minutes** | **< 30 minutes** | Every 15 minutes to stakeholders |
| **SEV-2 (HIGH)** | - Core subsystem degraded (e.g. notifications halted, AI offline)<br>- Elevated 5xx error rate (> 1%)<br>- Queue backlog surge (> 500 jobs) | **< 15 minutes** | **< 2 hours** | Every 45 minutes |
| **SEV-3 (MEDIUM)** | - Non-critical functionality degraded<br>- Minor admin report timeout<br>- Single notification provider delay with outbox working | **< 1 hour** | **< 8 hours** | Daily / As needed |

---

## 2. Incident Lifecycle (7 Phases)

### Phase 1: Detection & Triage
- Automated alerts trigger via PagerDuty / OpsGenie / Slack (`#alerts-production`).
- The primary On-Call Engineer acknowledges the alert within SLA.
- If verified as SEV-1, immediately open the Incident Bridge and designate the **Incident Commander (IC)**.

### Phase 2: Escalation & War Room
- The IC pages the Engineering Leads, Database SRE, and Security Officer.
- War room bridge established (Slack `#incident-YYYYMMDD-SEV1` + voice conference).

### Phase 3: Immediate Containment
- **Goal**: Stop ongoing data corruption or security exposure without waiting for root cause analysis.
- Options:
  - If payment fraud/mismatch: Toggle `ENABLE_PAYMENTS=false`.
  - If third-party provider failure: Trip circuit breaker / fallback to mock.
  - If DDoS / abusive IP: Blacklist IP at Cloudflare / Nginx level.
  - If bad release: Trigger immediate rollback per [ROLLBACK_RUNBOOK.md](file:///Users/kushagra/Desktop/SkyBolt-Rentals-main/docs/ROLLBACK_RUNBOOK.md).

### Phase 4: Investigation & Root Cause Identification
- Utilize structured correlation IDs (`X-Request-ID`) to trace failed requests across logs.
- Inspect `ErrorTracker` recent errors and MongoDB slow query telemetry.

### Phase 5: Remediation & Recovery
- Apply approved hotfix or completed rollback.
- Drain stalled queues and verify Redis/Mongo consistency.

### Phase 6: Verification & Sign-Off
- Execute automated smoke test suite: `npx vitest run tests/production-smoke.test.ts`.
- Verify synthetic probes on `/health` and `/ready`.
- IC officially declares incident mitigated.

### Phase 7: Postmortem & Blameless RCA
- Conducted within 48 hours for all SEV-1 and SEV-2 incidents.
- Postmortem document committed to `docs/postmortems/YYYY-MM-DD-incident-title.md`.

---

## 3. Postmortem Document Template
```markdown
# Incident Postmortem: [Title]
**Date**: YYYY-MM-DD  
**Severity**: SEV-1 / SEV-2  
**Incident Commander**: [Name]  
**Lead Investigator**: [Name]  

## 1. Summary & Customer Impact
- Duration: [X] minutes
- Impacted Users: [Y] customers
- Financial / Booking Impact: [Z]

## 2. Root Cause (5 Whys)
1. Why did the issue occur? ...
2. Why? ...
3. Why? ...
4. Why? ...
5. Why? ...

## 3. Timeline (UTC)
- HH:MM — Alert triggered
- HH:MM — Incident Commander paged
- HH:MM — Containment action applied
- HH:MM — Resolution verified

## 4. Action Items & Corrective Preventive Actions (CAPA)
- [ ] [Action 1] (Owner: [Name], Due: [Date])
- [ ] [Action 2] (Owner: [Name], Due: [Date])
```
