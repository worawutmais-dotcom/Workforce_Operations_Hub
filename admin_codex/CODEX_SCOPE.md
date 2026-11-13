# Admin Codex — Scope

## Purpose

An isolated UX version of the BVN Package Admin Console. It is the workspace
for simplifying daily operations without changing `admin_console`.

## Current scope

- Today: attendance, exceptional Admin check-in/out, pending approvals.
- People: employee creation, access policy, password reset and pay rules.
- Payroll and documents: review, lock, payslip and invoice workflows.
- This folder reuses the Apps Script API only; it does not contain secrets.

## Release boundary

`admin_codex` must pass browser UAT against a non-production employee before it
replaces or is merged back into `admin_console`. No APK, EXE, Apps Script deploy
or Google Sheet write has been performed merely by creating this version.
