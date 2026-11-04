# BVN Package — Admin Console (web)

Single-file web back-office that **replaces the Tkinter `admin_desktop/app.py` and the `dist/` demo PWA**.
No build step, no dependencies — one `index.html` that talks to the deployed Apps Script Operations API
(`apps_script/Code.gs`).

## Why this replaces Tkinter
- One surface instead of three (Tkinter admin + Flutter + demo PWA).
- Cross-platform, nothing to package or sign. Host it anywhere static, or open the file directly.
- Uses every `admin_*` action the backend already exposes — nothing new was needed server-side.

## Run
Open `admin_console/index.html` in a browser (or host the folder on any static server / GitHub Pages / the
same host as the Apps Script web app). At the login screen enter:
- **Apps Script Endpoint** — the deployed `/exec` URL (prefilled with the current one).
- **Admin Token** — the `ADMIN_API_KEY` script property value.
- **ชื่อผู้อนุมัติ** — recorded as `reviewer` / `lockedBy` / `updatedBy` so the audit trail shows a real person, not just "Admin".

The token is held in `sessionStorage` (this tab only) and is never written to disk. The endpoint and
reviewer name are remembered in `localStorage` for convenience; the token is not.

## Features (all wired to the live API)
| Page | Actions |
|---|---|
| ภาพรวม | `dashboard` — present/total, pending approvals, exceptions, overdue invoices, latest payroll |
| พนักงาน | `admin_list_employees`, `admin_upsert_employee`, `admin_reset_employee_password` (temp password shown once), deactivate |
| คิวอนุมัติ | `admin_list_leave_requests` + `admin_review_leave`, `admin_list_time_requests` + `admin_review_time_request` |
| เงินเดือน | `admin_preview_payroll`, `admin_lock_payroll`, `admin_list_payrolls`, `admin_get_payroll`, CSV export (preview + locked snapshot) |
| เรตค่าจ้าง | `admin_upsert_pay_rule` |
| ใบแจ้งหนี้ | `admin_list_invoices`, `admin_create_invoice`, `admin_update_invoice_status` (issue / pay + reference / void) |

## Implementation notes
- POSTs use `Content-Type: text/plain;charset=utf-8` to avoid a CORS preflight; the backend `parsePayload_`
  parses the body as JSON regardless.
- Pure client-side; no secrets baked into source.
- Verified: login screen renders with no console errors. Data pages need a live admin token + the deployed
  endpoint — not yet clicked through against real data (owner UAT required).

## Honest limitations
- Admin auth is still a single shared `ADMIN_API_KEY`. The reviewer name is self-declared, not authenticated.
  Real per-admin identity needs the planned Postgres/Supabase + Auth migration.
- This is a UI over the current Google-Sheets backend. It does **not** fix the backend scaling/security
  issues (full-table scans, HMAC-only password hashing, public employee directory). Those are separate work
  items in the rebuild plan.

## Next (rebuild plan, in order)
1. **Repo hygiene** — stop tracking build/SDK junk, commit the real source.
2. Delete `admin_desktop/` (Tkinter) and `dist/` (demo PWA) once this console passes owner UAT.
3. Migrate backend Sheets → Postgres/Supabase (RLS + real Auth + argon2 passwords); point this console at it.
4. Extract payroll math into tested pure functions.
