# BVN Package — System Design Plan

## North star

One internally consistent system for a small Thai business: an Admin creates a worker, the system assigns the employee ID and temporary password, the worker activates on a phone, records time according to an Admin-defined location policy, and Admin can approve time/leave/OT before calculating a reviewable payroll period.

## Product boundaries

- Windows Python Admin is the only Admin interface.
- Android employee app has no Admin functions and never receives an Admin secret.
- Google Sheets remains the temporary audit datastore; Apps Script is its sole writer.
- A temporary password is shown to Admin only at creation/reset. Current passwords are never readable.
- Payroll output remains a pre-tax/payroll preview until statutory rules, accountant approval, and legal validation are explicitly implemented.

## Canonical flow

```text
Admin creates employee (name, role, site, location policy, pay policy)
→ API allocates EMP-xxxx + temporary password
→ Admin gives credentials to worker
→ worker chooses own active name + enters password
→ API binds secure mobile session
→ attendance / leave requests
→ Admin reviews exceptions, leave and OT
→ payroll preview from locked period
→ Admin approves/export; no silent payment action
```

## Invariants

1. Employee IDs are API-generated and immutable after creation.
2. Password hashes only; no current plaintext password, logs, or Sheets value.
3. Every API write needs authenticated Admin or authenticated employee session.
4. Location policy is checked server-side, not trusted from the phone UI.
5. Attendance records, pay rules and approvals are append-only/audited where feasible.
6. Every screen identifies Live vs Demo. Demo values cannot masquerade as business truth.

## Decisions

Decision: Select name plus password for employee activation, not ID plus Device Token.
Reason: matches a non-technical user while retaining server-issued mobile session.
Source: user feedback and current screenshot mismatch.
Invalidates if: a stronger identity method (SSO, biometric identity provider) is introduced.

Decision: Admin can reset a temporary password but cannot view an existing password.
Reason: satisfies operational recovery without storing plaintext credentials.
Source: security boundary.
Invalidates if: business accepts an audited external identity provider.

Decision: Payroll is separated into pay-rule capture, calculation preview, approval, and payment export.
Reason: avoids treating a UI total as payroll truth.
Source: current implementation audit.
Invalidates if: a compliant payroll provider replaces in-house calculations.

## Risks and non-goals

- No production claim until a real Android device completes login, location-required attendance, no-location attendance, leave and Admin readback.
- Thai statutory tax/SSO/withholding cannot be assumed; the product will not calculate or pay statutory deductions in this release.
- Public employee-directory access is a privacy risk; it must return only minimal active-name/ID data and later be replaced with invitation/QR activation if exposure becomes unacceptable.
