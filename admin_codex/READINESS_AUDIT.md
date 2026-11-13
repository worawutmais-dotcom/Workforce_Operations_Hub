# BVN Package Admin Codex — Readiness Audit

**Status: source-ready for owner deployment and non-production UAT. Not ready
for production release, APK/EXE packaging, or replacement of the baseline.**

This document separates verified local evidence from assumptions. A green local
check is not proof that the deployed Apps Script, selected Google Sheet, mobile
device, payroll figures, or browser policy behaves the same way.

| Release concern | Local evidence | Status | Required before release |
|---|---|---|---|
| Baseline protected | `admin_codex/` is a separate pilot; `admin_console/` remains the baseline. | Ready locally | Browser UAT then explicit owner sign-off before replacement. |
| Task-first Admin UX | Thai role-aware navigation, compact dashboard and payroll guidance are implemented in `admin_codex/index.html`. | Ready locally | Validate actual Admin flows on desktop and narrow widths. |
| Information density | Shell typography, side navigation, cards, tables, panels and dialogs use the compact scale; printed financial documents retain readable document sizing. | Ready locally | Confirm operators can scan tables and complete forms comfortably at normal desktop zoom. |
| Light/dark visual system | White/neon-green/orange light and black/neon-green/orange dark source plus localhost visual smoke. | Ready locally | UAT Dashboard, Employees, Payroll and Settings in both themes. |
| Keyboard operation | Skip link, page-focus handoff, accessible dialog focus management and live status announcements are in the Codex UI source. | Ready locally | Keyboard-only UAT for navigation, a create/edit dialog, a confirmation and an error state. |
| Admin credentials | Passwords are not returned in lists; legacy password migration and HMAC-backed sessions are contract-tested. | Ready locally | Deploy and sign in using a non-production Admin. Confirm no owner key is returned. |
| Employee mobile credentials | Employee login uses hashed passwords, revokes an old device token on successful login, and now applies the same generic five-failure / fifteen-minute throttle as Admin login. | Ready locally | Test one non-production employee with a wrong-password lockout, expiry recovery and a successful device login. |
| First Owner bootstrap | Editor-only `bootstrapInitialAdmin()` creates the first Owner from temporary Script Properties, HMAC-hashes the password and deletes the properties; it refuses a second bootstrap. | Ready locally | Run it only in the selected non-production Sheet and verify a normal username/password sign-in. |
| Employee directory privacy | Admin list/save responses expose employee operational fields (including department) but never `passwordHash`; this is contract-tested. | Ready locally | Inspect the deployed Admin response with non-production data and confirm no password hash appears in browser network tools. |
| Session safety | Logout revocation, eight-hour sessions, self-role-change logout and five-failure throttle are covered by the in-memory contract test. | Ready locally | Exercise on deployed Apps Script, including throttle expiry recovery. |
| Audit attribution | Audit writers accept identity only from the verified Admin session; browser `reviewer`, `updatedBy` and `lockedBy` values cannot supply a fallback actor. | Ready locally | Inspect audit rows after non-production employee, payroll and invoice actions from two distinct Admin accounts. |
| Audit identity | Mutating actions obtain the actor from the authenticated Admin session; an editable browser `reviewer` value cannot replace it. Legacy master-key recovery records the fixed actor `System owner`. | Ready locally | Confirm audit rows from a non-production Admin action show the signed-in account, not a typed/replayed browser value. |
| Roles and access | Owner/Manager/Operations/Finance checks, session revocation after account change, and final-Owner protection are contract-tested. | Ready locally | Create two non-production Owners and test UI plus API denial for each role. |
| Server-side role boundary | Finance is denied employee/approval operations even if it calls the API directly; Operations is denied payroll-impacting holiday configuration. | Ready locally | Verify hidden-menu actions are rejected from a deployed non-production endpoint. |
| Dashboard data boundary | The API emits operations metrics only to Owner/Manager/Operations and financial metrics only to Owner/Manager/Finance. Codex no longer requests restricted dashboard detail or silently shows denied/failed data as zero. | Ready locally | Sign in with non-production Finance and Operations accounts; inspect both UI and API response bodies for data that must be absent. |
| Dashboard consistency | Active-employee count reads columns by header, not fixed position. | Ready locally | Compare Dashboard and Employee page against the selected Sheet. |
| Attendance | Manual Admin attendance is wired as an audited exception path; employee GPS/no-location policies remain backend-controlled. | Needs UAT | Test check-in, duplicate rejection, check-out, GPS-required, no-location and audit readback. |
| Payroll | Contract smoke covers a controlled hourly regular-pay + approved OT + SSO + other deduction + advance preview-to-lock snapshot. `Payroll_Lines` has a canonical Created-at-first deduction schema and repairs only the identifiable pre-release malformed row shape. | Ready locally | Back up the selected Sheet, hand-calculate a controlled period, confirm the line headers/order, then test one irreversible lock. |
| Advance recovery | Preview and lock use the same amount remaining after SSO/other deductions; only whole advances settle in strict oldest-first order. | Ready locally | UAT an employee with multiple paid advances plus SSO/other deductions; compare preview, lock snapshot and remaining advances. |
| Payroll locking | Preview, duplicate-period check and snapshot write run inside a shared script lock. Marking an approved advance as paid uses the same lock. | Ready locally | Simulate two Admins attempting the same lock/payment in non-production and verify one succeeds with a single immutable result. |
| Invoices | Draft/Issued/Paid workflow is protected by a shared lock; creation and transitions write verified-session audit entries. Printed invoice date now uses its persisted creation date, not the later print date. Contract smoke covers the dated Draft → Issued → Paid path, missing-payment-reference rejection and stale second-payment rejection. | Ready locally | Verify allowed transitions, VAT, payment reference, printed dates and audit data with test records. |
| Mobile app | Flutter static analysis and the current employee-login widget test pass locally. | Needs separate UAT | Test directory/login, employee identity, GPS permissions, attendance, leave and status on a real device. |
| Deployment environment | Source contains a Sheet ID, but local source and live deployment have not been proven to point to the same selected Sheet/version. | Blocked by owner evidence | Confirm Sheet URL/ID, Apps Script version/deployment URL and access policy together. |

## Required execution order

1. Owner backs up the selected Google Sheet and confirms it is the intended
   non-production environment.
2. Owner deploys the reviewed `apps_script/Code.gs` as a new Apps Script
   version and confirms the matching deployment URL.
3. Use a dedicated non-production Admin to run `apps_script/live_session_probe.js`.
   The probe creates only normal session/audit rows and must pass before UI UAT.
4. Complete `UAT_CHECKLIST.md`, including role, attendance, payroll and invoice
   scenarios. Do not lock a real payroll period.
5. Record known defects, obtain owner sign-off, then decide whether to package
   an APK/EXE. Packaging is intentionally last.

## Commands already verified locally

```powershell
$node = 'C:\Users\M_S_I\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node apps_script\contract_smoke_test.js
& $node --check apps_script\live_session_probe.js
& $node -e "new Function(require('fs').readFileSync('apps_script/Code.gs','utf8')); console.log('APPS_SCRIPT_SYNTAX=PASS')"
```

Expected local outcomes are `APPS_SCRIPT_CONTRACT_SMOKE=PASS` and no Node syntax
error. These commands do not deploy anything or read/write the selected Google
Sheet.
