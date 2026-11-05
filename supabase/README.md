# BVN Package — Supabase backend

The Postgres backend that replaces Google Apps Script + Google Sheets. Design
rationale and cutover steps are in [`docs/BACKEND_MIGRATION_PLAN.md`](../docs/BACKEND_MIGRATION_PLAN.md).

```
supabase/
├── migrations/
│   ├── 0001_schema.sql   # tables, RLS (read-only for clients), immutability triggers
│   └── 0002_rpc.sql      # every business write/aggregate as a SECURITY DEFINER function
└── functions/
    └── admin-employee/   # Edge Function: create/disable employee + reset password (Auth Admin API)
```

## Auth model (decided)
- **Employees**: one Supabase Auth user each. Login id = `employee_code` mapped to a
  synthetic email `emp0001@bvn.local`; password via Supabase Auth (argon2). The app
  turns the code the user types into that email before calling `signInWithPassword`.
- **Admins**: real users listed in `app_admins`. `is_admin()` gates every admin RPC.
- **No shared admin key.** Audit stamps (`reviewed_by`, `locked_by`, `updated_by`) come
  from `current_actor()` — the signed-in user — not from a client-supplied name.
- **No public employee directory** (the old enumeration leak is gone).

## Who calls what
| Need | Mechanism | Who |
|---|---|---|
| check-in/out | `rpc('record_attendance', …)` | employee JWT |
| submit leave / OT | `rpc('submit_leave_request' / 'submit_time_request')` | employee JWT |
| read own timeline / requests | `select` under RLS | employee JWT |
| review leave / OT | `rpc('admin_review_leave' / 'admin_review_time_request')` | admin JWT |
| pay rules / preview / lock | `rpc('admin_upsert_pay_rule' / 'preview_payroll' / 'lock_payroll')` | admin JWT |
| invoices | `rpc('admin_create_invoice' / 'admin_update_invoice_status')` | admin JWT |
| dashboard | `rpc('admin_dashboard')` | admin JWT |
| create/disable employee, reset pw | Edge Function `admin-employee` | admin JWT |

## Deploy order
1. `supabase db push` (or run `migrations/0001_schema.sql` then `0002_rpc.sql` in the SQL editor).
2. Seed `work_sites`; create the first admin Auth user and insert its id into `app_admins`.
3. `supabase functions deploy admin-employee`.
4. Import data from the old Sheets (see migration plan §3), mapping `employee_code → auth uid`.
5. Repoint clients:
   - Admin console: rewrite its single `api()` helper to call `supabase.rpc(...)` / the Edge
     Function with the admin's JWT instead of POSTing `adminToken` to `/exec`.
   - Mobile (`bvn_api.dart`): use `supabase_flutter` for Auth + `rpc`.
6. Freeze the old Apps Script `/exec` (return HTTP 410); keep the Sheet read-only as archive.

## Review before running (known TODOs)
- **Validate the payroll math** in `preview_payroll` against a hand calculation on
  controlled data before trusting a lock — same rule as today. Add pgTAP tests.
- Decide the OT hourly base for `daily` rules (currently `base_rate / standard_hours`).
- `preview_payroll` raises on non-admins via a `1/0` guard inside the SQL CTE; if you
  prefer a cleaner error, wrap it in a plpgsql function that calls `_require_admin()` first.
- Statutory tax / SSO / net pay are still out of scope — gross only.
- Tighten `grant execute … to authenticated` if you later add non-admin-safe functions.
