# BVN Package — Admin Codex

Admin Codex is an isolated, task-first web-admin pilot for BVN Package. It is
safe to refine without overwriting `admin_console/` or the Python Admin
baseline. It is **not** approved to replace either surface until deployment and
non-production UAT are complete.

## What it is for

- Daily operations: attendance review, manual Admin check-in/out, employees
  and approval decisions.
- Finance preparation: pay rules, preview-before-lock payroll, advances and
  invoices.
- Clear accountability: server-verified Admin session actor in audit entries.

The UI is a single static `index.html`; its source of truth remains
`apps_script/Code.gs` and the owner-selected Google Sheet.

## Visual language

- Light: clean white surfaces, neon-green identity/positive feedback, orange
  for priority actions and warnings.
- Dark: near-black surfaces with the same green/orange hierarchy.
- Printed payroll and invoice documents retain their document-specific company
  formatting; they are not recoloured merely to match the application shell.

## Run locally

Double-click `run.bat`, then open `http://127.0.0.1:18777/`. Sign in using the
Admin username and password created in `Admin_Users`.

The connection details panel contains only the Apps Script endpoint for a
changed deployment. **Admin Codex never accepts, displays, or asks an operator
to copy an API key.** After the latest backend is deployed, normal sign-in
returns a revocable eight-hour session; it is held only in `sessionStorage`.

### First Owner account

For a new Sheet only, set `INITIAL_ADMIN_USERNAME` and
`INITIAL_ADMIN_PASSWORD` (minimum eight characters) in Apps Script Properties,
then run `bootstrapInitialAdmin()` manually as the Sheet owner. It creates the
first Owner with a hash, removes the temporary properties, and refuses to run
again after any Admin exists. Never write the password into `Admin_Users`.

## Main workflows

| Menu | Main decision/action |
|---|---|
| วันนี้ | See operational exceptions and manually record attendance when authorised. |
| เวลาทำงาน | Inspect time, corrections and attendance history. |
| พนักงาน | Create an ID automatically, set location policy, reset a password once. |
| งานรออนุมัติ | Decide leave, OT, corrections and advance requests. |
| เงินเดือน | Select period → inspect exclusions/amounts → lock immutable snapshot. |
| ค่าจ้างและ OT | Set basis/rate/OT rules per employee. |
| ใบแจ้งหนี้ลูกค้า | Draft → Issued → Paid/Void with payment reference. |
| ตั้งค่าระบบ | Work schedule, leave settings, admins and endpoint. |

## Security boundary

- Password hashes, initial passwords after their one-time display, mobile
  tokens and master keys are never returned by a listing API or displayed in a
  table.
- A normal session can be revoked by Logout and expires after eight hours.
- Roles are Owner, Manager, Operations and Finance. Navigation follows the
  role, while Apps Script checks the role again before the action is performed.
  Changing or deleting an Admin account revokes that user's active sessions.
- Operations can work with employees, attendance, approvals and advances;
  Finance is limited to payroll/rates/invoices; holiday and system settings are
  Owner-only. A hidden menu is never the permission boundary.
- If an Admin changes their own role/password or deletes their own account,
  Codex signs that browser out deliberately rather than leaving a stale screen.
- Five failed Admin or employee sign-in attempts trigger a fifteen-minute
  generic lockout. Employee temporary passwords are UUID-derived (displayed
  once only), not predictable numeric PINs. Do not expose usernames,
  passwords or lockout diagnostic details to operators.
- The local Apps Script keeps a temporary master-key compatibility path for
  legacy clients/recovery. That path is deliberately unavailable in Codex UI.
- Google Sheets plus Apps Script is a temporary small-team architecture, not
  enterprise identity management. Supabase/Auth remains the future migration
  path for roles, MFA, device controls and stronger password hashing.

## Verification status

Local source checks pass:

```powershell
$node = 'C:\Users\M_S_I\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node apps_script\contract_smoke_test.js
```

This proves in-memory session/login/logout, Dashboard header handling and a
controlled hourly-pay/OT/SSO/advance payroll-preview-to-lock snapshot. It does
not prove deployment, the selected Sheet, real payroll figures, mobile GPS, or
a real user journey. Follow [RELEASE_HANDOFF.md](RELEASE_HANDOFF.md) and
[UAT_CHECKLIST.md](UAT_CHECKLIST.md) before packaging or replacing baseline.
