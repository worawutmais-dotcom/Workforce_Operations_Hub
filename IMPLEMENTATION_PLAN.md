# BVN Package — Implementation Plan

## Phase 1 — Identity and coherent activation

**Objective:** replace ID/manual token flow with Admin-generated ID, temporary password, employee-name selection, and device session.

- Apps Script: finalize employee schema, password reset/login/directory actions, migration helper and audit entries.
- Admin: remove manual Employee ID field; present generated ID and temporary password once; add Reset password.
- Mobile: fetch active directory, choose name, password login, store returned session securely.
- Acceptance: inactive/non-existent users cannot login or submit attendance.
- Verification: Apps Script parse; API negative tests; Flutter widget tests; arm64 APK build; Admin EXE build.

## Phase 2 — Attendance, leave and approval

**Objective:** create a truthful live workflow for check-in/out and leave.

- Mobile: live timeline, leave submit/calendar, profile-driven location policy.
- Admin: read live attendance/leave queues, approve/reject leave and attendance exceptions.
- API: state validation, duplicate-event protection, audit rows.
- Acceptance: both required-location and no-location employees complete a real-device flow.

## Phase 3 — Pay rules and payroll preview

**Objective:** calculate an auditable gross-pay preview from approved attendance.

- Pay policies: hourly/daily, standard hours, approved OT, premium dates/multipliers.
- Admin: period selection, employee breakdown, warnings, approval lock and CSV export.
- API/Sheet: pay-rule history, payroll run, payroll line items and approval audit.
- Non-goal: statutory tax/SSO/payment execution until legally validated.

## Phase 4 — Billing and release hardening

**Objective:** persist invoices, remove demo ambiguity and establish release checks.

- Invoice persistence/status/payment tracking; PDF is deferred unless a required layout is supplied.
- Live/Demo status indicator everywhere.
- Regression tests, artifact hashes, installation guide and field-test checklist.

## Quality gates

- `node -e` Apps Script parse check.
- Python `py_compile` and focused model tests.
- Flutter analyze, widget tests and arm64 debug build.
- Endpoint health plus negative authentication probes.
- Real-device test is a release gate, not a simulated test.

## Execution order before any new build

### Workstream A — Make attendance truthful

1. Enforce one accepted check-in and one accepted check-out per Bangkok business date on the server. **Done locally; deployment pending.**
2. Return a clear current state when an employee attempts an invalid sequence.
3. Remove unused mobile demo widgets, add explicit Reload/Retry, Thai date formatting and readable accepted/pending/rejected status.
4. Add attendance correction and OT request records; only approved records are eligible for payroll.

### Workstream B — Make the Admin usable for daily operations

1. Replace the presentation dashboard with live data/state and a visible “ข้อมูลจริง/ข้อมูลตัวอย่าง” banner.
2. Make one `งานรออนุมัติ` queue for leave, missed punches, attendance corrections and OT.
3. Convert employee management into a profile workflow: identity, site/location policy, pay policy and audit timeline.

### Workstream C — Make financial output defensible

1. Add a period close/lock model before any payroll calculation.
2. Calculate only gross-pay preview from approved time, then add a manager review/approval audit.
3. Persist invoices, allocate immutable document numbers, retain PDF source data and track payment status.

### Release gate — only then build/install

- No active route may show demo data.
- Real Android test: login, required-location check-in/out, no-location check-in/out, leave submission and Admin approval.
- Admin UAT: employee create/edit/deactivate/reset password, approval queue and pay-rule save.
- Apps Script deployment + API readback must match the source being built.
- Payroll remains labelled “gross-pay preview” until Thai statutory and accounting rules are explicitly validated.

## Current phase

Workstream A is active. No new APK/EXE will be built until the above functional and UAT gates are met.
