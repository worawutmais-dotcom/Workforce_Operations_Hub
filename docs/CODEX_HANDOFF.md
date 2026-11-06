# BVN Package — Workforce Operations Hub · Codex Handoff

A complete engineering handoff so Codex (or any dev) can continue development.
Read this together with [`AI_COLLAB_BRIEF.md`](../AI_COLLAB_BRIEF.md) (shared changelog, source of truth) and `../CLAUDE.md` (collaboration rule).

---

## 1. What it is
Thai-first internal workforce system for **บริษัท พนมพร พาณิชย์ จำกัด** (BVN Package):
- **Employee mobile app** (Flutter/Android) — GPS check-in/out, leave, advances, password self-service.
- **Admin back-office** (single-file vanilla-JS HTML) — employees, approvals, payroll, invoices, sites, settings, audit.
- **Backend** = **Google Apps Script** (one `Code.gs`) over **Google Sheets** as the datastore.

> It is an **internal tool**, not a multi-tenant SaaS. Passwords are plaintext **by owner's explicit choice**.

## 2. Repo layout
```
apps_script/Code.gs          backend (one file, ~1330 lines) — the API + all logic
admin_console/index.html     admin web console (one file, ~1970 lines) — all UI + JS
admin_console/run.bat/.vbs   local launcher (serves folder on 127.0.0.1:8777)
employee_mobile/             Flutter app (lib/main.dart ~1170, lib/bvn_api.dart ~275)
docs/                        specs & handoffs (this file)
AI_COLLAB_BRIEF.md           shared changelog (update after each work item)
```

## 3. Backend (Apps Script + Sheets)

### Conventions (important)
- **Transport:** client POSTs `Content-Type: text/plain;charset=utf-8` (avoids CORS preflight). Apps Script `/exec` returns **302 → script.googleusercontent.com**; clients must follow as **GET** (browser `fetch` does this; Dart `http` needs manual redirect-follow, see `bvn_api.dart`).
- **Dispatch:** `doPost(e)` parses JSON body, switches on `payload.action`, returns `reply_(ok, message, data)` as JSON. Unknown action → `reply_(false,'Unsupported action')`. Default action is `attendance`.
- **Auth:** admin calls carry `adminToken` checked by `requireAdmin_` against Script Property `ADMIN_API_KEY` (constant-time). Mobile calls carry `mobileToken` → `authenticateMobile_` (HMAC via `MOBILE_TOKEN_PEPPER`, stored in `Mobile_Access`). `admin_console_login` validates a user/pass against `Admin_Users` and **returns the ADMIN_API_KEY** to the console.
- **Script Properties (owner-set, never in source/chat):** `ADMIN_API_KEY`, `MOBILE_TOKEN_PEPPER`.
- **Spreadsheet ID** is baked in `Code.gs` (`SPREADSHEET_ID = '1-deVDtN8sZQmDyXTH7cR2TtmXgmm4RHOkONRk-HFdT4'`).
- **Concurrency:** writes that must be atomic use `LockService.getScriptLock()`.
- **Caching:** `cacheGet_/cachePut_/cacheDel_` (CacheService). `employee_directory` → `dir_v1` (120s), `activeSites_` → `sites_v1` (120s); invalidated on employee/site writes. **Watch for stale cache when adding writers.**
- **Data access is by column index** (`r[0]`, `r[9]`, …) — fragile. Adding a column mid-row shifts everything; prefer **appending** new columns at the end and reading with length guards (see payroll lines).
- **Passwords:** `hashEmployeePassword_` returns the raw string (plaintext, internal mode).

### Sheets (tabs) & key columns
`SHEETS` map in `Code.gs` lines 7–11. Headers are row 1; data from row 2.
- **Employees** — id, name, role, department, siteId, status(active/inactive), locationRequired(true/false), passwordHash(plaintext). Column indices resolved by `employeeColumns_(header)`.
- **Attendance_Log** — [uuid, empId, siteId, eventType(check_in/out), timestamp, lat, lng, accuracy, distance, status(accepted/rejected/**voided**), tz, source, reviewStatus, createdAt]. Status `accepted` = counts; `voided` = soft-deleted (kept for audit).
- **Work_Sites** — [Site ID, Name, Latitude, Longitude, Radius(m), Active]. Multiple active sites supported; check-in matches the nearest within radius.
- **Payroll_Periods** — [payrollId, start, end, status(locked), lockedAt, lockedBy].
- **Payroll_Lines** (frozen snapshot) — [payrollId, empId, regMin, otMin, baseGross, otGross, grossPay, **advanceDeduction(7)**, **netPay(8)**, createdAt(9), **sso(10)**, **other(11)**]. Read with `row.length` guards.
- **Payroll_Rules** — [empId, basis(daily/hourly), rate, hours, otEnabled, otMultiplier, premiumDate, premiumMultiplier, updatedAt, updatedBy, **otherDeduction(10)**]. *(monthly basis + daysPerMonth are PENDING — §9.)*
- **Mobile_Access** — hashed device tokens (sessions). **Leave_Requests** — [id, empId, type, start, end, reason, status, submittedAt, reviewer, reviewedAt]. **Time_Requests** — [id, empId, type(overtime/attendance_correction), workDate, minutes, reason, status, submittedAt, reviewer, reviewedAt, note]. **Advances** — [id, empId, amount, reason, requestDate, status(pending/approved/paid/settled/rejected), reviewer, decidedAt, paidAt, createdAt, settledPayroll(10)]. **Invoices**, **Password_Requests**, **Admin_Users** [Username, Password, Display name, Active, Created at], **Audit_Log** [Timestamp, Actor, Action, Target, Detail], **Settings** [Key, Value], **Holidays** [Date, Name].

### Settings keys (`SETTINGS_DEFAULTS`)
`pay_frequency, pay_day_1, pay_day_2, workdays(0=Sun..6), sso_enabled, sso_rate(=5), sso_cap(=750), quota_sick/personal/vacation, shift_start(=09:00), shift_grace_min(=5), lunch_break_min(=60), ot_threshold_hours(=8), holiday_ot_enabled`.

### API actions (as deployed)
Employee (mobile, `mobileToken`): `employee_login, employee_directory, employee_profile, attendance, employee_timeline, employee_month, sites, leave_request, leave_calendar, time_request, employee_time_requests, employee_submit_advance, employee_advances, employee_change_password, employee_request_password_reset`.
Admin (`adminToken`, except `admin_console_login`): `admin_console_login, dashboard, admin_list_employees, admin_upsert_employee, admin_reset_employee_password, admin_list_admin_users, admin_upsert_admin_user, admin_delete_admin_user, admin_record_attendance, admin_void_attendance_day, admin_attendance_days, admin_list_sites, admin_save_site, admin_list_holidays, admin_save_holiday, admin_delete_holiday, admin_list_leave_requests, admin_review_leave, admin_leave_usage, admin_list_time_requests, admin_review_time_request, admin_add_overtime, admin_upsert_pay_rule, admin_list_pay_rules, admin_preview_payroll, admin_lock_payroll, admin_list_payrolls, admin_get_payroll, admin_owner_overview, admin_get_settings, admin_save_settings, admin_list_advances, admin_decide_advance, admin_mark_advance_paid, admin_create_invoice, admin_list_invoices, admin_update_invoice_status, admin_list_audit_log`.
Editor-only maintenance: `seedDemoData()`, `resetAllDataKeepAdmin()` (clears all data, keeps Admin_Users + Settings — IRREVERSIBLE), `initialize*Sheet()`.

### Payroll model (current)
`admin_preview_payroll(startDate,endDate)` → per-employee line from accepted complete attendance days + approved OT (`Time_Requests`), using `Payroll_Rules`. Net = gross − unsettled **paid** advances (capped at gross, oldest-first, whole advances) − SSO (min(gross×rate, cap)) − per-rule otherDeduction. `admin_lock_payroll` freezes the snapshot and marks recovered advances `settled`. `admin_owner_overview` reuses preview + adds settings/period/nextPayday/advance summaries/`incompleteDays` (forgot-checkout).

### Auto-OT on check-out
`recordAttendance_` on an accepted `check_out`, if the employee has a rule with OT enabled and worked beyond standard, calls `autoCreateOvertime_` → appends a **pending** overtime `Time_Request` for admin approval. *(PENDING: subtract lunch + holiday handling — §9.)*

## 4. Admin console (`admin_console/index.html`)
- Single file: `<style>` design system (CSS vars, dark mode via `data-theme`), then markup (login + app shell), then one big `<script>`.
- `api(action, fields)` posts to `state.endpoint` with `adminToken: state.token`. `DEFAULT_ENDPOINT` is the baked URL; a saved endpoint in `localStorage('bvn_endpoint')` overrides it (with an auto-heal that migrates known-stale URLs to default).
- Login = username/password → `admin_console_login` returns the token (advanced panel allows manual endpoint/token). Pages: `dashboard, owner, employees, approvals, payroll, advances, payrules, invoices, settings, audit` via `PAGES{}` + `render*()`.
- Reusable helpers: `attachRowMenu` (right-click context menu), `attachSort(table)` (sortable headers), client pagination (employees), `openModal/field/toast/withBtn`, print windows (`printInvoice/printPayslip/printMonthlySummary`).
- Owner page is tabbed (`💰 จ่ายเงินเดือน / 🕑 เวลา / 🏪 ร้าน & เบิกเงิน`), includes multi-site manager + leave calendar on approvals + leave-quota table.

## 5. Mobile app (`employee_mobile`)
- `bvn_api.dart` — `BvnApi` with manual 302-follow; `DeviceSessionStore` keeps id+token in Android Keystore.
- `main.dart` — login (name dropdown + password) → `EmployeeShell` with tabs: วันนี้ (check-in + `_CheckInMap` flutter_map), เวลา (timeline — **being redesigned to a calendar, §9**), ลางาน, คำขอ, บัญชี.
- Check-in requires GPS inside any active site; check-out anywhere. Blocks mocked GPS (`Position.isMocked`). Auto-OT notice on check-out.
- Deps: `geolocator, http, flutter_secure_storage, flutter_map, latlong2`.

## 6. Deploy & build
- **Backend deploy (keep URL stable):** Sheet → Extensions → Apps Script → paste `Code.gs` → Save → **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. **Never "New deployment"** (it churns the `/exec` URL and breaks the baked app/console default).
- **Diagnose a deployment:** POST `{"action":"sites","mobileToken":"x"}` → `Mobile authentication failed` = new code live; `Unsupported action` = old.
- **APK:** `flutter build apk --release` (universal, all ABIs). Release signing via `android/key.properties` + `android/app/bvn-release.jks` (both **gitignored** — keep safe; losing the keystore breaks future in-place updates). `sdk.dir` in `android/local.properties` must use forward slashes (`C:/AndroidSDK`).
- Endpoint baked in `bvn_api.dart` (default) + `admin_console/index.html` (`DEFAULT_ENDPOINT`). Update both + rebuild APK whenever the `/exec` URL changes.

## 7. Security & known limitations (candid)
- Plaintext passwords (employee+admin) in Sheets; `admin_console_login` hands out the API key.
- **Single shared `ADMIN_API_KEY`** → no real per-admin identity; `reviewer/lockedBy` are client-supplied (audit actor is self-reported).
- Sheets = no indexes; every call reads whole sheets → ~1–2s latency, 6-min/quota ceiling. Caching added for directory/sites only.
- Column-index coupling is brittle. Snapshot net is frozen at lock; preview recomputes.
- GPS/time are client-trusted (mock-location blocked, but spoofable in other ways).
- No automated tests on the console; manual QA only.

## 8. Current config (as of 2026-11-06)
- **Sheet ID:** `1-deVDtN8sZQmDyXTH7cR2TtmXgmm4RHOkONRk-HFdT4`
- **Endpoint (/exec):** `https://script.google.com/macros/s/AKfycbwgMFwJOTbq_0GPgVUDfJ8yJ7OtBnBff9HmlpdzMnY8BkRgdf19Bpiy-YKKI4tRSAM/exec`
- Default admin seed: `admin / bvnadmin` (change immediately).

## 9. In-progress feature — Time calendar + OT + holidays (SPEC to finish)

### Goal
Redesign the mobile **เวลา** tab as a **month calendar** (color-coded) + **one row per day** list; add **monthly/daily/hourly** pay basis with automatic OT rates, **lunch deduction**, **late** detection, and **holidays** with an admin OT-on-holiday switch.

### Status
- **DONE (backend, committed):** Settings keys (`shift_start, shift_grace_min, lunch_break_min, ot_threshold_hours, holiday_ot_enabled`) + validation; `Holidays` sheet + `admin_list/save/delete_holiday` + `holidayMap_`; `employee_month(year,month)` returns per-day `{date, dow, status, checkIn, checkOut, workedMinutes, otMinutes, late, holidayName, leaveType}` applying shift-start late, lunch-deducted 8h OT threshold, holidays, approved leaves. Status values: `normal, late, incomplete, leave, holiday, holiday_work, absent, off, future`.
- **PENDING:**
  1. **Pay basis `monthly`** in `Payroll_Rules` + a `daysPerMonth` column (default 30). `admin_upsert_pay_rule`/`admin_list_pay_rules` + the admin dialog (3-way basis selector + auto OT-rate preview).
  2. **OT hourly-rate** per basis: monthly → `rate ÷ daysPerMonth ÷ standardHours`; daily → `rate ÷ standardHours`; hourly → `rate`. OT pay = otHourly × multiplier. **Holiday OT multiplier** (default ×2) when `holiday_ot_enabled`.
  3. **autoCreateOvertime_**: subtract `lunch_break_min`; use `ot_threshold_hours`; if holiday & `holiday_ot_enabled` → all worked (minus lunch) is OT.
  4. **Payroll preview/lock**: compute base pay + OT from the new basis; monthly = fixed monthly salary (+ optional absence deduction, see open Q3) + OT.
  5. **Admin UI**: settings dialog fields for shift/lunch/OT-threshold/holiday-OT (holiday_ot switch) ✓ partly; **holidays manager** (list/add/delete) — suggest a panel on the Settings page or owner store tab.
  6. **Mobile**: replace the `เวลา` `_ListPage` with a `_MonthCalendar` widget calling `employee_month`; colors: green=normal, amber=late, red=incomplete/absent, blue=leave, grey=holiday/off, outline=today; tap a day → scroll to its row; below, one card/row per day with เข้า/ออก/รวม ชม./OT/status badge; month nav (prev/next). Mockups approved by owner (calendar + per-day rows).

### OT formulas (agreed)
- Worked (minutes) = last check_out − first check_in that day.
- Net = Worked − `lunch_break_min` (60).
- **Normal day OT** = max(0, Net − `ot_threshold_hours`×60) → pay = OT hours × otHourly × otMultiplier(1.5).
- **Holiday (switch ON)** = whole Net is OT → pay = Net hours × otHourly × holidayMultiplier(2.0).
- **Late** = first check_in > `shift_start` + `shift_grace_min`.

### Open decisions (owner to confirm — defaults in brackets)
1. Monthly OT divisor: **÷30 days** [Thai labor-law standard] vs ÷ actual workdays in month.
2. Holiday OT multiplier: **×2** [standard] fixed vs configurable per employee/global.
3. Monthly salary when absent: **deduct per day** (salary÷30 × absent days) vs pay full.

## 10. Roadmap (bigger, needs rewrite not patches)
Postgres/Supabase + per-user auth (hashed, RBAC) + real REST API; multi-tenant; SPA admin with build/tests/CI; mobile offline queue + push; self-serve onboarding (no "deploy" exposed to users); Thai statutory payroll (ภงด./SSO/payslips). See the review in the session history.

## 11. Collaboration rules (from CLAUDE.md)
Keep `AI_COLLAB_BRIEF.md` as the shared source of truth; read it before edits and append a changelog row after each completed item (scope/decision, files changed, validation, limitations, next open item). Inspect the working tree before overwriting another agent's changes.
