# BVN Package — Engineering Handoff for Claude

## 1. Mission and operating rules

Build a Thai-first internal workforce system for **BVN Package**:

- Employee Android app: login, attendance, leave, OT/time correction, history and profile.
- Windows Python Admin: employee lifecycle, approval queue, payroll preview/lock, invoices and dashboard.
- Google Apps Script API plus Google Sheets: temporary backend and audit datastore.

This is an internal operational tool, **not** a legally complete payroll/accounting system. Do not describe payroll, tax, social security, invoicing, or attendance results as legally final unless the relevant legal/accounting rules and evidence are implemented.

### Non-negotiable product decisions

1. The Admin/back-office UI is the Windows Python application only. Google Sheets is a datastore/audit trail, not an admin screen.
2. Apps Script validates business rules. The mobile client is never authoritative for attendance or payment logic.
3. Admin creates employees. The system assigns the employee ID automatically. The employee selects an active name and signs in with an Admin-issued temporary password.
4. Passwords must be hashed server-side; display a temporary password only at create/reset time. Never store, log, print, or export plaintext passwords.
5. Deactivation must preserve attendance, payroll and audit history. Never delete the employee row as the normal flow.
6. Do not build or distribute a new APK/EXE until source checks and real UAT are complete.

## 2. Current environment

| Item | Current value |
|---|---|
| Project root | `D:\Cowork\Workforce_Operations_Hub` |
| Google Sheet ID in local `Code.gs` | `IDKzV-19nTgG7rLB6Cbg29ml9cVECWOisFTEoZEWQEU` |
| Deployed Apps Script endpoint | `https://script.google.com/macros/s/AKfycbwWCdTJkadi93Pst2_uBSRkU8uYmGODqoaV0kuy6HtAnO5l31nW1jmHsKEkX8TIYyqp/exec` |
| Work site | BVN Package, latitude `13.762962071350593`, longitude `100.5582875856417` |
| Attendance policy default | 150 m radius, GPS accuracy <= 100 m |
| Desktop release currently present | `admin_desktop/dist/v0.3.0/BVN_Package_Admin_v0_3_0.exe` |
| Android artifact currently present | `employee_mobile/build/app/outputs/flutter-apk/app-debug.apk` (debug/arm64 only; not final) |

The deployed endpoint was verified on 2026-11-04:

- `GET /exec` returned `{ "ok": true, "message": "BVN Package Operations API is online" }`.
- `employee_directory` returned active employees.
- Invalid `employee_login` returned the expected rejection.
- Authenticated `admin_list_employees` returned HTTP 200 and `ok=true`.

This does **not** prove a complete real-device attendance, leave, payroll or invoice workflow.

## 3. Source map

```text
Workforce_Operations_Hub/
├── apps_script/
│   ├── Code.gs                 # API and Sheet schema/contracts
│   └── DEPLOYMENT.md           # Google Apps Script deployment notes
├── admin_desktop/
│   ├── app.py                  # Windows Admin application
│   └── dist/v0.3.0/            # current packaged Admin + endpoint config
├── employee_mobile/
│   ├── lib/main.dart           # Flutter app shell and screens
│   ├── lib/bvn_api.dart        # Apps Script client
│   ├── lib/time_request_tab.dart
│   └── test/widget_test.dart
├── SYSTEM_DESIGN_PLAN.md       # architecture / boundaries
├── IMPLEMENTATION_PLAN.md      # release gates / phased plan
├── ADMIN_GUI_REDESIGN.md       # Admin UX principles
├── MOBILE_APP_REDESIGN.md      # employee app UX principles
└── AI_COLLAB_BRIEF.md          # authoritative ongoing changelog
```

Read `AI_COLLAB_BRIEF.md` before any change. After every completed work item, append one changelog row containing scope/decision, files changed, validation, limitations and next item.

## 4. API and data contracts

### Security

Required Apps Script properties (set in Apps Script only):

- `ADMIN_API_KEY`
- `MOBILE_TOKEN_PEPPER`

The Windows app reads `BVN_ADMIN_TOKEN` from the Windows user environment. Never put these values in source, markdown, APK assets, Google Sheet cells, command output, screenshots, or chat.

### Key Apps Script actions

| Area | Actions / behavior |
|---|---|
| Public mobile activation | `employee_directory`, `employee_login` |
| Admin employee lifecycle | `admin_list_employees`, `admin_upsert_employee`, `admin_reset_employee_password` |
| Attendance | authenticated employee attendance write; server enforces location policy and rejects duplicate check-in/out / check-out before check-in |
| Leave | submit/list employee leave; Admin list/review |
| OT / correction | employee submit/list time request; Admin list/review |
| Payroll | Admin gross-pay preview, one-way payroll period lock, locked snapshot retrieval/export |
| Invoice | Admin list/create/update status; server calculates VAT and enforces `Draft -> Issued/Void`, `Issued -> Paid/Void`; Paid requires payment reference |
| Dashboard | restricted aggregate read; no fabricated demo values |

### Sheet tabs created or migrated by initializers

Run these manually in Apps Script as the Sheet owner when using a new Sheet or migrating schema:

1. `initializeEmployeesSheet`
2. `initializeMobileAccessSheet`
3. `initializeLeaveRequestsSheet`
4. `initializeTimeRequestsSheet`
5. `initializePayrollRulesSheet`
6. `initializePayrollSheets`
7. `initializeInvoicesSheet`

The initializers should be idempotent. Preserve immutable event/audit data. Do not turn an approval into an edit of raw attendance history.

## 5. Implemented features versus proof level

### Implemented in source

- Admin-created employee IDs, temporary password issue/reset, location-required policy, right-click edit/deactivate.
- Mobile name selection/password login, secure mobile session, profile, server-backed today timeline, GPS attendance, history, leave, and OT/time correction screens.
- Unified Admin approval queue for leave, OT and attendance corrections.
- Rate settings: hourly/daily pay basis, standard hours, OT enabled/multiplier, date premium multiplier.
- Payroll gross preview and locked immutable snapshots; CSV export of locked snapshots only.
- Invoice draft creation, VAT computation, issued/paid/void status controls and payment reference requirement.
- Live-or-not-connected dashboard (demo figures removed).

### Verified recently

- Apps Script source parses.
- Python source compiles.
- Flutter widget tests previously passed; Flutter analysis had informational style/deprecation findings only.
- New deployed endpoint health/public directory/auth-rejection/Admin authenticated list work.
- Admin v0.3.0 process can start.

### Not yet proven / do not claim complete

- Admin GUI click-through visual UAT.
- Real Android login and Android GPS check-in/check-out against the current deployment.
- End-to-end leave, OT, correction approval notifications/status refresh.
- Payroll preview/lock against controlled real records.
- Invoice creation/payment status against the live Sheet.
- Payslips, Thai statutory deductions/tax/SSO, leave-pay policy, holiday calendar, partial payments, receipt PDF, customer delivery, bank reconciliation.
- Release signing, Android anti-spoofing/tamper resistance, offline retry/conflict policy, performance/load/security test.

## 6. Required development order

Do these in order. Keep each change narrow, tested and documented.

### Phase A — UAT foundation (highest priority)

1. Use a **new non-production employee** such as `UAT Test`; do not reset or alter an existing employee without the owner’s explicit selection.
2. In Admin, create the employee and record the generated ID and one-time password outside source control.
3. On an arm64 Android phone, select the employee, sign in, open Profile, and verify site/location policy.
4. Test check-in within radius; test duplicate check-in rejection; test check-out; test no-location policy with a separately configured UAT employee.
5. Verify `Attendance_Log` rows and server timeline agree.
6. Submit leave and OT/correction; approve and reject separately in Admin; verify employee sees final status.

### Phase B — finance controls (highest priority after Phase A)

1. Create a controlled date range with known complete attendance pairs and one approved OT request.
2. Save hourly and daily pay rules for test employees.
3. Compare payroll preview math to hand calculation. Do not lock if any discrepancy exists.
4. Lock once only after explicit confirmation; verify the saved snapshot is immutable and CSV export equals it.
5. Create a test invoice, move it Draft -> Issued -> Paid with a payment reference, then verify invalid status jumps are rejected.

### Phase C — reliability and quality

1. Add focused automated tests for Apps Script pure helpers, Python API request/result parsing, and Flutter authenticated views/error/retry states.
2. Make server/API errors actionable Thai text; never silently fall back to demo/local data.
3. Add explicit non-production UAT checklist/results artifact.
4. Remove unused legacy mobile widgets after validating the active path.
5. Only then run release builds: signed APK and versioned EXE. Capture hashes and install/start evidence.

## 7. Engineering guardrails

- Do not replace the deployed endpoint with an old endpoint. Current endpoint appears in `employee_mobile/lib/bvn_api.dart` and `admin_desktop/dist/v0.3.0/admin_config.json`.
- Any code change to Apps Script requires a new deployment version. Property-only changes do not.
- Google Sheets are temporary. Keep a clear repository/data-access boundary so migration to PostgreSQL/Supabase with RLS/audit trails remains possible.
- Payroll currently returns gross calculations only. Do not add statutory rules by assumption; obtain confirmed Thai payroll policy/accounting requirements first.
- Use ISO `YYYY-MM-DD` for API date contracts and Bangkok business date for attendance rules.
- Do not delete Sheet rows that have operational history.
- Do not log GPS coordinates, tokens, passwords, full payment references or employee personal data unnecessarily.
- Preserve Thai-first UI language, but retain standard technical terms where clearer (for example `Riser`, `OT`, `KPI`).

## 8. Recommended validation commands

Run from the project root. Do not package artifacts until checks pass and Phase A UAT is documented.

```powershell
# Python Admin source
py -m py_compile .\admin_desktop\app.py

# Apps Script syntax only (not deployment proof)
node -e "new Function(require('fs').readFileSync(process.argv[1], 'utf8')); console.log('PASS')" .\apps_script\Code.gs

# Flutter (SDK expected at C:\flutter\bin\flutter.bat)
C:\flutter\bin\flutter.bat analyze
C:\flutter\bin\flutter.bat test --no-test-assets
```

For the deployed endpoint, health and deliberately invalid-login checks are safe smoke tests. Do not put a valid Admin token into a source file or test log.

## 9. Definition of ready to package

Do not build a final APK/EXE until all are true:

- Latest `Code.gs` is deployed and required tabs/schema are initialized.
- A separate UAT employee completes login, profile, check-in/out, leave and OT/correction flows.
- Admin approval decisions appear in the employee app.
- Controlled payroll preview matches a hand calculation; a lock snapshot/export is verified.
- Controlled invoice status transitions and payment-reference rule are verified.
- Automated source checks pass without errors.
- Known limitations are documented and accepted by the owner.

## 10. Handoff protocol

1. Read this file, `AI_COLLAB_BRIEF.md`, `SYSTEM_DESIGN_PLAN.md` and `IMPLEMENTATION_PLAN.md`.
2. Inspect the working tree before editing; it may contain user-owned changes.
3. Make one bounded change at a time.
4. Validate in proportion to risk.
5. Update `AI_COLLAB_BRIEF.md` with evidence and limitations.
6. Report exactly what is verified versus only implemented.
