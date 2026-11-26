# Employee Mobile Option 3 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task.

**Goal:** Apply the Option 3 Operational Calm visual system to the employee APK while leaving administrator systems, records, API contracts, and database state unchanged.

**Architecture:** Centralise the visual system in `theme.dart`, then consume it from the Flutter shell and the two remaining gradient panels. Verify global contracts with widget tests rather than changing any backend behaviour.

**Tech Stack:** Flutter/Dart, Material 3, existing widget tests, Android release build.

**Spec:** `docs/superpowers/specs/2026-11-26-employee-mobile-option-3-design.md`

## Global Constraints

- Touch only `employee_mobile` source, its tests, and this documentation.
- Never modify administrator users, demo employee records, Supabase state, or `admin_codex`.
- Preserve API, authentication, GPS, attendance, payroll, and update behaviour.
- Do not publish a forced-update version as part of this visual-only build.

## Review Focus

- Look for unintended behaviour/API changes.
- Ensure theme values resolve correctly for Material state properties.
- Ensure no gradient/shadow remains in the changed shared visual surfaces.
- Ensure the compact button sizes remain tap-usable.

---

### Task 1: Establish the shared visual contract

**Files:**
- Modify: `employee_mobile/test/widget_test.dart`
- Modify: `employee_mobile/lib/theme.dart`

1. Add a focused widget/unit test for the Option 3 chrome geometry and colours.
2. Run the focused test and observe it fail because the existing theme is white-header/56 px controls.
3. Implement the central theme tokens: deep-navy header, flat white chrome, 44 px buttons, 62 px navigation, and compact radii.
4. Re-run the focused test and then the full Flutter test suite.

### Task 2: Apply the visual system to app surfaces

**Files:**
- Modify: `employee_mobile/lib/main.dart`
- Modify: `employee_mobile/test/widget_test.dart` only if a rendered contract needs coverage

1. Add/extend a test first for the dark app-bar brand mark and solid (not gradient) visual convention where it can be asserted safely.
2. Run the focused test and observe it fail before implementation.
3. Update the app shell, brand mark, bottom navigation sizing, attendance action height, calendar summary, and profile hero to consume the new system.
4. Run Flutter tests and analyse the code.

### Task 3: Package and verify the APK

**Files:**
- Modify: `employee_mobile/pubspec.yaml` only if a new local release build requires a version increment

1. Run the full test suite and static analysis.
2. Build the release APK.
3. Inspect its Android manifest version and report that it has not been published to backend update settings.
4. Review the change range for scope compliance and commit only the APK/mobile/doc files.
