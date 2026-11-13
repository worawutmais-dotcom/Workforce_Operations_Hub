# BVN Package — Claude Continuation Brief (2026-11-06)

## Current repository reality

- Project root: `D:\Cowork\Workforce_Operations_Hub`
- Current committed HEAD: `be0f74f` — Thai public-holiday import and current console endpoint.
- The project is usable as a source base, but it is **not ready to build or release**.
- Do not discard existing uncommitted work. It belongs to the current working state, not to a disposable experiment.
- `admin_codex/` is an isolated copy of `admin_console/` created for the next UX
  version. Preserve `admin_console/` as the current baseline; do not merge or
  deploy `admin_codex/` until its browser UAT is complete.
- The Codex employee edit form no longer displays a stored password/hash. An
  empty password preserves the current hash; the corresponding Apps Script
  upsert contract was fixed so it does not hash an existing hash again.
- `admin_codex/ADMIN_CODEX_UX.md` is the current UX standard. The first
  implementation pass covers task-language navigation, Today hero/priority
  actions, professional login copy and no password reveal in Codex tables.
- Admin and employee password storage is now legacy-migration compatible:
  successful login or employee edit converts plaintext values to `h1:` HMAC
  hashes. Admin lists no longer return password values. Deployment must be
  coordinated because existing cloud code remains active until redeployed.

## Uncommitted work that must be preserved and reviewed

| Area | Files | Intent | Review requirement |
|---|---|---|---|
| Shift configuration | `apps_script/Code.gs`, `admin_console/index.html` | Adds shift end-time and reminder-minute settings; returns them in mobile profile. | Verify settings migration is backward compatible and uses Bangkok business time. |
| Android notification | `employee_mobile/lib/notif.dart`, `employee_mobile/lib/main.dart`, `pubspec.*`, Android manifest | Adds local pre-shift and check-out reminders. | Test notification permission, exact/inexact scheduling behaviour, timezone, logout/session changes, and duplicate scheduling. |
| Mobile UI | `employee_mobile/lib/main.dart` | Refines Today and leave list experience. | Keep server state authoritative; no local mock fallback. |

## Validation completed in this session

- Apps Script source syntax parses successfully with Node.
- Flutter dependencies were restored with `flutter pub get` after the local Pub cache was found incomplete.
- `flutter analyze --no-pub` previously failed only because packages were absent.
- After dependency restore, `flutter analyze` completed with **No issues found**.
- No APK or EXE build was run.
- Dashboard now has an Admin-only manual attendance entry point. It requires an
  active employee selection and a separate confirmation for check-in/check-out;
  it calls the existing `admin_record_attendance` contract. The Apps Script
  records source `admin_manual`, applies Bangkok-date duplicate/order guards,
  and appends an audit event. No attendance row was written during this change.
- Dashboard also now has a monthly per-employee attendance board. It obtains
  accepted attendance from `admin_attendance_days`; selecting an active employee
  opens a calendar with complete, incomplete and no-record states. The payslip
  control is enabled only when the owner-overview payroll preview contains that
  employee; it calls the existing `printPayslip` output and does not invent one.

## Critical decisions that need explicit owner approval

### 1. Admin platform conflict

Earlier product direction was **Windows Python Admin only**. Current source replaces it with `admin_console/index.html` (web browser Admin).

Do not silently delete either approach. Owner must choose one:

- **A. Web Admin**: keep `admin_console` and formally retire Python Admin only after owner UAT.
- **B. Python Admin**: treat web console as a prototype and port approved workflows/icons back to Python.

Until this is decided, do not claim the platform architecture is final.

### 2. Endpoint and datastore alignment

The current source has independent identifiers that must be reconciled before any deployment:

| Location | Current value / state |
|---|---|
| Mobile + Admin Console default endpoint | `https://script.google.com/macros/s/AKfycbzIlBl0KxAI2ibRDiODZDu-m4WYYUHloSvGkm37rMAsc_be0jUikQP0ytPRho-62wN2/exec` |
| Local `apps_script/Code.gs` Sheet ID | `1-deVDtN8sZQmDyXTH7cR2TtmXgmm4RHOkONRk-HFdT4` |
| Earlier user-supplied Sheet ID | `IDKzV-19nTgG7rLB6Cbg29ml9cVECWOisFTEoZEWQEU` |

Both known deployed endpoints answered health and public-directory requests, but that does **not** prove they use the same Sheet/version. Do not change a Sheet ID or endpoint by guesswork. First obtain the owner-selected production Sheet URL and Apps Script deployment URL, then update source and deploy as one coordinated release.

## UI/UX audit — Admin Console

### What is good

- Strong visual foundation: Thai-capable typography, responsive sidebar, card hierarchy, dark mode, role-relevant pages and a consistent blue/navy palette.
- Task coverage is substantial: employees, approvals, payroll, advances, invoices, settings and audit are represented.
- The recent sidebar improvement uses one inline SVG icon language and groups pages into Operations, Finance/Documents and System.

### What remains weak

1. **Information architecture is still dense.** Ten destinations are visible at once; grouping is better, but the user still needs to understand payroll, rates, advances, owner analytics and invoices before performing routine work.
2. **Login is too technical.** Endpoint and raw token fields create a developer-tool impression. Hide endpoint override under Advanced/Support and use named admin login as the standard path.
3. **No clear data-health state.** Every page needs last sync time, data-source state, retry affordance and an explicit empty state. Never use silent zeroes for a failed API request.
4. **Destructive or irreversible actions need stronger guardrails.** Payroll lock, void attendance, paid invoice and advance payment must display impact, actor and confirmation text before API submission.
5. **Too much owner functionality is mixed into operations.** Business/owner controls should be a protected mode/tab and not compete with the daily approval queue.
6. **A shared admin API key is not user identity.** The reviewer field is self-declared. Treat audit actor names as weak attribution until real per-user authentication exists.
7. **Documentation is inconsistent.** README claims plaintext passwords while the current `Code.gs` login path hashes passwords. Align documents with the actual implementation; do not weaken the hash flow.

### Visual system rules

- Use one icon system only: inline outline SVG, `18px`, `stroke: currentColor`, consistent rounded line caps.
- Keep one primary action per page. Secondary/destructive actions use outline/danger styles and confirmation.
- Use colour only as a supporting status signal; every state must have text labels.
- Cards show one decision or metric only. Do not use decorative KPI cards when data is unavailable.
- Use Thai labels first, with technical English in a smaller subtitle only where it improves operational clarity.

## Do not do these things

- Do not build/distribute a new APK or EXE until the UAT gates below are passed.
- Do not store or reveal plaintext employee/admin passwords, API keys, mobile tokens, signing keystores or payment references in source, logs, screenshots or Markdown.
- Do not use `resetAllDataKeepAdmin()` in a real Sheet. It is an editor-only maintenance tool and must never be reachable from the UI/API.
- Do not delete employee, attendance or payroll rows as a normal workflow. Preserve audit history; deactivate/void with audit instead.
- Do not assume Thai payroll/legal rules (tax, SSO, leave pay, holiday pay) without approved policy/accounting requirements.

## Next engineering sequence

1. **Freeze and review current dirty changes** — run `flutter analyze` and focused notification tests; commit only after review.
2. **Owner decides Admin platform** — Python-only vs web console; capture decision in `AI_COLLAB_BRIEF.md`.
3. **Align endpoint + Sheet** — verify selected Apps Script deployment owns the selected Sheet, then deploy local `Code.gs` and run all required initializers.
4. **UAT with a new non-production employee** — create, login, check-in, duplicate rejection, check-out, leave, OT/correction, approval and mobile status update.
5. **Financial UAT** — controlled payroll preview vs hand calculation; payroll lock snapshot; invoice Draft -> Issued -> Paid with payment reference; reject invalid transitions.
6. **Only then package** — signed APK and versioned final Admin artifact, with hash and install/start evidence.

## Required evidence before release

- Latest Apps Script deployment URL and Sheet ID confirmed by owner.
- Automated analysis/tests pass after a clean dependency install.
- Real device GPS and no-location policy both pass.
- Admin actions are visually smoke-tested, not only API-tested.
- UAT checklist records results and known limitations.
- No uncommitted source changes remain.

## 2026-11-06 — Admin Codex hardening in progress

- `admin_codex/` remains an isolated UX pilot. Its visual system is white with
  neon-green/orange accents in light mode and black with neon-green/orange
  accents in dark mode; it must not
  overwrite `admin_console/` during UAT.
- Local `apps_script/Code.gs` adds `Admin_Sessions`: normal console username/
  password login issues an HMAC-stored, revocable eight-hour session and no
  longer sends `ADMIN_API_KEY` to the browser. Master-key authentication stays
  only as a temporary legacy/recovery compatibility path.
- `admin_console_logout` revokes the current session. High-risk action audit
  attribution uses the verified session actor rather than the editable UI name.
- Local only: the Sheet owner must deploy Apps Script, then test a
  non-production Admin login, dashboard, logout, and re-use of the old session.
  Do not claim deployment or UAT is complete from static checks.
- `apps_script/contract_smoke_test.js` now executes Code.gs in an in-memory
  Apps Script shim. It proves normal login does not return the owner key,
  legacy hash migration, session revoke, and header-aware Dashboard counting.
  It is not a substitute for deployed Apps Script or real-device UAT.
- Admin roles are appended in `Admin_Users`: Owner, Manager, Operations and
  Finance. Blank legacy roles resolve to Owner to prevent lockout. API scopes,
  not the sidebar, are authoritative; editing/deleting an Admin revokes their
  active sessions. Role migration and denial behaviour remain UAT items.
- The API rejects downgrade/deactivation/deletion of the final active Owner.
  This is covered by the local contract smoke test; verify it with two
  non-production Owner accounts after deployment.
- Admin login uses Apps Script CacheService to throttle five failed attempts
  for fifteen minutes. The local contract smoke proves the intended lockout;
  deployed CacheService behaviour and expiry recovery remain UAT items.
- Codex persists the signed-in username in session storage only. When a user
  changes/deletes their own account and the server revokes the session, Codex
  logs them out intentionally instead of leaving a stale authenticated view.
- `apps_script/live_session_probe.js` is ready for the first post-deploy check.
  Run it only with a dedicated non-production Admin via environment variables.
  It verifies health, login, Dashboard access, logout and rejection of the
  old session without printing credentials. It creates only normal session and
  audit rows; it must not be treated as attendance, payroll, invoice or
  real-device UAT proof. It has been syntax-checked locally, not run against a
  deployment because the endpoint/Sheet/account alignment is owner-controlled.

## 2026-11-07 — Payroll schema and compact UI follow-up

- `Payroll_Rules` now creates/extends the `Other deduction` and `Days per
  month` columns before a rule is saved.
- `Payroll_Lines` now has one canonical append-only order: the historic
  `Created at` column remains eighth, followed by `Advance deduction`, `Net
  pay`, `SSO`, and `Other deduction`. The initializer fails safely if the
  original eight columns were manually reordered. It repairs only the
  unambiguous malformed pre-release order where a Date is found in column 10.
- The lock writer and payroll-detail reader use that same schema. The local
  contract test covers a lock/read round trip and the narrowly scoped repair.
  A selected-Sheet backup and payroll UAT are still mandatory before use.
- `admin_codex/index.html` uses a denser desktop type scale (12px body,
  smaller table/form/nav text and 23px KPI figures). Printed payslips/invoices
  intentionally retain document-readable sizing.
- Dashboard authorization is now server-enforced per data class: Operations
  receives attendance/approval measures but no invoice/payroll facts; Finance
  receives financial measures but no attendance/approval facts. Contract smoke
  checks both response shapes. The Codex dashboard does not call restricted
  detail routes or convert a rejected/failed optional request into a false zero.
- `admin_codex/run.vbs` now serves only its own folder on loopback port
  `18777`, rather than the historical `8777` port which may already be owned
  by the baseline Admin console. `run.bat` remains the user entry point.
- Employee mobile login now has a generic five-failure / fifteen-minute
  CacheService throttle keyed by a one-way HMAC of the employee ID. The local
  contract test verifies wrong-password rejection, temporary lockout and a
  post-recovery token issue; real mobile/device UAT remains outstanding.
- New/reset employee temporary passwords are now UUID-derived uppercase
  `XXXXXX-XXXXXX` values instead of eight-digit `Math.random` PINs. They are
  returned once only to the authenticated Admin; contract smoke verifies the
  non-trivial format.
- `adminActor_` no longer has any browser-controlled fallback. In particular,
  `reviewer`, `updatedBy`, and `lockedBy` cannot label an audit row; only the
  verified session identity (or fixed legacy System owner identity) can do so.
- Invoice creation now writes an audit entry, and invoice state changes use the
  shared script lock. Contract smoke covers creation audit, Draft → Issued →
  Paid, missing payment-reference rejection, stale second-payment rejection
  and lock release. Financial Sheet UAT is still mandatory.
- `invoiceFromRow_` now exposes the persisted creation timestamp to Codex, and
  printed invoices label that as the issue date instead of silently using the
  date on which a user clicked Print.
- Mobile validation refreshed: `flutter analyze` passes and the stale login
  widget test was updated from the old temporary-password label to the current
  employee-picker plus normal-password UI. `flutter test` passes locally; this
  is not a real Android/GPS/API UAT result.
