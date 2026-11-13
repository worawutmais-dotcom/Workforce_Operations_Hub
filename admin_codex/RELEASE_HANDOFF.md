# BVN Package Admin Codex — Release Handoff

## Release boundary

`admin_codex/` is a separate pilot. Do **not** replace `admin_console/`, the
Python desktop program, the deployed Apps Script, or a production APK/EXE until
the UAT gates below are recorded as passed.

## What this release changes

- Task-first Admin navigation and compact payroll flow.
- White, neon-green and orange light theme; black, neon-green and orange dark theme.
- Header-aware Dashboard employee counting, so Dashboard and Employee directory
  use the same active-employee interpretation.
- Password hashes are not shown in API responses or tables. Legacy plaintext
  values migrate to HMAC hashes only after successful use.
- Normal Admin username/password login receives a revocable eight-hour session.
  The browser does not receive `ADMIN_API_KEY`; logout revokes the session.
- Five failed Admin or employee sign-in attempts are throttled for fifteen
  minutes using Apps Script cache. The response stays generic and does not
  disclose account existence or lock state; employee temporary passwords are
  UUID-derived and shown once only to the authenticated Admin.
- Admin roles are explicit: Owner, Manager, Operations and Finance. Server-side
  checks enforce permissions; hiding a menu is only a usability aid.
- Dashboard data is also role-scoped at the API: Operations cannot receive
  financial facts, and Finance cannot receive attendance/approval facts.

## Owner deploy procedure

1. Make a backup/copy of the production Google Sheet. Never run the reset
   helper in production.
2. Verify that `SPREADSHEET_ID` in `apps_script/Code.gs` is the owner-selected
   Sheet. Do not infer it from an older deployment URL.
3. Paste the reviewed `Code.gs` into that Sheet's Apps Script project, save,
   deploy a **new version**, and keep the same access policy intentionally.
4. Confirm Script Properties exist without exposing their values:
   `ADMIN_API_KEY` and `MOBILE_TOKEN_PEPPER`.
5. Create or verify at least one active Admin account. If `Admin_Users` is
   empty, set Script Properties `INITIAL_ADMIN_USERNAME`,
   `INITIAL_ADMIN_PASSWORD` (minimum eight characters), and optionally
   `INITIAL_ADMIN_DISPLAY_NAME`; then run `bootstrapInitialAdmin()` manually
   from the Apps Script editor as the Sheet owner. It writes an HMAC hash and
   removes all three temporary properties. It refuses to run when an Admin
   already exists. Do not put a password in a Sheet cell.
6. Open `admin_codex/run.bat`, confirm the endpoint, and sign in using that
   Admin account. The first normal sign-in creates `Admin_Sessions`.

`Payroll_Lines` is extended automatically on its next payroll operation to use
this order: `Created at`, `Advance deduction`, `Net pay`, `SSO`, `Other
deduction`. The initializer repairs only the clearly identifiable short-lived
pre-release row order (where the date was in column 10). Do not reorder the
first eight payroll columns manually. If they were manually changed, restore
them from the Sheet backup before running payroll.

## Mandatory non-production UAT

Use a dedicated test employee and test payroll period.

- [ ] Admin login works and Dashboard totals match the Employee page.
- [ ] Create non-owner test accounts and verify unavailable actions are hidden
      in Codex and rejected by the API.
- [ ] Change a test Admin role/password and confirm its current session is
      revoked, requiring a new login.
- [ ] Confirm the final active Owner cannot be downgraded, deactivated or
      deleted; create a second Owner before testing any such change.
- [ ] Enter an incorrect password five times for a non-production account;
      verify a correct password is temporarily rejected, then verify access
      returns after the test lock expires.
- [ ] Logout works; reusing the old browser session is rejected.
- [ ] Create employee → temporary password shown once → mobile login works.
- [ ] Confirm Operations Dashboard response does not contain invoice/payroll
      facts and Finance Dashboard response does not contain attendance/approval
      facts, including when inspected in browser network tools.
- [ ] Check-in, duplicate check-in rejection, check-out, GPS-required and
      no-location policies all behave as configured.
- [ ] Submit and decide leave / OT / correction; audit actor is the signed-in
      Admin, not a typed name.
- [ ] Payroll preview matches a hand calculation; incomplete time is explained.
- [ ] Lock exactly one test payroll period; snapshot cannot be re-locked.
- [ ] Invoice Draft → Issued → Paid requires a payment reference; illegal
      transitions are rejected.
- [ ] Verify light and dark modes at normal desktop and narrow browser widths.

## Local checks completed before deployment

Run these again after any change to `Code.gs` or `admin_codex/index.html`:

```powershell
$node = 'C:\Users\M_S_I\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node apps_script\contract_smoke_test.js
```

The smoke test is intentionally in-memory. It proves the session lifecycle,
header-aware Dashboard contract, and one controlled hourly/OT/SSO/advance
preview-to-lock snapshot. It does **not** prove the deployed Sheet, Apps Script
version, browser/network policy, payroll arithmetic on production data, or a
real mobile device.

## First post-deploy security probe

After the owner deploys the reviewed Apps Script, run
`apps_script/live_session_probe.js` once with a dedicated non-production Admin
account. It checks health, normal username/password sign-in, Dashboard access,
logout, and rejection of the revoked session. Supply the endpoint and UAT
credentials through environment variables; the script does not print secrets.

This is deliberately narrow: it must not create attendance, payroll, or
invoice records. It will create the normal temporary Admin session and audit
rows that a real sign-in/logout creates. A passing probe is a security
connectivity check, not a replacement for the functional UAT below.

## Do not release when

- deployment URL and Sheet ID are not proven to be the same environment;
- any test relies only on dashboard zeroes or an API health response;
- password, master key, token, or payment reference appears in a screenshot,
  Markdown, browser storage beyond the session, or a table;
- payroll rules/tax policy have not been approved by the business/accountant;
- a real Android device has not completed a live attendance test.

## Evidence to attach before packaging

- deployed URL/version and selected Sheet ID (not secrets);
- completed UAT checklist with results;
- screenshot of signed-in Codex Dashboard, mobile attendance state and payroll
  preview using test data only;
- signed APK/EXE version, SHA-256 and install/start smoke evidence.
