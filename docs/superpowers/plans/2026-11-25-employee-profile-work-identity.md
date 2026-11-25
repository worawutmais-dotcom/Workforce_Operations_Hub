# Employee Work Identity Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the employee APK Account tab show employment identity, profile readiness and GPS policy before account actions.

**Architecture:** Retain `_Account` as the Account-tab owner and preserve every existing dialog/callback. Add small private presentation helpers in `main.dart` so the selected Work Identity layout derives entirely from existing `name`, `id`, `role`, `profileNeedsUpdate`, and `locationRequired` fields.

**Tech Stack:** Flutter/Dart, Material 3, existing `flutter_test`.

**Spec:** `docs/superpowers/specs/2026-11-25-employee-profile-work-identity-design.md`

## Global Constraints

- Do not change `employee_profile` or `employee_identity_profile` API contracts.
- Do not alter GPS, password, advance, identity-submission or logout behavior.
- Use existing `theme.dart` tokens; do not add a new visual theme.
- Keep Thai copy direct, readable and suitable for shop employees.

## Review Focus

- Missing identity data must show a clear action, not imply that payroll or attendance is blocked; cover in the incomplete-profile widget test.
- Identity pending and identity complete must use distinct non-error status copy; cover in a status helper unit test.
- GPS-required and GPS-not-required must not look like a user-editable setting; cover both render states in the account widget test.
- Long Thai names and roles must wrap without overflow; cover with a narrow-width widget test.
- Every retained account action must still open its original flow; cover action labels and tap callbacks in the account widget test.

---

### Task 1: Extract Work Identity presentation helpers

**Files:**
- Modify: `employee_mobile/lib/main.dart:_Account`
- Test: `employee_mobile/test/widget_test.dart`

**Interfaces:**
- Consumes: existing `_Account` constructor fields.
- Produces: private `_IdentityStatus` value and `_Account` helper methods that map identity/GPS state to Thai copy and semantic colors.

- [ ] **Step 1: Write failing helper tests**

Add tests asserting incomplete profile maps to `ต้องอัปเดตข้อมูล`, complete profile maps to `ข้อมูลยืนยันแล้ว`, and both GPS modes have different text.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `C:\flutter\bin\flutter.bat test test/widget_test.dart`

Expected: FAIL because the Work Identity helpers are absent.

- [ ] **Step 3: Implement `_IdentityStatus` and mapping helpers in `_Account`**

Map `profileNeedsUpdate` to the action-needed status; map `locationRequired` to policy text only. Use `kBrand`, `kAmber`, `kDanger`, soft semantic colors and existing text tokens.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `C:\flutter\bin\flutter.bat test test/widget_test.dart`

Expected: PASS.

### Task 2: Replace Account-tab hierarchy with Work Identity layout

**Files:**
- Modify: `employee_mobile/lib/main.dart:_Account.build`
- Test: `employee_mobile/test/widget_test.dart`

**Interfaces:**
- Consumes: Task 1 status helpers and existing callbacks `_identityDialog`, `_advanceDialog`, `_changePasswordDialog`, `_requestResetDialog`, `onLogout`.
- Produces: responsive Work Identity Account screen.

- [ ] **Step 1: Write failing widget tests**

Render `_Account` through the existing application flow and assert presence of identity header, account status, profile status, GPS policy, and all retained action labels at a 360 px test width.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `C:\flutter\bin\flutter.bat test test/widget_test.dart`

Expected: FAIL because the Work Identity structure and copy are absent.

- [ ] **Step 3: Implement the hierarchy in `_Account.build`**

Render: identity header; two status cards; an informational GPS policy surface; grouped action rows; isolated destructive logout. Retain existing navigation callbacks unchanged.

- [ ] **Step 4: Run account widget tests to verify it passes**

Run: `C:\flutter\bin\flutter.bat test test/widget_test.dart`

Expected: PASS with no overflow exceptions.

### Task 3: Verify Flutter quality and release artifact

**Files:**
- Modify: `employee_mobile/lib/main.dart`, `employee_mobile/test/widget_test.dart`

**Interfaces:**
- Consumes: completed Work Identity layout.
- Produces: analyzed and release-built APK artifact.

- [ ] **Step 1: Run static analysis**

Run: `C:\flutter\bin\flutter.bat analyze`

Expected: no new diagnostics.

- [ ] **Step 2: Run the complete test suite**

Run: `C:\flutter\bin\flutter.bat test`

Expected: PASS.

- [ ] **Step 3: Build the release APK**

Run: `C:\flutter\bin\flutter.bat build apk --release`

Expected: APK at `employee_mobile/build/app/outputs/flutter-apk/app-release.apk`.

- [ ] **Step 4: Commit implementation and tests**

Run: `git add employee_mobile/lib/main.dart employee_mobile/test/widget_test.dart docs/superpowers/specs/2026-11-25-employee-profile-work-identity-design.md docs/superpowers/plans/2026-11-25-employee-profile-work-identity.md && git commit -m "feat: redesign employee work identity profile"`

## Self-review

- Spec coverage: Tasks 1–2 cover identity, readiness, GPS policy, normal actions and isolated logout; Task 3 verifies delivery.
- API/GPS behavior: no backend or callback contract changes are planned.
- Main risk: rendering private `_Account` directly is awkward; tests will exercise it through the application shell or extract a public testable widget only if required by Flutter visibility rules.
