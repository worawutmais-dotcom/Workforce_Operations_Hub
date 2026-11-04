# Backend Migration Plan — Google Sheets → Postgres/Supabase

Goal: retire the Apps Script + Google Sheets backend that `apps_script/Code.gs`
runs on, and move to Postgres (Supabase) with real auth, RLS and a tested
write path. This fixes the three backend problems from the review: full-table
scans, HMAC-only passwords + public employee directory, and a single shared
admin key with no per-person audit.

> Status of what existed before: `docs/SUPABASE_SCHEMA.sql` was a partial
> 3-table draft; `tools/create_bvn_database.mjs` is **not** a migration tool
> (it generates an .xlsx template). The complete, contract-matching schema is
> now `docs/supabase_schema_full.sql`.

## 1. Decisions (the things to lock first)

| Topic | Decision | Why |
|---|---|---|
| Database | Supabase Postgres | RLS + Auth + Edge Functions in one place; the schema is already drafted |
| Employee auth | Supabase Auth user per employee; login id = `employee_code` mapped to an internal email (`emp0001@bvn.local`) | argon2 hashing, lockout, JWT sessions for free — replaces HMAC + the `Mobile_Access` token sheet |
| Admin auth | Real users listed in `app_admins`; `is_admin()` gate | kills the shared `ADMIN_API_KEY`; audit shows the actual person via `auth.uid()` |
| Directory | No public `employee_directory`; login by credentials only | closes the ID+name enumeration leak |
| Writes | Only through security-definer SQL functions / Edge Functions | clients never write business rows; distance + payroll stay server-authoritative |
| Immutability | Triggers block UPDATE/DELETE on locked payroll; attendance has no write policy | audit trail cannot be rewritten |

Open question for the owner: are employees OK logging in with a code+password
(mapped to an internal email behind the scenes), or do they have real emails/phones?
That choice only changes the Auth signup step, not the schema.

## 2. Action → write-path mapping (replaces each Code.gs action)

| Code.gs action | New home | Notes |
|---|---|---|
| `attendance` | `record_attendance()` SQL fn | recompute `distance_m` from `work_sites`; enforce dup check-in/out per Bangkok day |
| `employee_login` / token issue | Supabase Auth | JWT replaces `Mobile_Access`; `revokeEmployeeTokens_` = sign out sessions |
| `submit_leave_request` / `submit_time_request` | SQL fns | insert pending rows |
| `employee_timeline` / `leave_calendar` / `employee_time_requests` | direct `select` under RLS | own rows only |
| `admin_upsert_employee` | **Edge Function** | needs Auth Admin API to create/disable the user + return a one-time password |
| `admin_reset_employee_password` | **Edge Function** | Auth Admin API issues temp password |
| `admin_review_leave` / `admin_review_time_request` | SQL fns (admin-guarded) | stamp reviewer = looked-up admin name |
| `admin_upsert_pay_rule` | SQL fn | upsert one rule per employee |
| `admin_preview_payroll` | SQL fn (read-only) | pure calc, returns rows + warnings |
| `admin_lock_payroll` | SQL fn | insert period + lines once; immutable afterwards |
| `admin_list_*` / `admin_get_payroll` / `admin_dashboard` | `select` / views under `is_admin()` | indexed, no full scans |
| `admin_create_invoice` / `admin_update_invoice_status` | SQL fns | server computes VAT + enforces the status state machine |

The Haversine distance and the payroll math each become **one** function with
unit tests — not the inline one-liners `Code.gs` buried them in.

## 3. Cutover (data is tiny, so keep it simple — no dual-write)

1. **Provision** — run `docs/supabase_schema_full.sql`; add Edge Functions + SQL fns.
2. **Seed `work_sites`** and insert `app_admins` for the real admin(s).
3. **Export** each Sheet tab to CSV (owner does this from the live Sheet).
4. **Import** — create Auth users for active employees, map `employee_code → auth uid`,
   then COPY attendance / leave / time / invoices / locked payroll with that mapping.
   Historical attendance keeps its original timestamps.
5. **Verify** — row counts match; spot-check one employee's timeline, one locked
   payroll total, one invoice status; `is_admin()` works; RLS blocks cross-employee reads.
6. **Repoint clients** —
   - Admin console: swap `api()` to call Edge Function / RPC URLs with the admin's
     JWT instead of POSTing `adminToken` to `/exec`. (The page's structure stays; only
     the transport layer changes.)
   - Mobile (`bvn_api.dart`): use the Supabase Dart client for Auth + RPC.
7. **Freeze the old backend** — make Apps Script `/exec` return HTTP 410 Gone so no
   stale client keeps writing to the Sheet. Keep the Sheet read-only as an archive.

## 4. What each client change looks like (small)
- The admin console already isolates all I/O in one `api()` helper — migration is
  rewriting that single function plus the login step; the pages don't change.
- Mobile swaps `http` POSTs for `supabase_flutter`; screens stay.

## 5. Risks / do-not
- Don't open a browser direct-INSERT RLS policy on attendance — client distance is
  not evidence. Writes go through the function that recomputes it.
- Don't migrate payroll numbers by re-running preview on imported data and calling it
  "the same" — import the **locked snapshots** as-is; they are the record.
- Don't delete the Google Sheet until the owner signs off on the verified import.
- Statutory tax/SSO is still out of scope — gross only, same as today.

## 6. Suggested order of work
1. Owner confirms the employee-auth choice (§1 open question).
2. Finalise schema + write the SQL functions and the 2 Edge Functions **with tests**.
3. Stand up a staging Supabase, import a copy, run the verification in §3.5.
4. Repoint a test build of the admin console + mobile at staging; UAT.
5. Production cutover + freeze `/exec`.
